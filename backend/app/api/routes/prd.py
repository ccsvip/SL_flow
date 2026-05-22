"""PRD (Product Requirement Document) routes.

Surface area:

  GET    /prd/templates                           - list built-in templates
  GET    /prd/documents                           - paginated list (mine + mine-or-all)
  POST   /prd/documents                           - generate a new PRD via AI (one-shot)
  GET    /prd/documents/{id}                     - full document with requirements
  PATCH  /prd/documents/{id}                     - manual edit (title/body/status/...)
  DELETE /prd/documents/{id}                     - delete (creator or admin)
  POST   /prd/documents/{id}/regenerate          - re-run AI on the same source
  POST   /prd/documents/{id}/sections/regenerate - regenerate ONE section in-place
  POST   /prd/documents/{id}/extract             - re-extract requirement pool from current body
  POST   /prd/documents/{id}/convert-to-stories  - convert N requirements -> Story rows
  POST   /prd/documents/{id}/requirements        - add a requirement manually
  PATCH  /prd/requirements/{rid}                 - edit one requirement
  DELETE /prd/requirements/{rid}                 - delete one requirement
  GET    /prd/documents/{id}/export              - export as markdown / html
"""
from __future__ import annotations

import logging
import re
from typing import List

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.core.ai import (
    AIDisabledError,
    AIRequestError,
    is_enabled,
    load_runtime,
)
from app.core.audit import record_audit
from app.core.prd_generator import (
    GeneratedRequirement,
    build_blank_skeleton,
    generate_full_prd,
    reextract_requirements,
    regenerate_section,
)
from app.core.prd_templates import get_template, list_templates
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.prd import (
    PRDDocument,
    PRDPriority,
    PRDRequirement,
    PRDSourceType,
    PRDStatus,
)
from app.models.story import Story, StoryPriority, StoryStatus
from app.models.user import UserRole
from app.schemas.prd import (
    PRDConvertRequest,
    PRDConvertResult,
    PRDDocumentOut,
    PRDDocumentSummary,
    PRDDocumentUpdate,
    PRDGenerateRequest,
    PRDReextractResult,
    PRDRegenerateRequest,
    PRDRequirementCreate,
    PRDRequirementOut,
    PRDRequirementUpdate,
    PRDSectionRegenerateRequest,
    PRDSectionRegenerateResult,
    PRDTemplateOut,
    PRDTemplateSection,
)

logger = logging.getLogger("slflow.prd.routes")

router = APIRouter(prefix="/prd", tags=["prd"])


# Map our 4-level prd priority -> story priority. They share the enum
# names today so the cast is trivial; we keep the indirection so that
# changing one enum later doesn't silently break the other.
_PRD_TO_STORY_PRIORITY = {
    PRDPriority.low: StoryPriority.low,
    PRDPriority.medium: StoryPriority.medium,
    PRDPriority.high: StoryPriority.high,
    PRDPriority.urgent: StoryPriority.urgent,
}


# ============================================================================
# Templates
# ============================================================================


@router.get("/templates", response_model=List[PRDTemplateOut])
async def list_prd_templates(_: CurrentUser) -> List[PRDTemplateOut]:
    out: List[PRDTemplateOut] = []
    for spec in list_templates():
        out.append(
            PRDTemplateOut(
                template=spec.template,
                label=spec.label,
                description=spec.description,
                tone=spec.tone,
                sections=[
                    PRDTemplateSection(slug=s[0], title=s[1], hint=s[2])
                    for s in spec.sections
                ],
            )
        )
    return out


# ============================================================================
# Helpers
# ============================================================================


async def _requirement_count(db, document_id: int) -> int:
    return (
        await db.execute(
            select(func.count(PRDRequirement.id)).where(
                PRDRequirement.document_id == document_id
            )
        )
    ).scalar_one()


def _to_summary(doc: PRDDocument, req_count: int) -> PRDDocumentSummary:
    out = PRDDocumentSummary.model_validate(doc)
    out.requirement_count = req_count
    return out


def _to_full(doc: PRDDocument, reqs: List[PRDRequirement]) -> PRDDocumentOut:
    """Decorate a doc with requirement count + body + sorted requirements."""
    out = PRDDocumentOut.model_validate(doc)
    out.content = doc.content or ""
    out.source_input = doc.source_input
    out.requirement_count = len(reqs)
    out.requirements = [PRDRequirementOut.model_validate(r) for r in reqs]
    return out


async def _load_doc_or_404(db, doc_id: int) -> PRDDocument:
    doc = await db.get(PRDDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="PRD 文档不存在")
    return doc


def _ensure_can_mutate(doc: PRDDocument, user) -> None:
    if doc.creator_id != user.id and user.role != UserRole.admin:
        raise HTTPException(
            status_code=403, detail="只有创建者或管理员可以修改这份 PRD"
        )


def _persist_requirements(
    db,
    doc: PRDDocument,
    items: List[GeneratedRequirement],
    *,
    starting_index: int = 0,
) -> List[PRDRequirement]:
    rows: List[PRDRequirement] = []
    for i, item in enumerate(items):
        row = PRDRequirement(
            document_id=doc.id,
            order_index=starting_index + i,
            title=item.title,
            description=item.description,
            acceptance_criteria=item.acceptance_criteria,
            priority=item.priority,
            category=item.category,
            tag=item.tag,
        )
        db.add(row)
        rows.append(row)
    return rows


# ============================================================================
# Documents - list / get / generate / update / delete
# ============================================================================


@router.get("/documents", response_model=List[PRDDocumentSummary])
async def list_documents(
    db: DBSession,
    user: CurrentUser,
    q: str | None = Query(default=None, description="按标题模糊搜索"),
    template: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    project_id: int | None = Query(default=None),
    mine: bool = Query(default=False, description="只看我创建的"),
) -> List[PRDDocumentSummary]:
    stmt = select(PRDDocument).order_by(PRDDocument.created_at.desc())
    if q:
        stmt = stmt.where(PRDDocument.title.ilike(f"%{q}%"))
    if template:
        stmt = stmt.where(PRDDocument.template == template)
    if status_filter:
        stmt = stmt.where(PRDDocument.status == status_filter)
    if project_id is not None:
        stmt = stmt.where(PRDDocument.project_id == project_id)
    if mine:
        stmt = stmt.where(PRDDocument.creator_id == user.id)

    rows = (await db.execute(stmt)).scalars().unique().all()
    if not rows:
        return []

    # Bulk-count requirements so we don't N+1.
    counts_rows = (
        await db.execute(
            select(PRDRequirement.document_id, func.count(PRDRequirement.id))
            .where(PRDRequirement.document_id.in_([d.id for d in rows]))
            .group_by(PRDRequirement.document_id)
        )
    ).all()
    counts = {did: cnt for did, cnt in counts_rows}

    return [_to_summary(d, counts.get(d.id, 0)) for d in rows]


@router.get("/documents/{doc_id}", response_model=PRDDocumentOut)
async def get_document(
    doc_id: int, db: DBSession, _: CurrentUser
) -> PRDDocumentOut:
    doc = await _load_doc_or_404(db, doc_id)
    reqs = (
        await db.execute(
            select(PRDRequirement)
            .where(PRDRequirement.document_id == doc.id)
            .order_by(PRDRequirement.order_index.asc(), PRDRequirement.id.asc())
        )
    ).scalars().unique().all()
    return _to_full(doc, list(reqs))


def _normalize_project_code(raw: str | None) -> str | None:
    if not raw:
        return None
    norm = re.sub(r"[^A-Z0-9_-]", "", raw.upper())
    return norm[:32] or None


@router.post(
    "/documents",
    response_model=PRDDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def generate_document(
    payload: PRDGenerateRequest,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> PRDDocumentOut:
    spec = get_template(payload.template)

    # `manual` source type: build a blank skeleton with section markers and
    # the user's pasted draft as content. No LLM call - this is the
    # "我自己写" path and the wizard copy explicitly promises AI won't run.
    if payload.source_type == PRDSourceType.manual:
        title = (payload.title or f"{spec.label} 草稿")[:255]
        skeleton = build_blank_skeleton(payload.template)
        # If the user pasted a draft, prepend it before the skeleton so they
        # can see both their text AND the section structure to fill in. If
        # not, just give them the skeleton.
        if payload.source_input:
            content = payload.source_input.strip() + "\n\n" + skeleton
        else:
            content = skeleton

        doc = PRDDocument(
            title=title,
            template=payload.template,
            source_type=payload.source_type,
            source_input=payload.source_input,
            status=PRDStatus.draft,
            content=content,
            project_id=payload.project_id,
            creator_id=user.id,
            generated_model=None,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

        await record_audit(
            db,
            actor=user,
            action=AuditAction.create,
            target_type=AuditTargetType.prd,
            target_id=doc.id,
            target_label=doc.title,
            request=request,
            status_code=201,
            extra={
                "template": payload.template.value,
                "source_type": payload.source_type.value,
                "manual": True,
            },
        )
        return _to_full(doc, [])

    # AI-driven path: requires the AI feature to be configured.
    rt = await load_runtime(db)
    if not is_enabled(rt):
        raise HTTPException(
            status_code=503,
            detail="AI 功能未启用。请先在「AI 设置」配置后再生成 PRD。",
        )

    try:
        result = await generate_full_prd(
            rt,
            template=payload.template,
            source_type=payload.source_type,
            source_input=payload.source_input,
            extra_instruction=payload.extra_instruction,
        )
    except AIDisabledError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    title = (payload.title or result.title or "未命名 PRD")[:255]

    doc = PRDDocument(
        title=title,
        template=payload.template,
        source_type=payload.source_type,
        source_input=payload.source_input,
        status=PRDStatus.ready,
        content=result.content,
        suggested_project_name=result.suggested_project_name,
        suggested_project_code=_normalize_project_code(
            result.suggested_project_code
        ),
        summary=result.summary or None,
        project_id=payload.project_id,
        creator_id=user.id,
        generated_model=rt.model,
        last_generation_truncated=result.truncated,
    )
    db.add(doc)
    await db.flush()

    rows = _persist_requirements(db, doc, result.requirements)

    await db.commit()
    await db.refresh(doc)
    for r in rows:
        await db.refresh(r)

    await record_audit(
        db,
        actor=user,
        action=AuditAction.create,
        target_type=AuditTargetType.prd,
        target_id=doc.id,
        target_label=doc.title,
        request=request,
        status_code=201,
        extra={
            "template": payload.template.value,
            "source_type": payload.source_type.value,
            "requirements_count": len(rows),
            "truncated": result.truncated,
        },
    )

    return _to_full(doc, rows)


@router.patch("/documents/{doc_id}", response_model=PRDDocumentOut)
async def update_document(
    doc_id: int,
    payload: PRDDocumentUpdate,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> PRDDocumentOut:
    doc = await _load_doc_or_404(db, doc_id)
    _ensure_can_mutate(doc, user)

    data = payload.model_dump(exclude_unset=True)
    if "suggested_project_code" in data:
        data["suggested_project_code"] = _normalize_project_code(
            data["suggested_project_code"]
        )

    # When the user edits the body, they're working with a *clean* view
    # that has section markers stripped (see PRDDetailPage edit mode).
    # We re-inject markers here by heading-match before persisting so
    # per-section regenerate continues to work.
    if "content" in data and isinstance(data["content"], str):
        from app.core.prd_generator import _ensure_markers

        spec = get_template(doc.template)
        data["content"] = _ensure_markers(data["content"], spec)

    changed: List[str] = []
    for k, v in data.items():
        if getattr(doc, k) != v:
            setattr(doc, k, v)
            changed.append(k)

    await db.commit()
    await db.refresh(doc)

    if changed:
        await record_audit(
            db,
            actor=user,
            action=AuditAction.update,
            target_type=AuditTargetType.prd,
            target_id=doc.id,
            target_label=doc.title,
            request=request,
            status_code=200,
            extra={"changed": changed},
        )

    reqs = (
        await db.execute(
            select(PRDRequirement)
            .where(PRDRequirement.document_id == doc.id)
            .order_by(PRDRequirement.order_index.asc(), PRDRequirement.id.asc())
        )
    ).scalars().unique().all()
    return _to_full(doc, list(reqs))


@router.delete(
    "/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_document(
    doc_id: int, db: DBSession, user: CurrentUser, request: Request
):
    doc = await _load_doc_or_404(db, doc_id)
    _ensure_can_mutate(doc, user)
    did = doc.id
    label = doc.title
    await db.delete(doc)
    await db.commit()
    await record_audit(
        db,
        actor=user,
        action=AuditAction.delete,
        target_type=AuditTargetType.prd,
        target_id=did,
        target_label=label,
        request=request,
        status_code=204,
    )


# ============================================================================
# Regenerate full doc / one section
# ============================================================================


@router.post(
    "/documents/{doc_id}/regenerate", response_model=PRDDocumentOut
)
async def regenerate_document(
    doc_id: int,
    payload: PRDRegenerateRequest,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> PRDDocumentOut:
    doc = await _load_doc_or_404(db, doc_id)
    _ensure_can_mutate(doc, user)

    rt = await load_runtime(db)
    if not is_enabled(rt):
        raise HTTPException(status_code=503, detail="AI 功能未启用")

    try:
        result = await generate_full_prd(
            rt,
            template=doc.template,
            source_type=doc.source_type,
            source_input=doc.source_input or "",
            extra_instruction=payload.extra_instruction,
        )
    except AIDisabledError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    doc.content = result.content
    if result.summary:
        doc.summary = result.summary
    if result.suggested_project_name:
        doc.suggested_project_name = result.suggested_project_name
    if result.suggested_project_code:
        doc.suggested_project_code = _normalize_project_code(
            result.suggested_project_code
        )
    doc.generated_model = rt.model
    doc.last_generation_truncated = result.truncated
    doc.status = PRDStatus.ready

    # Replace requirement pool wholesale - the user can fall back to the
    # previous version via Audit Log if needed.
    existing = (
        await db.execute(
            select(PRDRequirement).where(PRDRequirement.document_id == doc.id)
        )
    ).scalars().unique().all()
    for r in existing:
        await db.delete(r)
    await db.flush()

    rows = _persist_requirements(db, doc, result.requirements)

    await db.commit()
    await db.refresh(doc)
    for r in rows:
        await db.refresh(r)

    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.prd,
        target_id=doc.id,
        target_label=doc.title,
        request=request,
        status_code=200,
        extra={
            "regenerated": True,
            "requirements_count": len(rows),
            "truncated": result.truncated,
        },
    )

    return _to_full(doc, rows)


@router.post(
    "/documents/{doc_id}/sections/regenerate",
    response_model=PRDSectionRegenerateResult,
)
async def regenerate_one_section(
    doc_id: int,
    payload: PRDSectionRegenerateRequest,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> PRDSectionRegenerateResult:
    doc = await _load_doc_or_404(db, doc_id)
    _ensure_can_mutate(doc, user)

    rt = await load_runtime(db)
    if not is_enabled(rt):
        raise HTTPException(status_code=503, detail="AI 功能未启用")

    try:
        new_content = await regenerate_section(
            rt,
            template=doc.template,
            section_slug=payload.section_slug,
            current_content=doc.content or "",
            extra_instruction=payload.extra_instruction,
        )
    except AIDisabledError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    doc.content = new_content
    await db.commit()
    await db.refresh(doc)

    # Pull just the regenerated body for the FE animation.
    from app.core.prd_generator import get_section_body

    new_body = get_section_body(new_content, payload.section_slug) or ""

    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.prd,
        target_id=doc.id,
        target_label=doc.title,
        request=request,
        status_code=200,
        extra={"section_regenerated": payload.section_slug},
    )

    return PRDSectionRegenerateResult(
        section_slug=payload.section_slug,
        new_section_body=new_body,
        new_content=new_content,
    )


# ============================================================================
# Re-extract requirement pool
# ============================================================================


@router.post(
    "/documents/{doc_id}/extract", response_model=PRDReextractResult
)
async def extract_requirements_route(
    doc_id: int,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> PRDReextractResult:
    doc = await _load_doc_or_404(db, doc_id)
    _ensure_can_mutate(doc, user)

    rt = await load_runtime(db)
    if not is_enabled(rt):
        raise HTTPException(status_code=503, detail="AI 功能未启用")

    try:
        new_items = await reextract_requirements(rt, content=doc.content or "")
    except AIDisabledError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Replace the pool but preserve existing converted_story_id linkage
    # by title match - so a user who hand-converted some rows won't lose
    # the badge after re-extract.
    existing = (
        await db.execute(
            select(PRDRequirement).where(PRDRequirement.document_id == doc.id)
        )
    ).scalars().unique().all()
    title_to_story_id = {
        r.title.strip().lower(): r.converted_story_id
        for r in existing
        if r.converted_story_id
    }
    for r in existing:
        await db.delete(r)
    await db.flush()

    rows: List[PRDRequirement] = []
    for i, item in enumerate(new_items):
        row = PRDRequirement(
            document_id=doc.id,
            order_index=i,
            title=item.title,
            description=item.description,
            acceptance_criteria=item.acceptance_criteria,
            priority=item.priority,
            category=item.category,
            tag=item.tag,
            converted_story_id=title_to_story_id.get(item.title.strip().lower()),
        )
        db.add(row)
        rows.append(row)

    await db.commit()
    for r in rows:
        await db.refresh(r)

    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.prd,
        target_id=doc.id,
        target_label=doc.title,
        request=request,
        status_code=200,
        extra={"reextracted": True, "count": len(rows)},
    )

    return PRDReextractResult(
        requirements=[PRDRequirementOut.model_validate(r) for r in rows]
    )


# ============================================================================
# Convert requirements -> stories
# ============================================================================


@router.post(
    "/documents/{doc_id}/convert-to-stories",
    response_model=PRDConvertResult,
)
async def convert_to_stories(
    doc_id: int,
    payload: PRDConvertRequest,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> PRDConvertResult:
    doc = await _load_doc_or_404(db, doc_id)
    _ensure_can_mutate(doc, user)

    # Validate target project exists.
    from app.models.project import Project

    project = await db.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="目标项目不存在")

    stmt = select(PRDRequirement).where(PRDRequirement.document_id == doc.id)
    if payload.requirement_ids:
        stmt = stmt.where(PRDRequirement.id.in_(payload.requirement_ids))
    stmt = stmt.order_by(PRDRequirement.order_index.asc())

    rows = (await db.execute(stmt)).scalars().unique().all()
    if not rows:
        raise HTTPException(status_code=400, detail="没有可转换的需求")

    created_ids: List[int] = []
    skipped: List[int] = []

    for r in rows:
        if r.converted_story_id is not None:
            skipped.append(r.id)
            continue
        # Fold acceptance + description into the description field if no
        # dedicated story column for it - we keep them separate when
        # possible since Story has its own acceptance_criteria column.
        story = Story(
            title=r.title[:255],
            description=r.description or None,
            acceptance_criteria=r.acceptance_criteria or None,
            status=StoryStatus.draft,
            priority=_PRD_TO_STORY_PRIORITY.get(r.priority, StoryPriority.medium),
            estimate_points=0,
            project_id=payload.project_id,
            creator_id=user.id,
        )
        db.add(story)
        await db.flush()
        r.converted_story_id = story.id
        created_ids.append(story.id)

    # If the doc didn't already have a project binding, opportunistically
    # remember which project these stories went to - improves the list
    # page UX without surprising anyone (it's still editable).
    if doc.project_id is None and created_ids:
        doc.project_id = payload.project_id

    await db.commit()

    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.prd,
        target_id=doc.id,
        target_label=doc.title,
        request=request,
        status_code=200,
        extra={
            "converted_to_stories": created_ids,
            "skipped_already_converted": skipped,
            "project_id": payload.project_id,
        },
    )

    return PRDConvertResult(
        created_story_ids=created_ids, skipped_requirement_ids=skipped
    )


# ============================================================================
# Manual CRUD on individual requirements (the FE inline-edit panel)
# ============================================================================


@router.post(
    "/documents/{doc_id}/requirements",
    response_model=PRDRequirementOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_requirement(
    doc_id: int,
    payload: PRDRequirementCreate,
    db: DBSession,
    user: CurrentUser,
) -> PRDRequirementOut:
    doc = await _load_doc_or_404(db, doc_id)
    _ensure_can_mutate(doc, user)

    if payload.order_index is None:
        next_idx = (
            await db.execute(
                select(func.coalesce(func.max(PRDRequirement.order_index), -1) + 1).where(
                    PRDRequirement.document_id == doc_id
                )
            )
        ).scalar_one()
    else:
        next_idx = payload.order_index

    row = PRDRequirement(
        document_id=doc_id,
        order_index=next_idx,
        title=payload.title,
        description=payload.description,
        acceptance_criteria=payload.acceptance_criteria,
        priority=payload.priority,
        category=payload.category,
        tag=payload.tag,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return PRDRequirementOut.model_validate(row)


@router.patch(
    "/requirements/{req_id}", response_model=PRDRequirementOut
)
async def update_requirement(
    req_id: int,
    payload: PRDRequirementUpdate,
    db: DBSession,
    user: CurrentUser,
) -> PRDRequirementOut:
    row = await db.get(PRDRequirement, req_id)
    if row is None:
        raise HTTPException(status_code=404, detail="需求不存在")
    doc = await db.get(PRDDocument, row.document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="所属 PRD 不存在")
    _ensure_can_mutate(doc, user)

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return PRDRequirementOut.model_validate(row)


@router.delete(
    "/requirements/{req_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_requirement(
    req_id: int, db: DBSession, user: CurrentUser
):
    row = await db.get(PRDRequirement, req_id)
    if row is None:
        raise HTTPException(status_code=404, detail="需求不存在")
    doc = await db.get(PRDDocument, row.document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="所属 PRD 不存在")
    _ensure_can_mutate(doc, user)
    await db.delete(row)
    await db.commit()


# ============================================================================
# Export (markdown / html)
# ============================================================================


def _markdown_to_html_simple(md: str) -> str:
    """Tiny markdown->html converter sufficient for browser preview/print.

    We deliberately avoid pulling a full markdown library into the
    backend dependency tree - the frontend already renders rich markdown,
    and the export endpoint is for "save to disk / print" rather than
    interactive editing. The output is wrapped in a basic HTML document
    with print-friendly CSS so the user can `Ctrl+P -> save as PDF`.
    """
    # Strip our internal section markers (HTML comments) - they'd render
    # invisible anyway, but cleaner to remove them.
    md = re.sub(r"<!--\s*prd:section:(start|end):[^>]*-->\n?", "", md)

    lines = md.split("\n")
    out: List[str] = []
    in_code = False
    in_list = False
    list_kind = ""
    in_table = False
    table_rows: List[List[str]] = []

    def flush_list():
        nonlocal in_list, list_kind
        if in_list:
            out.append(f"</{list_kind}>")
            in_list = False
            list_kind = ""

    def flush_table():
        nonlocal in_table, table_rows
        if in_table and table_rows:
            out.append("<table><thead><tr>")
            for cell in table_rows[0]:
                out.append(f"<th>{_inline(cell)}</th>")
            out.append("</tr></thead><tbody>")
            for row in table_rows[2:]:  # skip the alignment row
                out.append("<tr>")
                for cell in row:
                    out.append(f"<td>{_inline(cell)}</td>")
                out.append("</tr>")
            out.append("</tbody></table>")
        in_table = False
        table_rows = []

    def _esc(s: str) -> str:
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

    def _inline(s: str) -> str:
        s = _esc(s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", s)
        s = re.sub(
            r"\[([^\]]+)\]\(([^)]+)\)",
            r'<a href="\2" target="_blank" rel="noreferrer">\1</a>',
            s,
        )
        return s

    for raw in lines:
        line = raw.rstrip()

        if line.startswith("```"):
            flush_list()
            flush_table()
            if not in_code:
                lang = line[3:].strip()
                out.append(
                    f'<pre class="lang-{_esc(lang)}"><code>'
                    if lang
                    else "<pre><code>"
                )
                in_code = True
            else:
                out.append("</code></pre>")
                in_code = False
            continue

        if in_code:
            out.append(_esc(line))
            continue

        # Tables: a row is `| a | b |` and the second row is `| --- | --- |`.
        if line.startswith("|") and line.endswith("|") and "|" in line[1:-1]:
            flush_list()
            cells = [c.strip() for c in line.strip("|").split("|")]
            table_rows.append(cells)
            in_table = True
            continue
        elif in_table:
            flush_table()

        if line.startswith("# "):
            flush_list()
            out.append(f"<h1>{_inline(line[2:])}</h1>")
            continue
        if line.startswith("## "):
            flush_list()
            out.append(f"<h2>{_inline(line[3:])}</h2>")
            continue
        if line.startswith("### "):
            flush_list()
            out.append(f"<h3>{_inline(line[4:])}</h3>")
            continue
        if line.startswith("#### "):
            flush_list()
            out.append(f"<h4>{_inline(line[5:])}</h4>")
            continue

        if re.match(r"^\s*[-*]\s+", line):
            if not in_list or list_kind != "ul":
                flush_list()
                out.append("<ul>")
                in_list = True
                list_kind = "ul"
            content = re.sub(r"^\s*[-*]\s+", "", line)
            out.append(f"<li>{_inline(content)}</li>")
            continue

        if re.match(r"^\s*\d+\.\s+", line):
            if not in_list or list_kind != "ol":
                flush_list()
                out.append("<ol>")
                in_list = True
                list_kind = "ol"
            content = re.sub(r"^\s*\d+\.\s+", "", line)
            out.append(f"<li>{_inline(content)}</li>")
            continue

        if line.strip() == "":
            flush_list()
            out.append("")
            continue

        flush_list()
        out.append(f"<p>{_inline(line)}</p>")

    flush_list()
    flush_table()
    if in_code:
        out.append("</code></pre>")

    body = "\n".join(out)

    return f"""<!DOCTYPE html>
<html lang=\"zh-CN\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>PRD 导出</title>
  <style>
    :root {{ color-scheme: light dark; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif;
      line-height: 1.7;
      max-width: 960px;
      margin: 40px auto;
      padding: 0 24px;
      color: #1f2933;
    }}
    h1 {{ font-size: 28px; border-bottom: 2px solid #1677ff; padding-bottom: 8px; }}
    h2 {{ font-size: 22px; margin-top: 36px; padding-left: 10px; border-left: 4px solid #1677ff; }}
    h3 {{ font-size: 17px; margin-top: 24px; }}
    code {{ background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 90%; }}
    pre {{ background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow: auto; }}
    pre code {{ background: transparent; color: inherit; padding: 0; }}
    table {{ border-collapse: collapse; width: 100%; margin: 12px 0; }}
    th, td {{ border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; vertical-align: top; }}
    th {{ background: #f3f4f6; }}
    blockquote {{ border-left: 4px solid #d1d5db; padding-left: 12px; color: #6b7280; }}
    @media print {{
      body {{ margin: 0; max-width: none; padding: 12mm; }}
      h2 {{ page-break-after: avoid; }}
    }}
  </style>
</head>
<body>
{body}
</body>
</html>
"""


@router.get("/documents/{doc_id}/export")
async def export_document(
    doc_id: int,
    db: DBSession,
    _: CurrentUser,
    fmt: str = Query(default="markdown", pattern="^(markdown|html)$"),
):
    doc = await _load_doc_or_404(db, doc_id)
    raw_title = re.sub(r"[\\/:*?\"<>|]", "_", doc.title)[:80] or "prd"
    body = doc.content or ""

    # HTTP headers must be latin-1 safe. Build a CD header with an ASCII
    # `filename=` (so old browsers get *something*) plus the canonical
    # `filename*=UTF-8''...` (RFC 5987) carrying the original UTF-8 title.
    from urllib.parse import quote

    ascii_fallback = re.sub(r"[^A-Za-z0-9._-]+", "_", raw_title).strip("_")
    if not ascii_fallback:
        ascii_fallback = f"prd-{doc.id}"
    ext = "md" if fmt == "markdown" else "html"
    encoded_title = quote(raw_title, safe="")
    content_disposition = (
        f'attachment; filename="{ascii_fallback}.{ext}"; '
        f"filename*=UTF-8''{encoded_title}.{ext}"
    )

    if fmt == "html":
        html = _markdown_to_html_simple(body)
        return Response(
            content=html,
            media_type="text/html; charset=utf-8",
            headers={"Content-Disposition": content_disposition},
        )

    md_body = re.sub(
        r"<!--\s*prd:section:(start|end):[^>]*-->\n?", "", body
    )
    return Response(
        content=md_body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": content_disposition},
    )

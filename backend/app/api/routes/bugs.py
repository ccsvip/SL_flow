from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.core.audit import record_audit
from app.models.attachment import Attachment, AttachmentTarget
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.bug import Bug
from app.schemas.bug import BugCreate, BugOut, BugUpdate

router = APIRouter(prefix="/bugs", tags=["bugs"])


async def _attachment_counts(db, target_ids: list[int]) -> dict[int, int]:
    """Bulk count attachments for bugs. See tasks._attachment_counts."""
    if not target_ids:
        return {}
    rows = (
        await db.execute(
            select(Attachment.target_id, func.count(Attachment.id))
            .where(
                Attachment.target_type == AttachmentTarget.bug,
                Attachment.target_id.in_(target_ids),
            )
            .group_by(Attachment.target_id)
        )
    ).all()
    return {tid: cnt for tid, cnt in rows}


def _bug_to_out(b: Bug, counts: dict[int, int]) -> BugOut:
    out = BugOut.model_validate(b)
    out.attachment_count = counts.get(b.id, 0)
    return out


@router.get("", response_model=list[BugOut])
async def list_bugs(
    db: DBSession,
    _: CurrentUser,
    project_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    severity: str | None = Query(default=None),
    assignee_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[BugOut]:
    stmt = select(Bug).order_by(Bug.created_at.desc())
    if project_id is not None:
        stmt = stmt.where(Bug.project_id == project_id)
    if status_filter:
        stmt = stmt.where(Bug.status == status_filter)
    if severity:
        stmt = stmt.where(Bug.severity == severity)
    if assignee_id is not None:
        stmt = stmt.where(Bug.assignee_id == assignee_id)
    if q:
        stmt = stmt.where(Bug.title.ilike(f"%{q}%"))
    rows = (await db.execute(stmt)).scalars().unique().all()
    counts = await _attachment_counts(db, [b.id for b in rows])
    return [_bug_to_out(b, counts) for b in rows]


@router.get("/{bug_id}", response_model=BugOut)
async def get_bug(bug_id: int, db: DBSession, _: CurrentUser) -> BugOut:
    b = await db.get(Bug, bug_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bug not found")
    counts = await _attachment_counts(db, [b.id])
    return _bug_to_out(b, counts)


@router.post("", response_model=BugOut, status_code=status.HTTP_201_CREATED)
async def create_bug(
    payload: BugCreate, db: DBSession, user: CurrentUser, request: Request
) -> BugOut:
    b = Bug(**payload.model_dump(), creator_id=user.id)
    db.add(b)
    await db.commit()
    await db.refresh(b)
    await record_audit(
        db,
        actor=user,
        action=AuditAction.create,
        target_type=AuditTargetType.bug,
        target_id=b.id,
        target_label=b.title,
        request=request,
        status_code=201,
    )
    counts = await _attachment_counts(db, [b.id])
    return _bug_to_out(b, counts)


@router.patch("/{bug_id}", response_model=BugOut)
async def update_bug(
    bug_id: int,
    payload: BugUpdate,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> BugOut:
    b = await db.get(Bug, bug_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bug not found")
    changed = list(payload.model_dump(exclude_unset=True).keys())
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    await db.commit()
    await db.refresh(b)
    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.bug,
        target_id=b.id,
        target_label=b.title,
        request=request,
        status_code=200,
        extra={"changed": changed},
    )
    counts = await _attachment_counts(db, [b.id])
    return _bug_to_out(b, counts)


@router.delete(
    "/{bug_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_bug(
    bug_id: int, db: DBSession, user: CurrentUser, request: Request
):
    b = await db.get(Bug, bug_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bug not found")
    if b.creator_id != user.id and user.role.value != "admin":
        raise HTTPException(
            status_code=403, detail="Only the creator or admin may delete this bug"
        )
    bid = b.id
    label = b.title
    await db.delete(b)
    await db.commit()
    await record_audit(
        db,
        actor=user,
        action=AuditAction.delete,
        target_type=AuditTargetType.bug,
        target_id=bid,
        target_label=label,
        request=request,
        status_code=204,
    )

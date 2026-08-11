from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, DBSession
from app.core.ai import (
    AIDisabledError,
    AIRequestError,
    AIRuntime,
    chat_completion,
    is_enabled,
    load_runtime,
    mask_key,
    summarize,
)
from app.core.audit import record_audit
from app.models.ai_setting import AISetting
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.bug import Bug
from app.models.comment import Comment, CommentTargetType
from app.models.story import Story
from app.models.task import Task

router = APIRouter(prefix="/ai", tags=["ai"])


# --- /ai/status (every authenticated user) -----------------------------


class AIStatusOut(BaseModel):
    """Lightweight check used by the FE to decide whether to expose AI
    buttons. The FE never needs the api_key, base_url, etc. - those are
    admin-only and live behind /ai/config."""

    enabled: bool
    model: Optional[str] = None


@router.get("/status", response_model=AIStatusOut)
async def ai_status(db: DBSession, _: CurrentUser) -> AIStatusOut:
    rt = await load_runtime(db)
    return AIStatusOut(
        enabled=is_enabled(rt),
        model=rt.model if is_enabled(rt) else None,
    )


# --- /ai/config (admin) -------------------------------------------------


class AIConfigOut(BaseModel):
    """Admin-facing view of the singleton settings row. The api_key is
    NEVER returned in cleartext - we send a `sk-…last4` masked form so the
    UI can show "what's saved" without leaking secrets."""

    model_config = ConfigDict(from_attributes=True)

    enabled: bool
    base_url: str
    model: str
    timeout_seconds: int
    max_input_chars: int
    api_key_masked: Optional[str] = None
    api_key_present: bool = False


class AIConfigUpdate(BaseModel):
    """Partial PATCH-style update. Sending an empty `api_key` string clears
    the saved key; omitting the field leaves it unchanged so an admin can
    change other fields without re-typing the key."""

    enabled: Optional[bool] = None
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=255)
    api_key: Optional[str] = Field(default=None, max_length=512)
    model: Optional[str] = Field(default=None, min_length=1, max_length=128)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=600)
    max_input_chars: Optional[int] = Field(default=None, ge=500, le=200_000)


async def _get_or_create_settings_row(db) -> AISetting:
    row = (
        await db.execute(select(AISetting).where(AISetting.id == 1))
    ).scalar_one_or_none()
    if row is None:
        row = AISetting(id=1)
        db.add(row)
        await db.flush()
    return row


def _config_out(row: AISetting) -> AIConfigOut:
    return AIConfigOut(
        enabled=row.enabled,
        base_url=row.base_url,
        model=row.model,
        timeout_seconds=row.timeout_seconds,
        max_input_chars=row.max_input_chars,
        api_key_masked=mask_key(row.api_key),
        api_key_present=bool(row.api_key),
    )


@router.get("/config", response_model=AIConfigOut)
async def get_ai_config(db: DBSession, _: AdminUser) -> AIConfigOut:
    row = await _get_or_create_settings_row(db)
    await db.commit()
    return _config_out(row)


@router.put("/config", response_model=AIConfigOut)
async def update_ai_config(
    payload: AIConfigUpdate,
    db: DBSession,
    admin: AdminUser,
    request: Request,
) -> AIConfigOut:
    row = await _get_or_create_settings_row(db)

    # Snapshot which fields changed so the audit row is meaningful. We do
    # NOT echo the new api_key value; only that it changed.
    changed: list[str] = []
    data = payload.model_dump(exclude_unset=True)

    for k, v in data.items():
        if k == "api_key":
            # Treat empty string as "clear the key". When the field is
            # omitted entirely it's already excluded from `data` above.
            current = row.api_key or ""
            new_val = (v or "").strip()
            if new_val != current:
                row.api_key = new_val or None
                changed.append("api_key")
            continue
        if isinstance(v, str):
            v = v.strip()
        if getattr(row, k) != v:
            setattr(row, k, v)
            changed.append(k)

    await db.commit()
    await db.refresh(row)

    if changed:
        await record_audit(
            db,
            actor=admin,
            action=AuditAction.update,
            target_type=AuditTargetType.user,  # closest enum we have today
            target_id=row.id,
            target_label="AI 设置",
            request=request,
            status_code=200,
            extra={"changed": changed},
        )

    return _config_out(row)


class AITestIn(BaseModel):
    """Optional override for a connectivity probe. Missing fields fall back
    to the saved row, letting the admin verify "what's about to be saved"
    or "what's saved right now"."""

    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None


class AITestOut(BaseModel):
    ok: bool
    message: str
    sample: Optional[str] = None
    model: Optional[str] = None


@router.post("/test", response_model=AITestOut)
async def test_ai_connection(
    payload: AITestIn, db: DBSession, _: AdminUser
) -> AITestOut:
    """Send a tiny chat-completion call to verify the credentials. We
    return success/failure as a 200 response (not an HTTP error) so the
    FE can render a friendly message either way."""
    saved = await load_runtime(db)
    rt = AIRuntime(
        enabled=True,
        base_url=(payload.base_url or saved.base_url or "").strip()
        or "https://api.openai.com/v1",
        api_key=(payload.api_key or saved.api_key or "").strip(),
        model=(payload.model or saved.model or "").strip() or "gpt-4o-mini",
        timeout_seconds=min(saved.timeout_seconds, 30),
        max_input_chars=saved.max_input_chars,
    )
    if not rt.api_key:
        return AITestOut(ok=False, message="未提供 API Key（保存的也为空）")

    try:
        text = await chat_completion(
            rt,
            system="你是一个简洁的助手。",
            user="请回复一个汉字：好",
            temperature=0.0,
        )
    except (AIRequestError, AIDisabledError) as exc:
        return AITestOut(ok=False, message=str(exc), model=rt.model)

    return AITestOut(
        ok=True,
        message="连接成功",
        sample=text[:100],
        model=rt.model,
    )


# --- /ai/summarize (every authenticated user) -------------------------


class SummaryIn(BaseModel):
    target_type: Literal["task", "story", "bug"]
    target_id: int = Field(gt=0)
    instruction: Optional[str] = Field(default=None, max_length=500)


class SummaryOut(BaseModel):
    summary: str
    target_type: Literal["task", "story", "bug"]
    target_id: int
    title: str


def _format_comments(rows: list[Comment]) -> str:
    if not rows:
        return ""
    lines: list[str] = []
    for c in rows:
        author = (
            (c.author.full_name or c.author.username)
            if c.author is not None
            else "未知用户"
        )
        ts = c.created_at.isoformat() if c.created_at is not None else ""
        lines.append(f"[{ts}] {author}:{c.body}")
    return "\n".join(lines)


@router.post("/summarize", response_model=SummaryOut)
async def summarize_entity(
    payload: SummaryIn, db: DBSession, _: CurrentUser
) -> SummaryOut:
    rt = await load_runtime(db)
    if not is_enabled(rt):
        raise HTTPException(
            status_code=503,
            detail="AI 功能未启用。管理员请前往「AI 设置」配置后再试。",
        )

    title: str = ""
    body: str = ""
    if payload.target_type == "task":
        t = await db.get(Task, payload.target_id)
        if not t:
            raise HTTPException(status_code=404, detail="Task not found")
        title = t.title
        body = t.description or ""
        ctype = CommentTargetType.task
    elif payload.target_type == "story":
        s = await db.get(Story, payload.target_id)
        if not s:
            raise HTTPException(status_code=404, detail="Story not found")
        title = s.title
        parts: list[str] = []
        if s.description:
            parts.append(f"描述：{s.description}")
        if s.acceptance_criteria:
            parts.append(f"验收标准：{s.acceptance_criteria}")
        body = "\n\n".join(parts)
        ctype = CommentTargetType.story
    else:  # bug
        b = await db.get(Bug, payload.target_id)
        if not b:
            raise HTTPException(status_code=404, detail="Bug not found")
        title = b.title
        parts: list[str] = []
        if b.description:
            parts.append(f"问题：{b.description}")
        if b.steps_to_reproduce:
            parts.append(f"复现步骤：{b.steps_to_reproduce}")
        if b.expected_result:
            parts.append(f"期望：{b.expected_result}")
        if b.actual_result:
            parts.append(f"实际：{b.actual_result}")
        body = "\n\n".join(parts)
        ctype = CommentTargetType.bug

    rows = (
        await db.execute(
            select(Comment)
            .where(Comment.target_type == ctype, Comment.target_id == payload.target_id)
            .order_by(Comment.created_at.asc())
        )
    ).scalars().unique().all()
    comments_text = _format_comments(rows)

    try:
        text = await summarize(
            rt,
            title=title,
            body=body,
            comments_text=comments_text,
            instruction=payload.instruction,
        )
    except AIDisabledError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return SummaryOut(
        summary=text,
        target_type=payload.target_type,
        target_id=payload.target_id,
        title=title,
    )

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.models.audit_log import AuditAction, AuditLog, AuditTargetType
from app.models.user import UserRole
from app.schemas.audit_log import AuditLogOut, AuditLogPage

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=AuditLogPage)
async def list_audit_logs(
    db: DBSession,
    user: CurrentUser,
    action: Optional[AuditAction] = Query(default=None),
    target_type: Optional[AuditTargetType] = Query(default=None),
    actor_id: Optional[int] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Match against target label / request path"),
    start: Optional[datetime] = Query(default=None),
    end: Optional[datetime] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> AuditLogPage:
    """List audit log entries.

    - **Admin** sees all entries.
    - **Regular user** only sees entries where they are the actor.
    """
    base = select(AuditLog)
    count_base = select(func.count(AuditLog.id))

    # Scope: admins see everything; regular users see only their own.
    if user.role != UserRole.admin:
        base = base.where(AuditLog.actor_id == user.id)
        count_base = count_base.where(AuditLog.actor_id == user.id)

    # Filters
    if action:
        base = base.where(AuditLog.action == action)
        count_base = count_base.where(AuditLog.action == action)
    if target_type:
        base = base.where(AuditLog.target_type == target_type)
        count_base = count_base.where(AuditLog.target_type == target_type)
    if actor_id is not None and user.role == UserRole.admin:
        # Only admin can filter by other actors.
        base = base.where(AuditLog.actor_id == actor_id)
        count_base = count_base.where(AuditLog.actor_id == actor_id)
    if q:
        like = f"%{q}%"
        base = base.where(
            (AuditLog.target_label.ilike(like)) | (AuditLog.request_path.ilike(like))
        )
        count_base = count_base.where(
            (AuditLog.target_label.ilike(like)) | (AuditLog.request_path.ilike(like))
        )
    if start:
        base = base.where(AuditLog.created_at >= start)
        count_base = count_base.where(AuditLog.created_at >= start)
    if end:
        base = base.where(AuditLog.created_at <= end)
        count_base = count_base.where(AuditLog.created_at <= end)

    total = (await db.execute(count_base)).scalar_one()

    rows = (
        await db.execute(
            base.order_by(AuditLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().unique().all()

    return AuditLogPage(
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )

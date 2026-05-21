"""Audit log helper - call from any endpoint after a mutation succeeds.

Best-effort: a failure to write an audit row never breaks the underlying
operation. The caller passes a fresh DBSession (or shares its existing one)
and we commit independently so the audit trail is durable even if the parent
transaction has already been committed.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction, AuditLog, AuditTargetType
from app.models.user import User

logger = logging.getLogger("slflow.audit")


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None


async def record_audit(
    db: AsyncSession,
    *,
    actor: Optional[User],
    action: AuditAction,
    target_type: AuditTargetType,
    target_id: Optional[int] = None,
    target_label: Optional[str] = None,
    request: Optional[Request] = None,
    status_code: Optional[int] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Insert one audit row. Never raises - audit must not break business calls."""
    try:
        entry = AuditLog(
            actor_id=actor.id if actor else None,
            actor_username_at_event=(actor.username if actor else None),
            action=action,
            target_type=target_type,
            target_id=target_id,
            target_label=(target_label[:255] if target_label else None),
            request_method=(request.method if request else None),
            request_path=(request.url.path[:255] if request else None),
            status_code=status_code,
            client_ip=_client_ip(request),
            extra=(json.dumps(extra, ensure_ascii=False) if extra else None),
        )
        db.add(entry)
        await db.commit()
    except Exception:  # pragma: no cover - audit is best-effort
        logger.exception("failed to record audit entry")
        try:
            await db.rollback()
        except Exception:
            pass

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.audit_log import AuditAction, AuditTargetType


class AuditActor(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor: Optional[AuditActor] = None
    actor_username_at_event: Optional[str] = None
    action: AuditAction
    target_type: AuditTargetType
    target_id: Optional[int] = None
    target_label: Optional[str] = None
    request_method: Optional[str] = None
    request_path: Optional[str] = None
    status_code: Optional[int] = None
    client_ip: Optional[str] = None
    extra: Optional[str] = None
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int

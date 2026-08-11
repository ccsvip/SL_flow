from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationKind, NotificationTargetType


class _ActorOut(BaseModel):
    """Minimal actor payload to keep notification rows light. Full UserOut
    would force avatar URL resolution on every dropdown open."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: Optional[str] = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: NotificationKind
    target_type: NotificationTargetType
    target_id: int
    body: str
    is_read: bool
    comment_id: Optional[int] = None
    extra: Optional[str] = None
    created_at: datetime
    actor: Optional[_ActorOut] = None


class NotificationsPage(BaseModel):
    items: list[NotificationOut]
    total: int
    unread: int
    page: int
    page_size: int


class UnreadCount(BaseModel):
    unread: int

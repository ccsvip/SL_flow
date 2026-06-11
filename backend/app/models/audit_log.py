from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class AuditAction(str, enum.Enum):
    create = "create"
    update = "update"
    delete = "delete"
    login = "login"
    login_failed = "login_failed"
    logout = "logout"
    password_change = "password_change"


class AuditTargetType(str, enum.Enum):
    project = "project"
    story = "story"
    task = "task"
    bug = "bug"
    comment = "comment"
    attachment = "attachment"
    user = "user"
    auth = "auth"
    db_backup = "db_backup"
    backup_setting = "backup_setting"
    prd = "prd"
    managed_api_key = "managed_api_key"


class AuditLog(Base):
    """A single audit-log entry.

    Captures who did what to which entity, when. Inserted by `record_audit()`
    from every mutating endpoint after the main operation succeeds. Admin
    users see the whole table; regular users only see their own rows.
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)

    # `actor_id` is nullable so we can still log failed-login attempts where
    # we don't know who tried to authenticate (e.g. wrong username).
    actor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_username_at_event: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )

    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction, name="audit_action"), nullable=False, index=True
    )
    target_type: Mapped[AuditTargetType] = mapped_column(
        Enum(AuditTargetType, name="audit_target_type"), nullable=False, index=True
    )
    target_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    # Keep a human label even after the target is gone (project name, task
    # title, etc.) - so deleted-target rows still make sense in the UI.
    target_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    request_method: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    request_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    client_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Free-form additional context, e.g. {"changed": ["status","priority"]}.
    extra: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    actor = relationship("User", foreign_keys=[actor_id], lazy="joined")

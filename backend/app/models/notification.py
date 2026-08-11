from __future__ import annotations

import enum
from typing import Optional

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models._mixins import TimestampMixin


class NotificationKind(str, enum.Enum):
    """Why a row was created. Drives the icon + sentence template on the FE."""

    mention = "mention"        # someone @-mentioned the user in a comment body
    assigned = "assigned"      # the user became the assignee of an entity
    status = "status"          # an entity owned by / assigned to the user changed status
    comment = "comment"        # a comment was posted on an entity owned/assigned to the user


class NotificationTargetType(str, enum.Enum):
    """The kind of entity this notification points at - used to build the
    deep-link on the FE.

    `comment` is intentionally absent: a comment notification still points at
    its parent (project/story/task/bug) so a single click jumps to the right
    drawer with the comments tab visible.
    """

    project = "project"
    story = "story"
    task = "task"
    bug = "bug"


class Notification(Base, TimestampMixin):
    """A single notification row for one recipient.

    We deliberately denormalise the deep-link target (target_type+target_id)
    and a short rendered `body` snippet onto the row so the bell-icon
    dropdown can be served from a single SELECT without N+1 lookups across
    tasks/stories/bugs/comments.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Who receives this notification.
    recipient_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Who triggered it (NULL when system-generated, e.g. a status change
    # from a webhook). May also be NULL after the actor account is deleted.
    actor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    kind: Mapped[NotificationKind] = mapped_column(
        Enum(NotificationKind, name="notification_kind"), nullable=False
    )

    # Where to jump to when the notification row is clicked.
    target_type: Mapped[NotificationTargetType] = mapped_column(
        Enum(NotificationTargetType, name="notification_target_type"), nullable=False
    )
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Pre-rendered short text. The FE may translate/format further but we
    # store something readable so admins can debug rows directly.
    body: Mapped[str] = mapped_column(String(512), nullable=False)

    # NULL until the user marks it read; we keep a boolean too because
    # "unread count" gets queried on every page load and Postgres counts on
    # an indexed boolean are dirt cheap.
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    # Optional comment id when kind is mention/comment - lets the FE jump
    # straight to the comment thread rather than the parent entity's first
    # tab. NULL for assigned/status notifications.
    comment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("comments.id", ondelete="SET NULL"), nullable=True
    )

    # Optional structured payload (JSON-as-text) for status notifications,
    # e.g. {"from": "todo", "to": "in_progress"}. Kept opaque on the wire.
    extra: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    actor = relationship("User", foreign_keys=[actor_id], lazy="joined")

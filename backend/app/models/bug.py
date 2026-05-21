from __future__ import annotations

import enum
from typing import Optional

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models._mixins import TimestampMixin


class BugStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"
    reopened = "reopened"


class BugSeverity(str, enum.Enum):
    trivial = "trivial"
    minor = "minor"
    major = "major"
    critical = "critical"
    blocker = "blocker"


class BugPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class Bug(Base, TimestampMixin):
    __tablename__ = "bugs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    steps_to_reproduce: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actual_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[BugStatus] = mapped_column(
        Enum(BugStatus, name="bug_status"), default=BugStatus.open, nullable=False
    )
    severity: Mapped[BugSeverity] = mapped_column(
        Enum(BugSeverity, name="bug_severity"), default=BugSeverity.minor, nullable=False
    )
    priority: Mapped[BugPriority] = mapped_column(
        Enum(BugPriority, name="bug_priority"), default=BugPriority.medium, nullable=False
    )
    environment: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assignee_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    project = relationship("Project", lazy="joined")
    creator = relationship("User", foreign_keys=[creator_id], lazy="joined")
    assignee = relationship("User", foreign_keys=[assignee_id], lazy="joined")

from __future__ import annotations

import enum
from typing import Optional

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models._mixins import TimestampMixin


class StoryStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    in_review = "in_review"
    accepted = "accepted"
    closed = "closed"


class StoryPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class Story(Base, TimestampMixin):
    """A requirement / user story."""

    __tablename__ = "stories"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acceptance_criteria: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[StoryStatus] = mapped_column(
        Enum(StoryStatus, name="story_status"), default=StoryStatus.draft, nullable=False
    )
    priority: Mapped[StoryPriority] = mapped_column(
        Enum(StoryPriority, name="story_priority"), default=StoryPriority.medium, nullable=False
    )
    estimate_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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

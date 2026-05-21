from __future__ import annotations

import enum

from sqlalchemy import Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models._mixins import TimestampMixin


class CommentTargetType(str, enum.Enum):
    project = "project"
    story = "story"
    task = "task"
    bug = "bug"


class Comment(Base, TimestampMixin):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[CommentTargetType] = mapped_column(
        Enum(CommentTargetType, name="comment_target_type"), nullable=False
    )
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    author = relationship("User", lazy="joined")

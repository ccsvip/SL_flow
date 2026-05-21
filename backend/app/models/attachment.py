from __future__ import annotations

import enum

from sqlalchemy import BigInteger, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models._mixins import TimestampMixin


class AttachmentTarget(str, enum.Enum):
    project = "project"
    story = "story"
    task = "task"
    bug = "bug"
    comment = "comment"


class Attachment(Base, TimestampMixin):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)

    target_type: Mapped[AttachmentTarget] = mapped_column(
        Enum(AttachmentTarget, name="attachment_target"), nullable=False
    )
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    uploader_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    uploader = relationship("User", lazy="joined")

from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models._mixins import TimestampMixin


class Memo(Base, TimestampMixin):
    """A single user-owned memo / note entry.

    Each memo belongs to a category (free-text string) and holds Markdown
    content.  Pinning is supported so users can surface important notes at
    the top of lists.
    """

    __tablename__ = "memos"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True, index=True
    )
    pinned: Mapped[bool] = mapped_column(
        default=False, nullable=False, server_default="false"
    )

    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner = relationship("User", foreign_keys=[owner_id], lazy="joined")

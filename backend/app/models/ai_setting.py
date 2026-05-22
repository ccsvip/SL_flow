from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models._mixins import TimestampMixin


class AISetting(Base, TimestampMixin):
    """Singleton row holding the runtime AI provider config.

    We keep a row even when the feature is disabled so admin edits to the
    base URL / model survive flipping `enabled` on and off.

    The API key is stored verbatim on disk - this is no worse than the
    `.env` file we replaced - and only ever exposed to the frontend in
    masked form (`sk-…last4`). The full key is required server-side to
    sign upstream requests, so a one-way hash is not an option here.
    """

    __tablename__ = "ai_settings"

    # We enforce a single row by hard-coding the primary key on insert/seed.
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    base_url: Mapped[str] = mapped_column(
        String(255), default="https://api.openai.com/v1", nullable=False
    )
    api_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    model: Mapped[str] = mapped_column(String(128), default="gpt-4o-mini", nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    max_input_chars: Mapped[int] = mapped_column(Integer, default=12000, nullable=False)

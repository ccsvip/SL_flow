"""ai_settings singleton

Revision ID: 0005_ai_settings
Revises: 0004_notifications
Create Date: 2026-05-22

Stores the AI provider config (base_url / api_key / model / etc.) so an
admin can edit it from the UI instead of redeploying with a new .env.

We seed exactly one row (id=1). The route layer enforces "always one row"
on PUT by upserting against id=1.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_ai_settings"
down_revision: Union[str, None] = "0004_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_settings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column(
            "base_url",
            sa.String(255),
            nullable=False,
            server_default="https://api.openai.com/v1",
        ),
        sa.Column("api_key", sa.String(512), nullable=True),
        sa.Column(
            "model",
            sa.String(128),
            nullable=False,
            server_default="gpt-4o-mini",
        ),
        sa.Column(
            "timeout_seconds", sa.Integer, nullable=False, server_default="60"
        ),
        sa.Column(
            "max_input_chars", sa.Integer, nullable=False, server_default="12000"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Seed the singleton row, backfilling from env vars when present so a
    # deployment that had AI_API_KEY in .env keeps working after upgrade
    # without the admin having to re-enter everything in the UI.
    import os

    env_key = (os.environ.get("AI_API_KEY") or "").strip()
    env_base = (os.environ.get("AI_BASE_URL") or "https://api.openai.com/v1").strip()
    env_model = (os.environ.get("AI_MODEL") or "gpt-4o-mini").strip()
    env_enabled_raw = (os.environ.get("AI_ENABLED") or "true").strip().lower()
    env_enabled = env_enabled_raw in ("1", "true", "yes", "on") and bool(env_key)

    op.execute(
        sa.text(
            "INSERT INTO ai_settings "
            "(id, enabled, base_url, api_key, model, timeout_seconds, max_input_chars) "
            "VALUES (1, :en, :bu, :ak, :md, 60, 12000) "
            "ON CONFLICT (id) DO NOTHING"
        ).bindparams(
            en=env_enabled,
            bu=env_base,
            ak=env_key or None,
            md=env_model,
        )
    )


def downgrade() -> None:
    op.drop_table("ai_settings")

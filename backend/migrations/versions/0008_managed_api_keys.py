"""managed_api_keys

Revision ID: 0008_managed_api_keys
Revises: 0007_prd_truncated
Create Date: 2026-06-12
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_managed_api_keys"
down_revision: Union[str, None] = "0007_prd_truncated"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE audit_target_type ADD VALUE IF NOT EXISTS 'managed_api_key'")
    op.create_table(
        "managed_api_keys",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(128), nullable=False),
        sa.Column("api_key", sa.Text, nullable=False),
        sa.Column("base_url", sa.String(512), nullable=True),
        sa.Column(
            "models",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
        sa.Column("notes", sa.Text, nullable=True),
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
    op.create_index("ix_managed_api_keys_title", "managed_api_keys", ["title"])


def downgrade() -> None:
    op.drop_index("ix_managed_api_keys_title", table_name="managed_api_keys")
    op.drop_table("managed_api_keys")
    # PostgreSQL enum values cannot be removed cheaply/safely in a generic
    # downgrade, so audit_target_type keeps the managed_api_key value.

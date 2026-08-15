"""memos

Revision ID: 0011_memos
Revises: 0010_audit_action_reveal
Create Date: 2026-08-15
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_memos"
down_revision: Union[str, None] = "0010_audit_action_reveal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "memos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("category", sa.String(128), nullable=True),
        sa.Column(
            "pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("owner_id", sa.Integer, nullable=False),
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
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_memos_title", "memos", ["title"])
    op.create_index("ix_memos_category", "memos", ["category"])
    op.create_index("ix_memos_owner_id", "memos", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_memos_owner_id", table_name="memos")
    op.drop_index("ix_memos_category", table_name="memos")
    op.drop_index("ix_memos_title", table_name="memos")
    op.drop_table("memos")

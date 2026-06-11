"""managed_api_keys owner

Revision ID: 0009_managed_api_key_owner
Revises: 0008_managed_api_keys
Create Date: 2026-06-12
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_managed_api_key_owner"
down_revision: Union[str, None] = "0008_managed_api_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "managed_api_keys",
        sa.Column("owner_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_managed_api_keys_owner_id_users",
        "managed_api_keys",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute(
        """
        UPDATE managed_api_keys
        SET owner_id = COALESCE(
            (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1),
            (SELECT id FROM users ORDER BY id LIMIT 1)
        )
        WHERE owner_id IS NULL
        """
    )
    op.alter_column("managed_api_keys", "owner_id", nullable=False)
    op.create_index(
        "ix_managed_api_keys_owner_id",
        "managed_api_keys",
        ["owner_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_managed_api_keys_owner_id", table_name="managed_api_keys")
    op.drop_constraint(
        "fk_managed_api_keys_owner_id_users",
        "managed_api_keys",
        type_="foreignkey",
    )
    op.drop_column("managed_api_keys", "owner_id")

"""db backup tables

Revision ID: 0003_db_backups
Revises: 0002_audit_logs
Create Date: 2026-05-21
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_db_backups"
down_revision: Union[str, None] = "0002_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    backup_kind = sa.Enum(
        "manual", "scheduled", "pre_restore", name="backup_kind"
    )
    backup_status = sa.Enum(
        "success", "failed", "running", name="backup_status"
    )

    # Extend audit_target_type enum with our new variants. Postgres rejects
    # bind params on ALTER TYPE, so we hard-code the (safe) literal values.
    bind = op.get_bind()
    for value in ("db_backup", "backup_setting"):
        bind.execute(
            sa.text(
                f"ALTER TYPE audit_target_type ADD VALUE IF NOT EXISTS '{value}'"
            )
        )

    op.create_table(
        "db_backups",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False, unique=True),
        sa.Column("storage_path", sa.String(512), nullable=False),
        sa.Column("size_bytes", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("kind", backup_kind, nullable=False, server_default="manual"),
        sa.Column("status", backup_status, nullable=False, server_default="success"),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column(
            "creator_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("creator_username_at_event", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_db_backups_created_at", "db_backups", ["created_at"])

    op.create_table(
        "backup_settings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("interval_hours", sa.Integer, nullable=False, server_default="24"),
        sa.Column("keep_count", sa.Integer, nullable=False, server_default="14"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_status", sa.String(32), nullable=True),
        sa.Column("last_run_error", sa.Text, nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # Seed singleton row
    op.execute(
        "INSERT INTO backup_settings (id, enabled, interval_hours, keep_count) "
        "VALUES (1, false, 24, 14) ON CONFLICT (id) DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table("backup_settings")
    op.drop_index("ix_db_backups_created_at", table_name="db_backups")
    op.drop_table("db_backups")
    sa.Enum(name="backup_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="backup_kind").drop(op.get_bind(), checkfirst=True)

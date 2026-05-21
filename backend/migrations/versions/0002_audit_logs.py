"""audit_logs table

Revision ID: 0002_audit_logs
Revises: 0001_initial
Create Date: 2026-05-21

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_audit_logs"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    audit_action = sa.Enum(
        "create",
        "update",
        "delete",
        "login",
        "login_failed",
        "logout",
        "password_change",
        name="audit_action",
    )
    audit_target_type = sa.Enum(
        "project",
        "story",
        "task",
        "bug",
        "comment",
        "attachment",
        "user",
        "auth",
        name="audit_target_type",
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "actor_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_username_at_event", sa.String(64), nullable=True),
        sa.Column("action", audit_action, nullable=False),
        sa.Column("target_type", audit_target_type, nullable=False),
        sa.Column("target_id", sa.Integer, nullable=True),
        sa.Column("target_label", sa.String(255), nullable=True),
        sa.Column("request_method", sa.String(8), nullable=True),
        sa.Column("request_path", sa.String(255), nullable=True),
        sa.Column("status_code", sa.Integer, nullable=True),
        sa.Column("client_ip", sa.String(64), nullable=True),
        sa.Column("extra", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_target_type", "audit_logs", ["target_type"])
    op.create_index("ix_audit_logs_target_id", "audit_logs", ["target_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_target_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_target_type", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_id", table_name="audit_logs")
    op.drop_table("audit_logs")
    sa.Enum(name="audit_target_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="audit_action").drop(op.get_bind(), checkfirst=True)

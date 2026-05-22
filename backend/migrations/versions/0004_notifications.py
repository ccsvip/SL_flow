"""notifications

Revision ID: 0004_notifications
Revises: 0003_db_backups
Create Date: 2026-05-22

Adds the `notifications` table that feeds the bell-icon dropdown. Two
related concerns kept out of this migration on purpose:

  * `read_at` timestamp - we use `is_read` boolean for now; if we later
    want "read N hours ago" we will add the timestamp column then.
  * Per-user notification preferences - punted until we actually have
    multiple delivery channels (email, push, etc.).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_notifications"
down_revision: Union[str, None] = "0003_db_backups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    notification_kind = sa.Enum(
        "mention",
        "assigned",
        "status",
        "comment",
        name="notification_kind",
    )
    notification_target = sa.Enum(
        "project",
        "story",
        "task",
        "bug",
        name="notification_target_type",
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "recipient_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("kind", notification_kind, nullable=False),
        sa.Column("target_type", notification_target, nullable=False),
        sa.Column("target_id", sa.Integer, nullable=False),
        sa.Column("body", sa.String(512), nullable=False),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column(
            "comment_id",
            sa.Integer,
            sa.ForeignKey("comments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("extra", sa.Text, nullable=True),
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
    op.create_index(
        "ix_notifications_recipient_id", "notifications", ["recipient_id"]
    )
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"])
    # Composite index for the most-frequent query: "give me my unread
    # notifications, newest first". Postgres can scan this in index order.
    op.create_index(
        "ix_notifications_recipient_unread_created",
        "notifications",
        ["recipient_id", "is_read", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notifications_recipient_unread_created", table_name="notifications"
    )
    op.drop_index("ix_notifications_is_read", table_name="notifications")
    op.drop_index("ix_notifications_recipient_id", table_name="notifications")
    op.drop_table("notifications")

    sa.Enum(name="notification_target_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="notification_kind").drop(op.get_bind(), checkfirst=True)

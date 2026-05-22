"""prd_documents + prd_requirements + audit prd target

Revision ID: 0006_prd
Revises: 0005_ai_settings
Create Date: 2026-05-22

PRD generation feature - structured product-requirement documents that can
be filled by AI from a one-line idea, chat log, or customer feedback. Each
document carries a pool of atomic requirements convertible to Story rows.

We also extend `audit_target_type` with the `prd` value so audit logs can
attribute mutations on these tables.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_prd"
down_revision: Union[str, None] = "0005_ai_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend the audit_target_type enum with `prd`. Postgres 12+ supports
    # the IF NOT EXISTS form so this is idempotent across re-runs.
    op.execute("ALTER TYPE audit_target_type ADD VALUE IF NOT EXISTS 'prd'")

    # Inline enum types - same style as 0001_initial.py. SQLAlchemy creates
    # the type the first time it's referenced in a column, and we don't
    # call `.create()` ourselves to avoid double-creation.
    prd_template = sa.Enum(
        "software_project",
        "mini_program",
        "app",
        "admin_system",
        "ai_app",
        "digital_human",
        "tob_delivery",
        name="prd_template",
    )
    prd_source_type = sa.Enum(
        "one_liner",
        "chat_log",
        "customer_feedback",
        "manual",
        name="prd_source_type",
    )
    prd_status = sa.Enum(
        "draft", "generating", "ready", "archived", name="prd_status"
    )
    prd_priority = sa.Enum(
        "low", "medium", "high", "urgent", name="prd_priority"
    )

    op.create_table(
        "prd_documents",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("template", prd_template, nullable=False),
        sa.Column("source_type", prd_source_type, nullable=False),
        sa.Column("source_input", sa.Text, nullable=True),
        sa.Column(
            "status", prd_status, nullable=False, server_default="draft"
        ),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("suggested_project_name", sa.String(128), nullable=True),
        sa.Column("suggested_project_code", sa.String(32), nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column(
            "project_id",
            sa.Integer,
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "creator_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("generated_model", sa.String(128), nullable=True),
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
        "ix_prd_documents_creator_id", "prd_documents", ["creator_id"]
    )
    op.create_index(
        "ix_prd_documents_project_id", "prd_documents", ["project_id"]
    )

    op.create_table(
        "prd_requirements",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "document_id",
            sa.Integer,
            sa.ForeignKey("prd_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("order_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("acceptance_criteria", sa.Text, nullable=True),
        sa.Column(
            "priority",
            prd_priority,
            nullable=False,
            server_default="medium",
        ),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column("tag", sa.String(32), nullable=True),
        sa.Column(
            "converted_story_id",
            sa.Integer,
            sa.ForeignKey("stories.id", ondelete="SET NULL"),
            nullable=True,
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
    op.create_index(
        "ix_prd_requirements_document_id", "prd_requirements", ["document_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_prd_requirements_document_id", table_name="prd_requirements"
    )
    op.drop_table("prd_requirements")

    op.drop_index("ix_prd_documents_project_id", table_name="prd_documents")
    op.drop_index("ix_prd_documents_creator_id", table_name="prd_documents")
    op.drop_table("prd_documents")

    sa.Enum(name="prd_priority").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="prd_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="prd_source_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="prd_template").drop(op.get_bind(), checkfirst=True)

    # Note: We deliberately leave the `prd` value in `audit_target_type` -
    # Postgres can't drop a single enum value without recreating the type,
    # and any audit rows referencing it would block recreation. The dead
    # value is harmless.

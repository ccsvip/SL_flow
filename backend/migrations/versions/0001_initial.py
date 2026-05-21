"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-21

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_role = sa.Enum("admin", "user", name="user_role")
    project_status = sa.Enum(
        "planning", "active", "on_hold", "completed", "archived", name="project_status"
    )
    story_status = sa.Enum(
        "draft", "active", "in_review", "accepted", "closed", name="story_status"
    )
    story_priority = sa.Enum("low", "medium", "high", "urgent", name="story_priority")
    task_status = sa.Enum(
        "todo", "in_progress", "review", "done", "cancelled", name="task_status"
    )
    task_priority = sa.Enum("low", "medium", "high", "urgent", name="task_priority")
    bug_status = sa.Enum(
        "open", "in_progress", "resolved", "closed", "reopened", name="bug_status"
    )
    bug_severity = sa.Enum(
        "trivial", "minor", "major", "critical", "blocker", name="bug_severity"
    )
    bug_priority = sa.Enum("low", "medium", "high", "urgent", name="bug_priority")
    comment_target = sa.Enum(
        "project", "story", "task", "bug", name="comment_target_type"
    )
    attachment_target = sa.Enum(
        "project", "story", "task", "bug", "comment", name="attachment_target"
    )

    # users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=True, unique=True),
        sa.Column("full_name", sa.String(128), nullable=True),
        sa.Column("avatar", sa.String(255), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # projects
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", project_status, nullable=False, server_default="active"),
        sa.Column("color", sa.String(16), nullable=False, server_default="#1677ff"),
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column(
            "owner_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_projects_code", "projects", ["code"], unique=True)
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])

    # stories
    op.create_table(
        "stories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("acceptance_criteria", sa.Text, nullable=True),
        sa.Column("status", story_status, nullable=False, server_default="draft"),
        sa.Column("priority", story_priority, nullable=False, server_default="medium"),
        sa.Column("estimate_points", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "project_id",
            sa.Integer,
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "creator_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "assignee_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_stories_project_id", "stories", ["project_id"])

    # tasks
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", task_status, nullable=False, server_default="todo"),
        sa.Column("priority", task_priority, nullable=False, server_default="medium"),
        sa.Column("estimate_hours", sa.Float, nullable=False, server_default="0"),
        sa.Column("consumed_hours", sa.Float, nullable=False, server_default="0"),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column(
            "project_id",
            sa.Integer,
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "story_id",
            sa.Integer,
            sa.ForeignKey("stories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "creator_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "assignee_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])

    # bugs
    op.create_table(
        "bugs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("steps_to_reproduce", sa.Text, nullable=True),
        sa.Column("expected_result", sa.Text, nullable=True),
        sa.Column("actual_result", sa.Text, nullable=True),
        sa.Column("status", bug_status, nullable=False, server_default="open"),
        sa.Column("severity", bug_severity, nullable=False, server_default="minor"),
        sa.Column("priority", bug_priority, nullable=False, server_default="medium"),
        sa.Column("environment", sa.String(255), nullable=True),
        sa.Column(
            "project_id",
            sa.Integer,
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "creator_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "assignee_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_bugs_project_id", "bugs", ["project_id"])

    # comments
    op.create_table(
        "comments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("target_type", comment_target, nullable=False),
        sa.Column("target_id", sa.Integer, nullable=False),
        sa.Column(
            "author_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_comments_target_id", "comments", ["target_id"])

    # attachments
    op.create_table(
        "attachments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(128), nullable=False),
        sa.Column("size", sa.BigInteger, nullable=False),
        sa.Column("target_type", attachment_target, nullable=False),
        sa.Column("target_id", sa.Integer, nullable=False),
        sa.Column(
            "uploader_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_attachments_target_id", "attachments", ["target_id"])


def downgrade() -> None:
    op.drop_table("attachments")
    op.drop_table("comments")
    op.drop_table("bugs")
    op.drop_table("tasks")
    op.drop_table("stories")
    op.drop_table("projects")
    op.drop_table("users")

    for enum_name in (
        "attachment_target",
        "comment_target_type",
        "bug_priority",
        "bug_severity",
        "bug_status",
        "task_priority",
        "task_status",
        "story_priority",
        "story_status",
        "project_status",
        "user_role",
    ):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)

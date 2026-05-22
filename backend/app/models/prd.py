"""PRD (Product Requirement Document) models.

A PRD is a structured markdown document built from a template + a free-form
user input (one-line idea / chat log / customer feedback). The AI is asked
to fill the template; the resulting markdown is stored verbatim for editing
and round-tripping.

Each PRD also has a *requirement pool* - atomic, actionable items extracted
from the document. Each row is convertible to a Story (one-click "落地" in the
UI), so the PRD becomes an executable backlog rather than a write-only
artifact.
"""
from __future__ import annotations

import enum
from typing import Optional

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models._mixins import TimestampMixin


class PRDTemplate(str, enum.Enum):
    """Built-in PRD templates. Each template selects a different section
    layout and tone hint when calling the LLM."""

    software_project = "software_project"
    mini_program = "mini_program"
    app = "app"
    admin_system = "admin_system"
    ai_app = "ai_app"
    digital_human = "digital_human"
    tob_delivery = "tob_delivery"


class PRDSourceType(str, enum.Enum):
    one_liner = "one_liner"  # 一句话
    chat_log = "chat_log"  # 聊天记录
    customer_feedback = "customer_feedback"  # 客户反馈
    manual = "manual"  # 用户直接写正文（跳过生成）


class PRDStatus(str, enum.Enum):
    draft = "draft"
    generating = "generating"
    ready = "ready"
    archived = "archived"


class PRDPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class PRDDocument(Base, TimestampMixin):
    """One generated/edited PRD document."""

    __tablename__ = "prd_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    template: Mapped[PRDTemplate] = mapped_column(
        Enum(PRDTemplate, name="prd_template"), nullable=False
    )
    source_type: Mapped[PRDSourceType] = mapped_column(
        Enum(PRDSourceType, name="prd_source_type"), nullable=False
    )
    source_input: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[PRDStatus] = mapped_column(
        Enum(PRDStatus, name="prd_status"), default=PRDStatus.draft, nullable=False
    )

    # Full markdown body of the PRD. Re-generated as a whole when the user
    # asks for "regenerate"; per-section edits and regenerations splice into
    # this field via marker lines.
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Optional model-suggested project meta (the FE shows these next to the
    # body so the user can decide if they want to spin up a real Project).
    suggested_project_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    suggested_project_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Optional binding to an existing project. We do NOT cascade-delete the
    # PRD when the project is removed - PRDs survive as historical artifacts.
    project_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    # The model that generated this doc (for traceability when an admin
    # changes providers later).
    generated_model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    # True when the most recent AI generation/regeneration hit our
    # JSON-fallback path (model output truncated by the upstream's
    # max_tokens, or otherwise malformed). The FE shows a "regenerate or
    # extract requirements" banner when this is set so the user knows the
    # doc is partial. Cleared back to False on the next clean generation.
    last_generation_truncated: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    project = relationship("Project", lazy="joined")
    creator = relationship("User", foreign_keys=[creator_id], lazy="joined")
    requirements = relationship(
        "PRDRequirement",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PRDRequirement.order_index",
    )


class PRDRequirement(Base, TimestampMixin):
    """One atomic requirement extracted from a PRD.

    These rows can be converted to Stories one-click. We keep the link via
    `converted_story_id` so the UI can show "已落地" badges and avoid double
    conversion.
    """

    __tablename__ = "prd_requirements"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("prd_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acceptance_criteria: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[PRDPriority] = mapped_column(
        Enum(PRDPriority, name="prd_priority"), default=PRDPriority.medium, nullable=False
    )
    # Free-form category so the model can group ("登录", "支付", "看板" ...).
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Marks "must / should / could" or 风险/边界 - whatever the model produced.
    tag: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    converted_story_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), nullable=True
    )

    document = relationship("PRDDocument", back_populates="requirements")
    converted_story = relationship("Story", foreign_keys=[converted_story_id], lazy="joined")

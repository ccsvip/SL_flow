from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.prd import PRDPriority, PRDSourceType, PRDStatus, PRDTemplate
from app.schemas.user import UserOut


# --- Templates ----------------------------------------------------------


class PRDTemplateSection(BaseModel):
    slug: str
    title: str
    hint: str


class PRDTemplateOut(BaseModel):
    template: PRDTemplate
    label: str
    description: str
    tone: str
    sections: List[PRDTemplateSection]


# --- Requirements -------------------------------------------------------


class PRDRequirementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    order_index: int
    title: str
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    priority: PRDPriority
    category: Optional[str] = None
    tag: Optional[str] = None
    converted_story_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class PRDRequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    priority: PRDPriority = PRDPriority.medium
    category: Optional[str] = Field(default=None, max_length=64)
    tag: Optional[str] = Field(default=None, max_length=32)
    order_index: Optional[int] = None


class PRDRequirementUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    priority: Optional[PRDPriority] = None
    category: Optional[str] = Field(default=None, max_length=64)
    tag: Optional[str] = Field(default=None, max_length=32)
    order_index: Optional[int] = None


# --- Documents ----------------------------------------------------------


class PRDDocumentSummary(BaseModel):
    """Lightweight row used by the list page - omits the full markdown body."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    template: PRDTemplate
    source_type: PRDSourceType
    status: PRDStatus
    summary: Optional[str] = None
    suggested_project_name: Optional[str] = None
    suggested_project_code: Optional[str] = None
    project_id: Optional[int] = None
    creator: Optional[UserOut] = None
    generated_model: Optional[str] = None
    last_generation_truncated: bool = False
    requirement_count: int = 0
    created_at: datetime
    updated_at: datetime


class PRDDocumentOut(PRDDocumentSummary):
    """Full doc - includes markdown body, source input, and the embedded
    requirement pool. Returned on the detail page."""

    content: str = ""
    source_input: Optional[str] = None
    requirements: List[PRDRequirementOut] = []


# --- Generate / regenerate inputs ---------------------------------------


class PRDGenerateRequest(BaseModel):
    """Single endpoint that creates a NEW document and triggers AI fill in
    one shot. The FE wizard collects template + source + input, hits this,
    and the response is the fully-populated doc ready to render."""

    template: PRDTemplate
    source_type: PRDSourceType
    source_input: str = Field(default="", max_length=200_000)
    title: Optional[str] = Field(default=None, max_length=255)
    extra_instruction: Optional[str] = Field(default=None, max_length=2_000)
    project_id: Optional[int] = None


class PRDRegenerateRequest(BaseModel):
    """Re-run the full doc against the current template + source."""

    extra_instruction: Optional[str] = Field(default=None, max_length=2_000)


class PRDSectionRegenerateRequest(BaseModel):
    section_slug: str = Field(min_length=1, max_length=64)
    extra_instruction: Optional[str] = Field(default=None, max_length=2_000)


class PRDSectionRegenerateResult(BaseModel):
    section_slug: str
    new_section_body: str
    new_content: str


class PRDDocumentUpdate(BaseModel):
    """Manual edits from the detail page."""

    title: Optional[str] = Field(default=None, max_length=255)
    content: Optional[str] = None
    summary: Optional[str] = None
    suggested_project_name: Optional[str] = Field(default=None, max_length=128)
    suggested_project_code: Optional[str] = Field(default=None, max_length=32)
    project_id: Optional[int] = None
    status: Optional[PRDStatus] = None


# --- Convert-to-Story ---------------------------------------------------


class PRDConvertRequest(BaseModel):
    """Convert one or more requirement rows into Story objects under the
    given project. If `requirement_ids` is empty/None we convert ALL
    not-yet-converted rows.

    Already-converted rows are silently skipped (the FE shows a 「已落地」
    badge that tells the user they're done)."""

    project_id: int
    requirement_ids: Optional[List[int]] = None


class PRDConvertResult(BaseModel):
    created_story_ids: List[int]
    skipped_requirement_ids: List[int]


# --- Re-extract requirements --------------------------------------------


class PRDReextractResult(BaseModel):
    requirements: List[PRDRequirementOut]


# --- Export -------------------------------------------------------------


PRDExportFormat = Literal["markdown", "html"]

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.story import StoryPriority, StoryStatus
from app.schemas.user import UserOut


class StoryBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: StoryStatus = StoryStatus.draft
    priority: StoryPriority = StoryPriority.medium
    estimate_points: int = 0
    project_id: int
    assignee_id: Optional[int] = None


class StoryCreate(StoryBase):
    pass


class StoryUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: Optional[StoryStatus] = None
    priority: Optional[StoryPriority] = None
    estimate_points: Optional[int] = None
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None


class StoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: StoryStatus
    priority: StoryPriority
    estimate_points: int
    project_id: int
    creator: Optional[UserOut] = None
    assignee: Optional[UserOut] = None
    created_at: datetime
    updated_at: datetime
    # See TaskOut.attachment_count - same idea for stories.
    attachment_count: int = 0

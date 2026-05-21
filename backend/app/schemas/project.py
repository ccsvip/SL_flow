from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.project import ProjectStatus
from app.schemas.user import UserOut


class ProjectBase(BaseModel):
    code: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_\-]+$")
    name: str = Field(min_length=1, max_length=128)
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.active
    color: str = "#1677ff"
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=128)
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    color: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    owner_id: Optional[int] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: Optional[str] = None
    status: ProjectStatus
    color: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    owner: Optional[UserOut] = None
    created_at: datetime
    updated_at: datetime
    # Aggregations
    story_count: int = 0
    task_count: int = 0
    bug_count: int = 0

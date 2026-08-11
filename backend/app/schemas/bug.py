from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.bug import BugPriority, BugSeverity, BugStatus
from app.schemas.user import UserOut


class BugBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    steps_to_reproduce: Optional[str] = None
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    status: BugStatus = BugStatus.open
    severity: BugSeverity = BugSeverity.minor
    priority: BugPriority = BugPriority.medium
    environment: Optional[str] = Field(default=None, max_length=255)
    project_id: int
    assignee_id: Optional[int] = None


class BugCreate(BugBase):
    pass


class BugUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    steps_to_reproduce: Optional[str] = None
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    status: Optional[BugStatus] = None
    severity: Optional[BugSeverity] = None
    priority: Optional[BugPriority] = None
    environment: Optional[str] = Field(default=None, max_length=255)
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None


class BugOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    steps_to_reproduce: Optional[str] = None
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    status: BugStatus
    severity: BugSeverity
    priority: BugPriority
    environment: Optional[str] = None
    project_id: int
    creator: Optional[UserOut] = None
    assignee: Optional[UserOut] = None
    created_at: datetime
    updated_at: datetime
    # See TaskOut.attachment_count - same idea for bugs.
    attachment_count: int = 0

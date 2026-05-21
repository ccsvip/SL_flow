from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.task import TaskPriority, TaskStatus
from app.schemas.user import UserOut


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    estimate_hours: float = 0
    consumed_hours: float = 0
    due_date: Optional[date] = None
    project_id: int
    story_id: Optional[int] = None
    assignee_id: Optional[int] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    estimate_hours: Optional[float] = None
    consumed_hours: Optional[float] = None
    due_date: Optional[date] = None
    project_id: Optional[int] = None
    story_id: Optional[int] = None
    assignee_id: Optional[int] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    status: TaskStatus
    priority: TaskPriority
    estimate_hours: float
    consumed_hours: float
    due_date: Optional[date] = None
    project_id: int
    story_id: Optional[int] = None
    creator: Optional[UserOut] = None
    assignee: Optional[UserOut] = None
    created_at: datetime
    updated_at: datetime
    # Number of attachments on this task. The list endpoint fills this in via
    # a single bulk count query so the FE can render a 📎 indicator without a
    # second roundtrip per row.
    attachment_count: int = 0

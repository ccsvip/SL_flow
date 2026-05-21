from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.comment import CommentTargetType
from app.schemas.user import UserOut


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)
    target_type: CommentTargetType
    target_id: int


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    target_type: CommentTargetType
    target_id: int
    author: UserOut
    created_at: datetime
    updated_at: datetime

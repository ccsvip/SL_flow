from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


class MemoBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: Optional[str] = Field(default=None, max_length=100_000)
    category: Optional[str] = Field(default=None, max_length=128)
    pinned: bool = False

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()

    @field_validator("category", mode="before")
    @classmethod
    def strip_category(cls, value: Optional[str]) -> Optional[str]:
        return _blank_to_none(value)


class MemoCreate(MemoBase):
    pass


class MemoUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    content: Optional[str] = Field(default=None, max_length=100_000)
    category: Optional[str] = Field(default=None, max_length=128)
    pinned: Optional[bool] = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip()

    @field_validator("category", mode="before")
    @classmethod
    def strip_category(cls, value: Optional[str]) -> Optional[str]:
        return _blank_to_none(value)


class MemoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: Optional[str] = None
    category: Optional[str] = None
    pinned: bool = False
    owner_id: int
    created_at: datetime
    updated_at: datetime

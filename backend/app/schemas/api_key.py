from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


class APIKeyBase(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    api_key: str = Field(min_length=1, max_length=4096)
    base_url: Optional[str] = Field(default=None, max_length=512)
    models: list[str] = Field(default_factory=list)
    notes: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("title", "api_key", mode="before")
    @classmethod
    def strip_required(cls, value: str) -> str:
        return value.strip()

    @field_validator("base_url", "notes", mode="before")
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        return _blank_to_none(value)

    @field_validator("models")
    @classmethod
    def clean_models(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        cleaned: list[str] = []
        for item in value:
            model = item.strip()
            if not model or model in seen:
                continue
            seen.add(model)
            cleaned.append(model[:128])
        return cleaned


class APIKeyCreate(APIKeyBase):
    pass


class APIKeyUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=128)
    api_key: Optional[str] = Field(default=None, min_length=1, max_length=4096)
    base_url: Optional[str] = Field(default=None, max_length=512)
    models: Optional[list[str]] = None
    notes: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("title", "api_key", mode="before")
    @classmethod
    def strip_required(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip()

    @field_validator("base_url", "notes", mode="before")
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        return _blank_to_none(value)

    @field_validator("models")
    @classmethod
    def clean_models(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        seen: set[str] = set()
        cleaned: list[str] = []
        for item in value:
            model = item.strip()
            if not model or model in seen:
                continue
            seen.add(model)
            cleaned.append(model[:128])
        return cleaned


class APIKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    api_key: str
    api_key_masked: Optional[str] = None
    base_url: Optional[str] = None
    models: list[str] = Field(default_factory=list)
    notes: Optional[str] = None
    owner_id: int
    created_at: datetime
    updated_at: datetime

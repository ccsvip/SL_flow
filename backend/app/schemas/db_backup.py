from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.db_backup import BackupKind, BackupStatus
from app.schemas.user import UserOut


class DBBackupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    size_bytes: int
    sha256: Optional[str] = None
    kind: BackupKind
    status: BackupStatus
    note: Optional[str] = None
    error: Optional[str] = None
    creator: Optional[UserOut] = None
    creator_username_at_event: Optional[str] = None
    created_at: datetime


class DBBackupPage(BaseModel):
    items: list[DBBackupOut]
    total: int
    page: int
    page_size: int


class BackupSettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    enabled: bool
    interval_hours: int
    keep_count: int
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    last_run_error: Optional[str] = None
    next_run_at: Optional[datetime] = None  # computed
    updated_at: datetime


class BackupSettingUpdate(BaseModel):
    enabled: Optional[bool] = None
    interval_hours: Optional[int] = Field(default=None, ge=1, le=24 * 30)
    keep_count: Optional[int] = Field(default=None, ge=1, le=200)


class CreateBackupRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


class RestoreResult(BaseModel):
    status: str
    message: str
    pre_restore_backup_id: Optional[int] = None

from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class BackupKind(str, enum.Enum):
    manual = "manual"
    scheduled = "scheduled"
    pre_restore = "pre_restore"  # auto-snapshot taken right before a restore


class BackupStatus(str, enum.Enum):
    success = "success"
    failed = "failed"
    running = "running"


class DBBackup(Base):
    """One row per pg_dump archive sitting on disk."""

    __tablename__ = "db_backups"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    kind: Mapped[BackupKind] = mapped_column(
        Enum(BackupKind, name="backup_kind"), nullable=False, default=BackupKind.manual
    )
    status: Mapped[BackupStatus] = mapped_column(
        Enum(BackupStatus, name="backup_status"), nullable=False, default=BackupStatus.success
    )
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    creator_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    creator_username_at_event: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    creator = relationship("User", foreign_keys=[creator_id], lazy="joined")


class BackupSetting(Base):
    """Singleton row (id=1) with the scheduled-backup configuration."""

    __tablename__ = "backup_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    interval_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    keep_count: Mapped[int] = mapped_column(Integer, nullable=False, default=14)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_run_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_run_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

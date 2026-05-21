"""Background scheduler for periodic database backups.

Wraps APScheduler's AsyncIOScheduler. The job reads the singleton
`BackupSetting` row and produces a backup if `enabled=True`. The schedule
itself is rebuilt every time the row changes (through `reschedule()`).

Design notes:
- We use a SINGLE persistent job named "scheduled-backup" with
  `replace_existing=True`, so reconfiguring just swaps the trigger.
- An asyncio.Lock ensures we never run two backups concurrently.
- Failures are caught and recorded onto the BackupSetting row so the
  admin UI can surface "last run failed: ...".
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import desc, select

from app.core.backup import (
    generate_backup_filename,
    perform_backup_to_disk,
    sha256_of,
)
from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.models.db_backup import BackupKind, BackupStatus, BackupSetting, DBBackup

logger = logging.getLogger("slflow.scheduler")

JOB_ID = "scheduled-backup"
_scheduler: Optional[AsyncIOScheduler] = None
_lock = asyncio.Lock()


async def _get_or_create_setting() -> BackupSetting:
    async with AsyncSessionLocal() as db:
        s = await db.get(BackupSetting, 1)
        if s is None:
            s = BackupSetting(id=1, enabled=False, interval_hours=24, keep_count=14)
            db.add(s)
            await db.commit()
            await db.refresh(s)
        return s


async def _trim_to_keep_count(keep: int) -> int:
    """Delete oldest scheduled backup rows + files until at most `keep` remain."""
    if keep <= 0:
        return 0
    deleted = 0
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(DBBackup)
                .where(DBBackup.kind == BackupKind.scheduled)
                .order_by(desc(DBBackup.created_at))
            )
        ).scalars().all()
        # Keep the newest `keep` ones, delete the rest.
        for old in rows[keep:]:
            try:
                p = settings.backup_path / old.storage_path
                if p.is_file():
                    p.unlink()
            except OSError:
                pass
            await db.delete(old)
            deleted += 1
        if deleted:
            await db.commit()
    return deleted


async def run_scheduled_backup() -> None:
    """Job body. Skips if disabled, takes a backup, records it, trims old ones."""
    if _lock.locked():
        logger.info("[scheduled-backup] previous run still in progress, skipping")
        return
    async with _lock:
        async with AsyncSessionLocal() as db:
            s = await db.get(BackupSetting, 1)
            if s is None or not s.enabled:
                logger.info("[scheduled-backup] disabled, skipping")
                return
            keep = max(1, s.keep_count)

        filename = generate_backup_filename(prefix="scheduled")
        out_path = settings.backup_path / filename
        rc, err = await perform_backup_to_disk(out_path)

        async with AsyncSessionLocal() as db:
            s = await db.get(BackupSetting, 1)
            now = datetime.now(timezone.utc)
            if rc != 0:
                s.last_run_at = now
                s.last_run_status = "failed"
                s.last_run_error = (err or "pg_dump failed")[-2000:]
                await db.commit()
                logger.error("[scheduled-backup] failed rc=%s err=%s", rc, err)
                return

            size = out_path.stat().st_size if out_path.is_file() else 0
            digest = sha256_of(out_path) if out_path.is_file() else None
            row = DBBackup(
                filename=filename,
                storage_path=filename,
                size_bytes=size,
                sha256=digest,
                kind=BackupKind.scheduled,
                status=BackupStatus.success,
                creator_id=None,
                creator_username_at_event="(scheduler)",
                note="scheduled",
            )
            db.add(row)
            s.last_run_at = now
            s.last_run_status = "success"
            s.last_run_error = None
            await db.commit()

        trimmed = await _trim_to_keep_count(keep)
        logger.info(
            "[scheduled-backup] ok size=%s trimmed=%s keep=%s", size, trimmed, keep
        )


async def reschedule() -> None:
    """Sync APScheduler with the persisted BackupSetting row."""
    if _scheduler is None:
        return
    s = await _get_or_create_setting()
    if not s.enabled:
        try:
            _scheduler.remove_job(JOB_ID)
            logger.info("[scheduler] disabled - removed job")
        except Exception:
            pass
        return
    trigger = IntervalTrigger(hours=max(1, s.interval_hours))
    _scheduler.add_job(
        run_scheduled_backup,
        trigger=trigger,
        id=JOB_ID,
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    logger.info("[scheduler] job scheduled every %s hours", s.interval_hours)


def get_next_run_at() -> Optional[datetime]:
    if _scheduler is None:
        return None
    job = _scheduler.get_job(JOB_ID)
    if job is None:
        return None
    return job.next_run_time


async def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.start()
    await reschedule()


async def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None

from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

import aiofiles
from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import desc, func, select

from app.api.deps import AdminUser, DBSession
from app.core.audit import record_audit
from app.core.backup import (
    generate_backup_filename,
    perform_backup_to_disk,
    perform_restore_from_disk,
    safe_filename,
    sha256_of,
)
from app.core.config import settings
from app.core.scheduler import get_next_run_at, reschedule
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.db_backup import BackupKind, BackupStatus, BackupSetting, DBBackup
from app.schemas.db_backup import (
    BackupSettingOut,
    BackupSettingUpdate,
    CreateBackupRequest,
    DBBackupOut,
    DBBackupPage,
    RestoreResult,
)

router = APIRouter(prefix="/db-backups", tags=["db-backups"])


def _decorate(row: DBBackup) -> DBBackupOut:
    return DBBackupOut.model_validate(row)


async def _setting(db) -> BackupSetting:
    s = await db.get(BackupSetting, 1)
    if s is None:
        s = BackupSetting(id=1)
        db.add(s)
        await db.commit()
        await db.refresh(s)
    return s


@router.get("", response_model=DBBackupPage)
async def list_backups(
    db: DBSession,
    _: AdminUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> DBBackupPage:
    total = (await db.execute(select(func.count(DBBackup.id)))).scalar_one()
    rows = (
        await db.execute(
            select(DBBackup)
            .order_by(desc(DBBackup.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().unique().all()
    return DBBackupPage(
        items=[_decorate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=DBBackupOut, status_code=status.HTTP_201_CREATED)
async def create_backup(
    payload: CreateBackupRequest,
    db: DBSession,
    user: AdminUser,
    request: Request,
) -> DBBackupOut:
    """Run pg_dump synchronously and record the result."""
    filename = generate_backup_filename(prefix="manual")
    out_path = settings.backup_path / filename
    rc, err = await perform_backup_to_disk(out_path)
    if rc != 0:
        raise HTTPException(
            status_code=500,
            detail=f"备份失败: pg_dump exit={rc}\n{err.strip()[:1000]}",
        )

    size = out_path.stat().st_size
    digest = sha256_of(out_path)
    row = DBBackup(
        filename=filename,
        storage_path=filename,
        size_bytes=size,
        sha256=digest,
        kind=BackupKind.manual,
        status=BackupStatus.success,
        note=payload.note,
        creator_id=user.id,
        creator_username_at_event=user.username,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    await record_audit(
        db,
        actor=user,
        action=AuditAction.create,
        target_type=AuditTargetType.db_backup,
        target_id=row.id,
        target_label=f"manual backup: {filename}",
        request=request,
        status_code=201,
        extra={"size_bytes": size, "kind": row.kind.value},
    )
    return _decorate(row)


@router.get("/{backup_id}/download")
async def download_backup(
    backup_id: int, db: DBSession, user: AdminUser, request: Request
) -> FileResponse:
    row = await db.get(DBBackup, backup_id)
    if not row:
        raise HTTPException(status_code=404, detail="Backup not found")
    full = settings.backup_path / row.storage_path
    if not full.is_file():
        raise HTTPException(status_code=410, detail="Backup file is missing on disk")
    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,  # download isn't a CRUD verb but is auditable
        target_type=AuditTargetType.db_backup,
        target_id=row.id,
        target_label=f"download: {row.filename}",
        request=request,
        status_code=200,
    )
    return FileResponse(
        path=full,
        media_type="application/gzip",
        filename=row.filename,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.delete(
    "/{backup_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_backup(
    backup_id: int, db: DBSession, user: AdminUser, request: Request
):
    row = await db.get(DBBackup, backup_id)
    if not row:
        raise HTTPException(status_code=404, detail="Backup not found")
    full = settings.backup_path / row.storage_path
    try:
        if full.is_file():
            os.remove(full)
    except OSError:
        pass
    label = row.filename
    bid = row.id
    await db.delete(row)
    await db.commit()
    await record_audit(
        db,
        actor=user,
        action=AuditAction.delete,
        target_type=AuditTargetType.db_backup,
        target_id=bid,
        target_label=f"deleted backup: {label}",
        request=request,
        status_code=204,
    )


@router.post("/upload", response_model=DBBackupOut, status_code=status.HTTP_201_CREATED)
async def upload_backup(
    db: DBSession,
    user: AdminUser,
    request: Request,
    file: UploadFile = File(...),
) -> DBBackupOut:
    """Accept a `.sql.gz` file the admin already has on disk and store it for later restore."""
    name = file.filename or ""
    if not name.endswith(".sql.gz") and not name.endswith(".gz"):
        raise HTTPException(
            status_code=400, detail="文件必须以 .sql.gz 结尾"
        )
    safe = safe_filename(name)
    out_path = settings.backup_path / safe
    if out_path.exists():
        # Add a uniquifier so we never silently overwrite.
        out_path = settings.backup_path / f"{secrets.token_hex(4)}-{safe}"
        safe = out_path.name

    size = 0
    async with aiofiles.open(out_path, "wb") as fp:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > settings.MAX_BACKUP_UPLOAD_BYTES:
                await fp.close()
                out_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"文件过大 (超过 {settings.MAX_BACKUP_UPLOAD_BYTES // (1024 * 1024)} MB)",
                )
            await fp.write(chunk)

    row = DBBackup(
        filename=safe,
        storage_path=safe,
        size_bytes=size,
        sha256=sha256_of(out_path),
        kind=BackupKind.manual,
        status=BackupStatus.success,
        note="uploaded",
        creator_id=user.id,
        creator_username_at_event=user.username,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await record_audit(
        db,
        actor=user,
        action=AuditAction.create,
        target_type=AuditTargetType.db_backup,
        target_id=row.id,
        target_label=f"upload backup: {safe}",
        request=request,
        status_code=201,
        extra={"size_bytes": size},
    )
    return _decorate(row)


@router.post("/{backup_id}/restore", response_model=RestoreResult)
async def restore_backup(
    backup_id: int, db: DBSession, user: AdminUser, request: Request
) -> RestoreResult:
    """Restore a previously-stored backup.

    Always takes a fresh `pre_restore` snapshot first so the admin can roll
    forward again. The restore replaces the entire `public` schema.
    """
    row = await db.get(DBBackup, backup_id)
    if not row:
        raise HTTPException(status_code=404, detail="Backup not found")
    full = settings.backup_path / row.storage_path
    if not full.is_file():
        raise HTTPException(status_code=410, detail="Backup file is missing on disk")

    # 1. Snapshot current state so a botched restore can be reversed.
    pre_filename = generate_backup_filename(prefix="pre-restore")
    pre_path = settings.backup_path / pre_filename
    rc, err = await perform_backup_to_disk(pre_path)
    pre_id: int | None = None
    if rc == 0:
        pre_size = pre_path.stat().st_size
        pre_row = DBBackup(
            filename=pre_filename,
            storage_path=pre_filename,
            size_bytes=pre_size,
            sha256=sha256_of(pre_path),
            kind=BackupKind.pre_restore,
            status=BackupStatus.success,
            note=f"auto-snapshot before restoring backup#{row.id}",
            creator_id=user.id,
            creator_username_at_event=user.username,
        )
        db.add(pre_row)
        await db.commit()
        await db.refresh(pre_row)
        pre_id = pre_row.id
    else:
        # Snapshot failed, refuse to restore - the admin would have no way back.
        raise HTTPException(
            status_code=500,
            detail=f"还原中止: 无法生成回退快照 (pg_dump exit={rc})\n{err[:500]}",
        )

    # 2. Apply the restore.
    rc2, err2 = await perform_restore_from_disk(full, drop_first=True)
    if rc2 != 0:
        await record_audit(
            db,
            actor=user,
            action=AuditAction.update,
            target_type=AuditTargetType.db_backup,
            target_id=row.id,
            target_label=f"restore failed: {row.filename}",
            request=request,
            status_code=500,
            extra={"error": err2[:500]},
        )
        raise HTTPException(
            status_code=500,
            detail=f"还原失败: psql exit={rc2}\n{err2[:1500]}\n\n回退快照已保存为 backup#{pre_id}",
        )

    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.db_backup,
        target_id=row.id,
        target_label=f"restore: {row.filename}",
        request=request,
        status_code=200,
        extra={"pre_restore_backup_id": pre_id},
    )
    return RestoreResult(
        status="ok",
        message=f"还原完成。回退快照: backup#{pre_id}",
        pre_restore_backup_id=pre_id,
    )


@router.get("/settings", response_model=BackupSettingOut)
async def get_settings(db: DBSession, _: AdminUser) -> BackupSettingOut:
    s = await _setting(db)
    out = BackupSettingOut.model_validate(s)
    out.next_run_at = get_next_run_at()
    return out


@router.patch("/settings", response_model=BackupSettingOut)
async def update_settings(
    payload: BackupSettingUpdate,
    db: DBSession,
    user: AdminUser,
    request: Request,
) -> BackupSettingOut:
    s = await _setting(db)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    # Push changes to the live scheduler.
    await reschedule()

    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.backup_setting,
        target_id=1,
        target_label="updated scheduled backup settings",
        request=request,
        status_code=200,
        extra=data,
    )
    out = BackupSettingOut.model_validate(s)
    out.next_run_at = get_next_run_at()
    return out

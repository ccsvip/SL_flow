from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import List

import aiofiles
from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.models.attachment import Attachment, AttachmentTarget
from app.schemas.attachment import AttachmentOut

router = APIRouter(prefix="/attachments", tags=["attachments"])

ALLOWED_MIME_PREFIXES = ("image/", "video/")


def _is_allowed(mime: str) -> bool:
    return any(mime.startswith(p) for p in ALLOWED_MIME_PREFIXES)


def _decorate(att: Attachment) -> AttachmentOut:
    out = AttachmentOut.model_validate(att)
    out.url = f"/api/attachments/{att.id}/raw"
    out.preview_url = out.url
    out.is_image = att.mime_type.startswith("image/")
    out.is_video = att.mime_type.startswith("video/")
    return out


@router.get("", response_model=list[AttachmentOut])
async def list_attachments(
    db: DBSession,
    _: CurrentUser,
    target_type: AttachmentTarget,
    target_id: int = Query(..., gt=0),
) -> list[AttachmentOut]:
    rows = (
        await db.execute(
            select(Attachment)
            .where(
                Attachment.target_type == target_type,
                Attachment.target_id == target_id,
            )
            .order_by(Attachment.created_at.asc())
        )
    ).scalars().unique().all()
    return [_decorate(a) for a in rows]


@router.post("", response_model=List[AttachmentOut], status_code=status.HTTP_201_CREATED)
async def upload_attachments(
    db: DBSession,
    user: CurrentUser,
    target_type: AttachmentTarget = Query(...),
    target_id: int = Query(..., gt=0),
    files: list[UploadFile] = File(...),
) -> list[AttachmentOut]:
    if not files:
        raise HTTPException(status_code=400, detail="No files supplied")

    upload_root: Path = settings.upload_path
    folder = upload_root / target_type.value / str(target_id)
    folder.mkdir(parents=True, exist_ok=True)

    out: list[AttachmentOut] = []

    for f in files:
        mime = f.content_type or "application/octet-stream"
        if not _is_allowed(mime):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {mime} (only image/* and video/* allowed)",
            )

        # Stream to disk with a random prefix to avoid collisions; preserve original filename.
        ext = Path(f.filename or "file").suffix
        random = secrets.token_hex(8)
        on_disk = folder / f"{random}{ext}"
        size = 0
        async with aiofiles.open(on_disk, "wb") as out_fp:
            while chunk := await f.read(1024 * 1024):
                size += len(chunk)
                if size > settings.MAX_UPLOAD_BYTES:
                    await out_fp.close()
                    on_disk.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large (>{settings.MAX_UPLOAD_BYTES // (1024*1024)} MB)",
                    )
                await out_fp.write(chunk)

        att = Attachment(
            filename=f.filename or on_disk.name,
            storage_path=str(on_disk.relative_to(upload_root)),
            mime_type=mime,
            size=size,
            target_type=target_type,
            target_id=target_id,
            uploader_id=user.id,
        )
        db.add(att)
        await db.flush()
        out.append(_decorate(att))

    await db.commit()
    return out


@router.get("/{attachment_id}/raw")
async def download_attachment(attachment_id: int, db: DBSession, _: CurrentUser) -> FileResponse:
    att = await db.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    full = settings.upload_path / att.storage_path
    if not full.is_file():
        raise HTTPException(status_code=410, detail="Attachment file is missing on disk")
    return FileResponse(
        path=full,
        media_type=att.mime_type,
        filename=att.filename,
    )


@router.delete(
    "/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_attachment(
    attachment_id: int, db: DBSession, user: CurrentUser
):
    att = await db.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if att.uploader_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only uploader or admin may delete")
    full = settings.upload_path / att.storage_path
    try:
        if full.is_file():
            os.remove(full)
    except OSError:
        # Best effort - DB record removal is the source of truth.
        pass
    await db.delete(att)
    await db.commit()

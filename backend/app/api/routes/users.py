from __future__ import annotations

import os
import secrets
from pathlib import Path

import aiofiles
from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, DBSession
from app.core.audit import record_audit
from app.core.config import settings
from app.core.security import hash_password
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

# Avatar uploads: stricter than the generic attachment allowlist - we never
# want to serve videos or animated formats as a profile picture.
AVATAR_ALLOWED_MIMES: set[str] = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
}
# Cap avatar uploads at 5 MB - generous for any reasonable photo, prevents
# someone from filling disk via the avatar endpoint.
AVATAR_MAX_BYTES: int = 5 * 1024 * 1024


def _avatar_dir(user_id: int) -> Path:
    folder = settings.upload_path / "avatars" / str(user_id)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _purge_old_avatar(user: User) -> None:
    """Delete the previous on-disk avatar so we don't leak storage on each
    re-upload. Best-effort: missing files / OS errors are swallowed."""
    if not user.avatar:
        return
    try:
        old = settings.upload_path / user.avatar
        if old.is_file():
            old.unlink()
    except OSError:
        pass


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=4, max_length=72)


@router.get("", response_model=list[UserOut])
async def list_users(db: DBSession, _: CurrentUser) -> list[UserOut]:
    """All authenticated users may list members (used as assignee picker).
    Inactive users are returned too so the FE can label them."""
    rows = (await db.execute(select(User).order_by(User.id.asc()))).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate, db: DBSession, admin: AdminUser, request: Request
) -> UserOut:
    existing = (
        await db.execute(select(User).where(User.username == payload.username))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        is_active=payload.is_active,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await record_audit(
        db,
        actor=admin,
        action=AuditAction.create,
        target_type=AuditTargetType.user,
        target_id=user.id,
        target_label=f"{user.username} ({user.role.value})",
        request=request,
        status_code=201,
    )
    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: DBSession,
    admin: AdminUser,
    request: Request,
) -> UserOut:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    # Prevent admin from de-activating or demoting themselves accidentally.
    if user.id == admin.id:
        if data.get("is_active") is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        if data.get("role") and data["role"] != UserRole.admin:
            raise HTTPException(status_code=400, detail="Cannot demote yourself")
    for k, v in data.items():
        setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    await record_audit(
        db,
        actor=admin,
        action=AuditAction.update,
        target_type=AuditTargetType.user,
        target_id=user.id,
        target_label=user.username,
        request=request,
        status_code=200,
        extra={"changed": list(data.keys())},
    )
    return UserOut.model_validate(user)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_user(
    user_id: int, db: DBSession, admin: AdminUser, request: Request
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    # Soft-delete by deactivation to preserve referential integrity (creators of stories etc.)
    user.is_active = False
    await db.commit()
    await record_audit(
        db,
        actor=admin,
        action=AuditAction.delete,
        target_type=AuditTargetType.user,
        target_id=user.id,
        target_label=f"{user.username} (deactivated)",
        request=request,
        status_code=204,
    )


@router.post(
    "/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def reset_password(
    user_id: int,
    payload: ResetPasswordIn,
    db: DBSession,
    admin: AdminUser,
    request: Request,
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    await record_audit(
        db,
        actor=admin,
        action=AuditAction.password_change,
        target_type=AuditTargetType.user,
        target_id=user.id,
        target_label=f"reset-password for {user.username}",
        request=request,
        status_code=204,
    )


# --- Avatar -------------------------------------------------------------
# We keep avatar serving behind auth (same as every other media asset) so a
# leaked URL doesn't expose user pictures. The frontend wraps <img> with the
# AuthImage helper that fetches via axios and turns the response into a blob
# URL, which is the same trick the AttachmentList component already uses.


@router.post("/me/avatar", response_model=UserOut)
async def upload_my_avatar(
    db: DBSession,
    user: CurrentUser,
    request: Request,
    file: UploadFile = File(...),
) -> UserOut:
    """Replace the current user's avatar. Old file (if any) is purged."""
    mime = (file.content_type or "").lower()
    if mime not in AVATAR_ALLOWED_MIMES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported avatar type: {mime or 'unknown'}. "
                f"Allowed: {', '.join(sorted(AVATAR_ALLOWED_MIMES))}"
            ),
        )

    folder = _avatar_dir(user.id)
    ext = Path(file.filename or "avatar").suffix or ".png"
    on_disk = folder / f"{secrets.token_hex(8)}{ext}"
    size = 0
    async with aiofiles.open(on_disk, "wb") as out_fp:
        while chunk := await file.read(1024 * 256):
            size += len(chunk)
            if size > AVATAR_MAX_BYTES:
                await out_fp.close()
                on_disk.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"Avatar too large (>{AVATAR_MAX_BYTES // (1024 * 1024)} MB)",
                )
            await out_fp.write(chunk)

    if size == 0:
        on_disk.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Empty file")

    # Swap the avatar atomically: persist the new path, then purge the old.
    old_relative = user.avatar
    new_relative = str(on_disk.relative_to(settings.upload_path)).replace(os.sep, "/")
    user.avatar = new_relative
    await db.commit()
    await db.refresh(user)

    if old_relative:
        try:
            old_path = settings.upload_path / old_relative
            if old_path.is_file():
                old_path.unlink()
        except OSError:
            pass

    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.user,
        target_id=user.id,
        target_label=f"{user.username} avatar set",
        request=request,
        status_code=200,
        extra={"changed": ["avatar"], "size": size},
    )
    return UserOut.model_validate(user)


@router.delete(
    "/me/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_my_avatar(
    db: DBSession,
    user: CurrentUser,
    request: Request,
):
    """Remove the current user's avatar (file + DB pointer)."""
    if not user.avatar:
        # Idempotent - already empty.
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    _purge_old_avatar(user)
    user.avatar = None
    await db.commit()

    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.user,
        target_id=user.id,
        target_label=f"{user.username} avatar cleared",
        request=request,
        status_code=204,
        extra={"changed": ["avatar"]},
    )


@router.get("/{user_id}/avatar")
async def get_user_avatar(
    user_id: int, db: DBSession, _: CurrentUser
) -> FileResponse:
    """Stream the user's avatar image. Returns 404 if no avatar is set or
    the file went missing on disk (e.g. wiped uploads volume)."""
    user = await db.get(User, user_id)
    if not user or not user.avatar:
        raise HTTPException(status_code=404, detail="No avatar")
    full = settings.upload_path / user.avatar
    if not full.is_file():
        raise HTTPException(status_code=410, detail="Avatar file missing on disk")

    # Best-effort mime sniff from extension; fall back to octet-stream so the
    # browser at least won't try to execute anything.
    ext = full.suffix.lower()
    media_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")

    return FileResponse(
        path=full,
        media_type=media_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            # Allow short browser caching - avatars rarely change, and we
            # bust the cache via the avatar path (which contains a random
            # token) when a user uploads a new one.
            "Cache-Control": "private, max-age=300",
        },
    )

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, DBSession
from app.core.audit import record_audit
from app.core.security import hash_password
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


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

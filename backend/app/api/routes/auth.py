from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from typing import Annotated

from fastapi import Depends

from app.api.deps import CurrentUser, DBSession
from app.core.audit import record_audit
from app.core.security import create_access_token, hash_password, verify_password
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.user import User
from app.schemas.user import LoginRequest, PasswordChange, Token, UserMe, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


async def _login_flow(
    db: DBSession,
    request: Request,
    username: str,
    password: str,
) -> Token:
    user = (
        await db.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        await record_audit(
            db,
            actor=user,  # may be None
            action=AuditAction.login_failed,
            target_type=AuditTargetType.auth,
            target_label=f"username={username}",
            request=request,
            status_code=401,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if not user.is_active:
        await record_audit(
            db,
            actor=user,
            action=AuditAction.login_failed,
            target_type=AuditTargetType.auth,
            target_label=f"username={username} (disabled)",
            request=request,
            status_code=403,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    token = create_access_token(user.id, extra={"role": user.role.value})
    await record_audit(
        db,
        actor=user,
        action=AuditAction.login,
        target_type=AuditTargetType.auth,
        target_id=user.id,
        target_label=user.username,
        request=request,
        status_code=200,
    )
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DBSession,
    request: Request,
) -> Token:
    """OAuth2-form login (used by Swagger). Body fields: username, password."""
    return await _login_flow(db, request, form_data.username, form_data.password)


@router.post("/login-json", response_model=Token)
async def login_json(payload: LoginRequest, db: DBSession, request: Request) -> Token:
    return await _login_flow(db, request, payload.username, payload.password)


@router.get("/me", response_model=UserMe)
async def me(user: CurrentUser) -> UserMe:
    return UserMe.model_validate(user)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def change_password(
    payload: PasswordChange, user: CurrentUser, db: DBSession, request: Request
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must differ from the current one")
    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    await record_audit(
        db,
        actor=user,
        action=AuditAction.password_change,
        target_type=AuditTargetType.user,
        target_id=user.id,
        target_label=user.username,
        request=request,
        status_code=204,
    )

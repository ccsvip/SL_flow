from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.ai import mask_key
from app.core.audit import record_audit
from app.models.api_key import APIKey
from app.models.audit_log import AuditAction, AuditTargetType
from app.schemas.api_key import APIKeyCreate, APIKeyOut, APIKeyUpdate

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _out(row: APIKey) -> APIKeyOut:
    out = APIKeyOut.model_validate(row)
    out.api_key_masked = mask_key(row.api_key)
    return out


async def _get_owned_key(db: DBSession, key_id: int, owner_id: int) -> APIKey:
    row = await db.get(APIKey, key_id)
    if row is None or row.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="API key not found")
    return row


@router.get("", response_model=list[APIKeyOut])
async def list_api_keys(db: DBSession, user: CurrentUser) -> list[APIKeyOut]:
    rows = (
        await db.execute(
            select(APIKey)
            .where(APIKey.owner_id == user.id)
            .order_by(APIKey.updated_at.desc(), APIKey.id.desc())
        )
    ).scalars().unique().all()
    return [_out(row) for row in rows]


@router.get("/{key_id}", response_model=APIKeyOut)
async def get_api_key(key_id: int, db: DBSession, user: CurrentUser) -> APIKeyOut:
    return _out(await _get_owned_key(db, key_id, user.id))


@router.post("", response_model=APIKeyOut, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: APIKeyCreate,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> APIKeyOut:
    row = APIKey(**payload.model_dump(), owner_id=user.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await record_audit(
        db,
        actor=user,
        action=AuditAction.create,
        target_type=AuditTargetType.managed_api_key,
        target_id=row.id,
        target_label=row.title,
        request=request,
        status_code=201,
        extra={"models": len(row.models or [])},
    )
    return _out(row)


@router.patch("/{key_id}", response_model=APIKeyOut)
async def update_api_key(
    key_id: int,
    payload: APIKeyUpdate,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> APIKeyOut:
    row = await _get_owned_key(db, key_id, user.id)
    data = payload.model_dump(exclude_unset=True)
    changed: list[str] = []
    for key, value in data.items():
        if getattr(row, key) != value:
            setattr(row, key, value)
            changed.append(key)

    await db.commit()
    await db.refresh(row)
    if changed:
        await record_audit(
            db,
            actor=user,
            action=AuditAction.update,
            target_type=AuditTargetType.managed_api_key,
            target_id=row.id,
            target_label=row.title,
            request=request,
            status_code=200,
            extra={"changed": changed},
        )
    return _out(row)


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_api_key(
    key_id: int,
    db: DBSession,
    user: CurrentUser,
    request: Request,
):
    row = await _get_owned_key(db, key_id, user.id)
    label = row.title
    await db.delete(row)
    await db.commit()
    await record_audit(
        db,
        actor=user,
        action=AuditAction.delete,
        target_type=AuditTargetType.managed_api_key,
        target_id=key_id,
        target_label=label,
        request=request,
        status_code=204,
    )

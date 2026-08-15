from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.memo import Memo
from app.schemas.memo import MemoCreate, MemoOut, MemoUpdate

router = APIRouter(prefix="/memos", tags=["memos"])


async def _get_owned_memo(db: DBSession, memo_id: int, owner_id: int) -> Memo:
    row = await db.get(Memo, memo_id)
    if row is None or row.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Memo not found")
    return row


@router.get("", response_model=list[MemoOut])
async def list_memos(
    db: DBSession,
    user: CurrentUser,
    q: Optional[str] = Query(default=None, description="Search title or content"),
    category: Optional[str] = Query(default=None),
) -> list[MemoOut]:
    """Return the caller's memos, optionally filtered by keyword / category.

    Results are sorted: pinned first, then by updated_at descending.
    """
    stmt = (
        select(Memo)
        .where(Memo.owner_id == user.id)
        .order_by(Memo.pinned.desc(), Memo.updated_at.desc(), Memo.id.desc())
    )
    if category is not None:
        if category == "":
            stmt = stmt.where(
                (Memo.category.is_(None)) | (Memo.category == "")
            )
        else:
            stmt = stmt.where(Memo.category == category)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            (Memo.title.ilike(pattern)) | (Memo.content.ilike(pattern))
        )
    rows = (await db.execute(stmt)).scalars().unique().all()
    return [MemoOut.model_validate(r) for r in rows]


@router.get("/categories", response_model=list[str])
async def list_categories(db: DBSession, user: CurrentUser) -> list[str]:
    """Return the distinct, non-empty category names owned by the caller."""
    stmt = (
        select(Memo.category)
        .where(Memo.owner_id == user.id)
        .where(Memo.category.isnot(None))
        .distinct()
    )
    rows = (await db.execute(stmt)).scalars().all()
    return sorted({r for r in rows if r and r.strip()})


@router.get("/{memo_id}", response_model=MemoOut)
async def get_memo(memo_id: int, db: DBSession, user: CurrentUser) -> MemoOut:
    row = await _get_owned_memo(db, memo_id, user.id)
    return MemoOut.model_validate(row)


@router.post("", response_model=MemoOut, status_code=status.HTTP_201_CREATED)
async def create_memo(
    payload: MemoCreate,
    db: DBSession,
    user: CurrentUser,
) -> MemoOut:
    row = Memo(**payload.model_dump(), owner_id=user.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return MemoOut.model_validate(row)


@router.patch("/{memo_id}", response_model=MemoOut)
async def update_memo(
    memo_id: int,
    payload: MemoUpdate,
    db: DBSession,
    user: CurrentUser,
) -> MemoOut:
    row = await _get_owned_memo(db, memo_id, user.id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return MemoOut.model_validate(row)


@router.delete(
    "/{memo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_memo(
    memo_id: int,
    db: DBSession,
    user: CurrentUser,
):
    row = await _get_owned_memo(db, memo_id, user.id)
    await db.delete(row)
    await db.commit()

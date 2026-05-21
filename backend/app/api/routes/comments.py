from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.comment import Comment, CommentTargetType
from app.schemas.comment import CommentCreate, CommentOut

router = APIRouter(prefix="/comments", tags=["comments"])


@router.get("", response_model=list[CommentOut])
async def list_comments(
    db: DBSession,
    _: CurrentUser,
    target_type: CommentTargetType,
    target_id: int = Query(..., gt=0),
) -> list[CommentOut]:
    stmt = (
        select(Comment)
        .where(Comment.target_type == target_type, Comment.target_id == target_id)
        .order_by(Comment.created_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    return [CommentOut.model_validate(c) for c in rows]


@router.post("", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(
    payload: CommentCreate, db: DBSession, user: CurrentUser
) -> CommentOut:
    c = Comment(**payload.model_dump(), author_id=user.id)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return CommentOut.model_validate(c)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: int, db: DBSession, user: CurrentUser) -> None:
    c = await db.get(Comment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.author_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only the author or admin may delete")
    await db.delete(c)
    await db.commit()

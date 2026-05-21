from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.audit import record_audit
from app.models.audit_log import AuditAction, AuditTargetType
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
    payload: CommentCreate, db: DBSession, user: CurrentUser, request: Request
) -> CommentOut:
    c = Comment(**payload.model_dump(), author_id=user.id)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    snippet = c.body[:80] + ("..." if len(c.body) > 80 else "")
    await record_audit(
        db,
        actor=user,
        action=AuditAction.create,
        target_type=AuditTargetType.comment,
        target_id=c.id,
        target_label=f"on {c.target_type.value}#{c.target_id}: {snippet}",
        request=request,
        status_code=201,
    )
    return CommentOut.model_validate(c)


@router.delete(
    "/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_comment(
    comment_id: int, db: DBSession, user: CurrentUser, request: Request
):
    c = await db.get(Comment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.author_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only the author or admin may delete")
    cid = c.id
    snippet = c.body[:80] + ("..." if len(c.body) > 80 else "")
    target_ref = f"on {c.target_type.value}#{c.target_id}"
    await db.delete(c)
    await db.commit()
    await record_audit(
        db,
        actor=user,
        action=AuditAction.delete,
        target_type=AuditTargetType.comment,
        target_id=cid,
        target_label=f"{target_ref}: {snippet}",
        request=request,
        status_code=204,
    )

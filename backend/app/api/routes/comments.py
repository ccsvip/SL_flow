from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.audit import record_audit
from app.core.notify import notify_comment, notify_mentions
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.bug import Bug
from app.models.comment import Comment, CommentTargetType
from app.models.notification import NotificationTargetType
from app.models.story import Story
from app.models.task import Task
from app.schemas.comment import CommentCreate, CommentOut

router = APIRouter(prefix="/comments", tags=["comments"])


# Map a comment-target to its notification-target equivalent. Comments
# attach to project/story/task/bug; the notification target is the parent
# entity itself (the comment_id is stored separately on the notification).
_COMMENT_TO_NOTIF_TARGET = {
    CommentTargetType.project: NotificationTargetType.project,
    CommentTargetType.story: NotificationTargetType.story,
    CommentTargetType.task: NotificationTargetType.task,
    CommentTargetType.bug: NotificationTargetType.bug,
}


async def _resolve_parent_label_and_watchers(
    db, target_type: CommentTargetType, target_id: int
) -> tuple[str, list[int]]:
    """Return a human label like "task #42 标题" plus the user ids that
    should be notified about a new comment (creator + assignee, deduped).

    For project comments we only return the project owner because there's
    no "assignee" concept on Project. NULL when the parent doesn't exist.
    """
    if target_type == CommentTargetType.task:
        t = await db.get(Task, target_id)
        if not t:
            return (f"task#{target_id}", [])
        watchers = [u for u in (t.creator_id, t.assignee_id) if u]
        return (f"任务 #{t.id} {t.title}", watchers)
    if target_type == CommentTargetType.story:
        s = await db.get(Story, target_id)
        if not s:
            return (f"story#{target_id}", [])
        watchers = [u for u in (s.creator_id, s.assignee_id) if u]
        return (f"需求 #{s.id} {s.title}", watchers)
    if target_type == CommentTargetType.bug:
        b = await db.get(Bug, target_id)
        if not b:
            return (f"bug#{target_id}", [])
        watchers = [u for u in (b.creator_id, b.assignee_id) if u]
        return (f"缺陷 #{b.id} {b.title}", watchers)
    # project
    from app.models.project import Project
    p = await db.get(Project, target_id)
    if not p:
        return (f"project#{target_id}", [])
    return (f"项目 #{p.id} {p.name}", [p.owner_id] if p.owner_id else [])


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

    # Notifications: @mentions first (so we can dedupe them out of the
    # broader watcher list), then watcher fan-out.
    notif_target = _COMMENT_TO_NOTIF_TARGET[c.target_type]
    parent_label, watchers = await _resolve_parent_label_and_watchers(
        db, c.target_type, c.target_id
    )
    # Resolve mentioned users so we can pass their ids as exclude list.
    from app.core.notify import parse_mentions, resolve_mention_targets
    mentioned_users = (
        await resolve_mention_targets(db, parse_mentions(c.body))
        if c.body
        else []
    )
    mentioned_ids = {u.id for u in mentioned_users}

    await notify_mentions(
        db,
        actor=user,
        body=c.body,
        target_type=notif_target,
        target_id=c.target_id,
        target_label=parent_label,
        comment_id=c.id,
    )
    await notify_comment(
        db,
        actor=user,
        recipient_ids=watchers,
        body=c.body,
        target_type=notif_target,
        target_id=c.target_id,
        target_label=parent_label,
        comment_id=c.id,
        exclude_ids=mentioned_ids,
    )
    await db.commit()

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

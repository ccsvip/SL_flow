from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.core.audit import record_audit
from app.core.notify import notify_assigned, notify_status_changed
from app.models.attachment import Attachment, AttachmentTarget
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.notification import NotificationTargetType
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _attachment_counts(db, target_ids: list[int]) -> dict[int, int]:
    """Bulk count attachments for a list of task ids. One round-trip,
    grouped server-side. Returns an id -> count map."""
    if not target_ids:
        return {}
    rows = (
        await db.execute(
            select(Attachment.target_id, func.count(Attachment.id))
            .where(
                Attachment.target_type == AttachmentTarget.task,
                Attachment.target_id.in_(target_ids),
            )
            .group_by(Attachment.target_id)
        )
    ).all()
    return {tid: cnt for tid, cnt in rows}


def _task_to_out(t: Task, counts: dict[int, int]) -> TaskOut:
    out = TaskOut.model_validate(t)
    out.attachment_count = counts.get(t.id, 0)
    return out


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    db: DBSession,
    _: CurrentUser,
    project_id: int | None = Query(default=None),
    story_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    assignee_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[TaskOut]:
    stmt = select(Task).order_by(Task.created_at.desc())
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    if story_id is not None:
        stmt = stmt.where(Task.story_id == story_id)
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if q:
        stmt = stmt.where(Task.title.ilike(f"%{q}%"))
    rows = (await db.execute(stmt)).scalars().unique().all()
    counts = await _attachment_counts(db, [t.id for t in rows])
    return [_task_to_out(t, counts) for t in rows]


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: int, db: DBSession, _: CurrentUser) -> TaskOut:
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    counts = await _attachment_counts(db, [t.id])
    return _task_to_out(t, counts)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate, db: DBSession, user: CurrentUser, request: Request
) -> TaskOut:
    t = Task(**payload.model_dump(), creator_id=user.id)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    await record_audit(
        db,
        actor=user,
        action=AuditAction.create,
        target_type=AuditTargetType.task,
        target_id=t.id,
        target_label=t.title,
        request=request,
        status_code=201,
    )
    # Notify the brand-new assignee (if any).
    if t.assignee_id and t.assignee_id != user.id:
        await notify_assigned(
            db,
            actor=user,
            assignee_id=t.assignee_id,
            target_type=NotificationTargetType.task,
            target_id=t.id,
            target_label=t.title,
        )
        await db.commit()
    counts = await _attachment_counts(db, [t.id])
    return _task_to_out(t, counts)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> TaskOut:
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    # Snapshot the values we care about BEFORE we apply the patch so we
    # can diff and emit notifications.
    prev_status = t.status.value if hasattr(t.status, "value") else str(t.status)
    prev_assignee_id = t.assignee_id

    changed = list(payload.model_dump(exclude_unset=True).keys())
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.task,
        target_id=t.id,
        target_label=t.title,
        request=request,
        status_code=200,
        extra={"changed": changed},
    )

    # Notification fan-out:
    #   * assignee changed → tell the new assignee
    #   * status changed → tell the assignee (or creator if unassigned)
    notif_emitted = False
    if t.assignee_id and t.assignee_id != prev_assignee_id and t.assignee_id != user.id:
        await notify_assigned(
            db,
            actor=user,
            assignee_id=t.assignee_id,
            target_type=NotificationTargetType.task,
            target_id=t.id,
            target_label=t.title,
        )
        notif_emitted = True

    new_status = t.status.value if hasattr(t.status, "value") else str(t.status)
    if new_status != prev_status:
        recipient = t.assignee_id or t.creator_id
        if recipient and recipient != user.id:
            await notify_status_changed(
                db,
                actor=user,
                recipient_id=recipient,
                from_status=prev_status,
                to_status=new_status,
                target_type=NotificationTargetType.task,
                target_id=t.id,
                target_label=t.title,
            )
            notif_emitted = True

    if notif_emitted:
        await db.commit()

    counts = await _attachment_counts(db, [t.id])
    return _task_to_out(t, counts)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_task(
    task_id: int, db: DBSession, user: CurrentUser, request: Request
):
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    if t.creator_id != user.id and user.role.value != "admin":
        raise HTTPException(
            status_code=403, detail="Only the creator or admin may delete this task"
        )
    tid = t.id
    label = t.title
    await db.delete(t)
    await db.commit()
    await record_audit(
        db,
        actor=user,
        action=AuditAction.delete,
        target_type=AuditTargetType.task,
        target_id=tid,
        target_label=label,
        request=request,
        status_code=204,
    )

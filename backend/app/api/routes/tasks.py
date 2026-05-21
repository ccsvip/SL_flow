from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


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
    return [TaskOut.model_validate(t) for t in rows]


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: int, db: DBSession, _: CurrentUser) -> TaskOut:
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskOut.model_validate(t)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, db: DBSession, user: CurrentUser) -> TaskOut:
    t = Task(**payload.model_dump(), creator_id=user.id)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return TaskOut.model_validate(t)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int, payload: TaskUpdate, db: DBSession, _: CurrentUser
) -> TaskOut:
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return TaskOut.model_validate(t)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_task(task_id: int, db: DBSession, _: CurrentUser):
    t = await db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(t)
    await db.commit()

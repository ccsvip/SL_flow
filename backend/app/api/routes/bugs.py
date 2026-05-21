from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.bug import Bug
from app.schemas.bug import BugCreate, BugOut, BugUpdate

router = APIRouter(prefix="/bugs", tags=["bugs"])


@router.get("", response_model=list[BugOut])
async def list_bugs(
    db: DBSession,
    _: CurrentUser,
    project_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    severity: str | None = Query(default=None),
    assignee_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[BugOut]:
    stmt = select(Bug).order_by(Bug.created_at.desc())
    if project_id is not None:
        stmt = stmt.where(Bug.project_id == project_id)
    if status_filter:
        stmt = stmt.where(Bug.status == status_filter)
    if severity:
        stmt = stmt.where(Bug.severity == severity)
    if assignee_id is not None:
        stmt = stmt.where(Bug.assignee_id == assignee_id)
    if q:
        stmt = stmt.where(Bug.title.ilike(f"%{q}%"))
    rows = (await db.execute(stmt)).scalars().unique().all()
    return [BugOut.model_validate(b) for b in rows]


@router.get("/{bug_id}", response_model=BugOut)
async def get_bug(bug_id: int, db: DBSession, _: CurrentUser) -> BugOut:
    b = await db.get(Bug, bug_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bug not found")
    return BugOut.model_validate(b)


@router.post("", response_model=BugOut, status_code=status.HTTP_201_CREATED)
async def create_bug(payload: BugCreate, db: DBSession, user: CurrentUser) -> BugOut:
    b = Bug(**payload.model_dump(), creator_id=user.id)
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return BugOut.model_validate(b)


@router.patch("/{bug_id}", response_model=BugOut)
async def update_bug(bug_id: int, payload: BugUpdate, db: DBSession, _: CurrentUser) -> BugOut:
    b = await db.get(Bug, bug_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bug not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    await db.commit()
    await db.refresh(b)
    return BugOut.model_validate(b)


@router.delete(
    "/{bug_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_bug(bug_id: int, db: DBSession, _: CurrentUser):
    b = await db.get(Bug, bug_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bug not found")
    await db.delete(b)
    await db.commit()

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.audit import record_audit
from app.models.audit_log import AuditAction, AuditTargetType
from app.models.story import Story
from app.schemas.story import StoryCreate, StoryOut, StoryUpdate

router = APIRouter(prefix="/stories", tags=["stories"])


@router.get("", response_model=list[StoryOut])
async def list_stories(
    db: DBSession,
    _: CurrentUser,
    project_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    assignee_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[StoryOut]:
    stmt = select(Story).order_by(Story.created_at.desc())
    if project_id is not None:
        stmt = stmt.where(Story.project_id == project_id)
    if status_filter:
        stmt = stmt.where(Story.status == status_filter)
    if assignee_id is not None:
        stmt = stmt.where(Story.assignee_id == assignee_id)
    if q:
        stmt = stmt.where(Story.title.ilike(f"%{q}%"))
    rows = (await db.execute(stmt)).scalars().unique().all()
    return [StoryOut.model_validate(s) for s in rows]


@router.get("/{story_id}", response_model=StoryOut)
async def get_story(story_id: int, db: DBSession, _: CurrentUser) -> StoryOut:
    s = await db.get(Story, story_id)
    if not s:
        raise HTTPException(status_code=404, detail="Story not found")
    return StoryOut.model_validate(s)


@router.post("", response_model=StoryOut, status_code=status.HTTP_201_CREATED)
async def create_story(
    payload: StoryCreate, db: DBSession, user: CurrentUser, request: Request
) -> StoryOut:
    s = Story(**payload.model_dump(), creator_id=user.id)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    await record_audit(
        db,
        actor=user,
        action=AuditAction.create,
        target_type=AuditTargetType.story,
        target_id=s.id,
        target_label=s.title,
        request=request,
        status_code=201,
    )
    return StoryOut.model_validate(s)


@router.patch("/{story_id}", response_model=StoryOut)
async def update_story(
    story_id: int,
    payload: StoryUpdate,
    db: DBSession,
    user: CurrentUser,
    request: Request,
) -> StoryOut:
    s = await db.get(Story, story_id)
    if not s:
        raise HTTPException(status_code=404, detail="Story not found")
    changed = list(payload.model_dump(exclude_unset=True).keys())
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    await record_audit(
        db,
        actor=user,
        action=AuditAction.update,
        target_type=AuditTargetType.story,
        target_id=s.id,
        target_label=s.title,
        request=request,
        status_code=200,
        extra={"changed": changed},
    )
    return StoryOut.model_validate(s)


@router.delete(
    "/{story_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_story(
    story_id: int, db: DBSession, user: CurrentUser, request: Request
):
    s = await db.get(Story, story_id)
    if not s:
        raise HTTPException(status_code=404, detail="Story not found")
    if s.creator_id != user.id and user.role.value != "admin":
        raise HTTPException(
            status_code=403, detail="Only the creator or admin may delete this story"
        )
    sid = s.id
    label = s.title
    await db.delete(s)
    await db.commit()
    await record_audit(
        db,
        actor=user,
        action=AuditAction.delete,
        target_type=AuditTargetType.story,
        target_id=sid,
        target_label=label,
        request=request,
        status_code=204,
    )

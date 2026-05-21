from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.models import Bug, Project, Story, Task
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


async def _decorate(db, project: Project) -> ProjectOut:
    out = ProjectOut.model_validate(project)
    out.story_count = (
        await db.execute(
            select(func.count(Story.id)).where(Story.project_id == project.id)
        )
    ).scalar_one()
    out.task_count = (
        await db.execute(
            select(func.count(Task.id)).where(Task.project_id == project.id)
        )
    ).scalar_one()
    out.bug_count = (
        await db.execute(
            select(func.count(Bug.id)).where(Bug.project_id == project.id)
        )
    ).scalar_one()
    return out


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    db: DBSession,
    _: CurrentUser,
    q: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[ProjectOut]:
    stmt = select(Project).order_by(Project.created_at.desc())
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Project.name.ilike(like)) | (Project.code.ilike(like)))
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    rows = (await db.execute(stmt)).scalars().unique().all()
    return [await _decorate(db, p) for p in rows]


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, db: DBSession, _: CurrentUser) -> ProjectOut:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return await _decorate(db, project)


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate, db: DBSession, user: CurrentUser
) -> ProjectOut:
    existing = (
        await db.execute(select(Project).where(Project.code == payload.code))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Project code already exists")
    project = Project(**payload.model_dump(), owner_id=user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return await _decorate(db, project)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int, payload: ProjectUpdate, db: DBSession, _: CurrentUser
) -> ProjectOut:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    await db.commit()
    await db.refresh(project)
    return await _decorate(db, project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_project(project_id: int, db: DBSession, user: CurrentUser):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Only the project owner or an admin can drop a project. Project deletion
    # cascades to all stories/tasks/bugs - we don't let a random user nuke it.
    if project.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only the project owner or admin may delete this project",
        )
    await db.delete(project)
    await db.commit()

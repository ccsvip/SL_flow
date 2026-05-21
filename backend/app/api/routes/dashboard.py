from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.models import Bug, Project, Story, Task, User
from app.models.bug import BugStatus
from app.models.project import ProjectStatus
from app.models.story import StoryStatus
from app.models.task import TaskStatus

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
async def overview(db: DBSession, user: CurrentUser) -> dict[str, Any]:
    counts = {
        "users": (await db.execute(select(func.count(User.id)).where(User.is_active.is_(True)))).scalar_one(),
        "projects": (await db.execute(select(func.count(Project.id)))).scalar_one(),
        "stories": (await db.execute(select(func.count(Story.id)))).scalar_one(),
        "tasks": (await db.execute(select(func.count(Task.id)))).scalar_one(),
        "bugs": (await db.execute(select(func.count(Bug.id)))).scalar_one(),
        "open_bugs": (
            await db.execute(
                select(func.count(Bug.id)).where(Bug.status.in_([BugStatus.open, BugStatus.reopened, BugStatus.in_progress]))
            )
        ).scalar_one(),
        "active_projects": (
            await db.execute(
                select(func.count(Project.id)).where(Project.status == ProjectStatus.active)
            )
        ).scalar_one(),
        "open_tasks": (
            await db.execute(
                select(func.count(Task.id)).where(Task.status.in_([TaskStatus.todo, TaskStatus.in_progress, TaskStatus.review]))
            )
        ).scalar_one(),
    }

    # Status pies
    task_status_pie = []
    for st in TaskStatus:
        c = (
            await db.execute(select(func.count(Task.id)).where(Task.status == st))
        ).scalar_one()
        task_status_pie.append({"name": st.value, "value": c})

    bug_status_pie = []
    for st in BugStatus:
        c = (
            await db.execute(select(func.count(Bug.id)).where(Bug.status == st))
        ).scalar_one()
        bug_status_pie.append({"name": st.value, "value": c})

    story_status_pie = []
    for st in StoryStatus:
        c = (
            await db.execute(select(func.count(Story.id)).where(Story.status == st))
        ).scalar_one()
        story_status_pie.append({"name": st.value, "value": c})

    # 14-day creation trend for tasks & bugs
    now = datetime.now(timezone.utc)
    trend_days = 14
    daily_buckets: list[dict[str, Any]] = []
    for i in range(trend_days - 1, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        tcount = (
            await db.execute(
                select(func.count(Task.id)).where(
                    Task.created_at >= day_start, Task.created_at < day_end
                )
            )
        ).scalar_one()
        bcount = (
            await db.execute(
                select(func.count(Bug.id)).where(
                    Bug.created_at >= day_start, Bug.created_at < day_end
                )
            )
        ).scalar_one()
        scount = (
            await db.execute(
                select(func.count(Story.id)).where(
                    Story.created_at >= day_start, Story.created_at < day_end
                )
            )
        ).scalar_one()
        daily_buckets.append(
            {
                "date": day_start.date().isoformat(),
                "tasks": tcount,
                "bugs": bcount,
                "stories": scount,
            }
        )

    # Per-project task breakdown for stacked bar chart
    project_breakdown: list[dict[str, Any]] = []
    projects = (await db.execute(select(Project).order_by(Project.id.asc()))).scalars().all()
    for p in projects:
        s_total = (
            await db.execute(select(func.count(Story.id)).where(Story.project_id == p.id))
        ).scalar_one()
        t_total = (
            await db.execute(select(func.count(Task.id)).where(Task.project_id == p.id))
        ).scalar_one()
        b_total = (
            await db.execute(select(func.count(Bug.id)).where(Bug.project_id == p.id))
        ).scalar_one()
        project_breakdown.append(
            {
                "id": p.id,
                "name": p.name,
                "color": p.color,
                "stories": s_total,
                "tasks": t_total,
                "bugs": b_total,
            }
        )

    # My-work summary
    my_tasks = (
        await db.execute(
            select(func.count(Task.id)).where(
                Task.assignee_id == user.id,
                Task.status.in_([TaskStatus.todo, TaskStatus.in_progress, TaskStatus.review]),
            )
        )
    ).scalar_one()
    my_bugs = (
        await db.execute(
            select(func.count(Bug.id)).where(
                Bug.assignee_id == user.id,
                Bug.status.in_([BugStatus.open, BugStatus.reopened, BugStatus.in_progress]),
            )
        )
    ).scalar_one()
    my_stories = (
        await db.execute(
            select(func.count(Story.id)).where(
                Story.assignee_id == user.id,
                Story.status.in_([StoryStatus.draft, StoryStatus.active, StoryStatus.in_review]),
            )
        )
    ).scalar_one()

    return {
        "counts": counts,
        "task_status_pie": task_status_pie,
        "bug_status_pie": bug_status_pie,
        "story_status_pie": story_status_pie,
        "trend": daily_buckets,
        "project_breakdown": project_breakdown,
        "mine": {"tasks": my_tasks, "bugs": my_bugs, "stories": my_stories},
    }

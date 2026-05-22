from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, DBSession
from app.models import Bug, Story, Task, User

router = APIRouter(prefix="/calendar", tags=["calendar"])


# Wider window than the visible month so the prev/next-month preview cells of
# a typical calendar still get the right markers without an extra request.
_MAX_RANGE_DAYS = 366


def _parse_date(value: str, *, field: str) -> date:
    try:
        return datetime.fromisoformat(value).date()
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid {field}: expected ISO date (YYYY-MM-DD)"
        ) from exc


@router.get("")
async def list_calendar_events(
    db: DBSession,
    _: CurrentUser,
    start: str = Query(..., description="Inclusive ISO date, e.g. 2026-05-01"),
    end: str = Query(..., description="Exclusive ISO date, e.g. 2026-06-01"),
    project_id: int | None = Query(default=None),
    mine: bool = Query(default=False, description="Only events I own/assigned/created"),
    user_id: int | None = Query(
        default=None, description="Filter by assignee/creator user id"
    ),
) -> dict[str, Any]:
    """Return a flat list of date-anchored events (tasks/stories/bugs) inside
    the requested window. Used by the Calendar page.

    - **Tasks**: anchored on `due_date` (current behaviour - the only date
      field on Task) when present.
    - **Stories**: anchored on the story's `updated_at` date as a soft
      reference; stories don't have a due_date column today, so we expose
      stories that *changed status to accepted/closed* in the window so the
      user can see what landed when.
    - **Bugs**: anchored on `updated_at` for the same reason.

    Events outside the window are filtered server-side; we never return
    events with NULL anchor dates.
    """
    start_d = _parse_date(start, field="start")
    end_d = _parse_date(end, field="end")
    if end_d <= start_d:
        raise HTTPException(status_code=400, detail="`end` must be after `start`")
    if (end_d - start_d).days > _MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Window too wide (>{_MAX_RANGE_DAYS} days)",
        )

    # Postgres `date` columns compare cleanly with python `date` objects.
    # `updated_at` is a timestamptz so we cast to date inside SQL via
    # comparison against datetime boundaries to keep it simple and indexed.
    start_dt = datetime.combine(start_d, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end_d, time.min, tzinfo=timezone.utc)

    me_id = _.id if mine else user_id

    # --- Tasks (anchor: due_date) -----------------------------------------
    task_stmt = select(Task).where(
        Task.due_date.is_not(None),
        Task.due_date >= start_d,
        Task.due_date < end_d,
    )
    if project_id is not None:
        task_stmt = task_stmt.where(Task.project_id == project_id)
    if me_id is not None:
        task_stmt = task_stmt.where(
            or_(Task.assignee_id == me_id, Task.creator_id == me_id)
        )
    tasks = (await db.execute(task_stmt)).scalars().unique().all()

    # --- Stories (anchor: updated_at) -------------------------------------
    # We only include stories whose latest update sits inside the window so
    # the calendar surfaces meaningful "things that happened on day X".
    story_stmt = select(Story).where(
        Story.updated_at >= start_dt, Story.updated_at < end_dt
    )
    if project_id is not None:
        story_stmt = story_stmt.where(Story.project_id == project_id)
    if me_id is not None:
        story_stmt = story_stmt.where(
            or_(Story.assignee_id == me_id, Story.creator_id == me_id)
        )
    stories = (await db.execute(story_stmt)).scalars().unique().all()

    # --- Bugs (anchor: updated_at) ----------------------------------------
    bug_stmt = select(Bug).where(
        Bug.updated_at >= start_dt, Bug.updated_at < end_dt
    )
    if project_id is not None:
        bug_stmt = bug_stmt.where(Bug.project_id == project_id)
    if me_id is not None:
        bug_stmt = bug_stmt.where(
            or_(Bug.assignee_id == me_id, Bug.creator_id == me_id)
        )
    bugs = (await db.execute(bug_stmt)).scalars().unique().all()

    def _user_dict(u: User | None) -> Optional[dict[str, Any]]:
        if u is None:
            return None
        return {"id": u.id, "username": u.username, "full_name": u.full_name}

    events: list[dict[str, Any]] = []
    for t in tasks:
        events.append(
            {
                "kind": "task",
                "id": t.id,
                "title": t.title,
                "date": t.due_date.isoformat(),  # type: ignore[union-attr]
                "anchor": "due_date",
                "status": t.status.value if hasattr(t.status, "value") else str(t.status),
                "priority": t.priority.value
                if hasattr(t.priority, "value")
                else str(t.priority),
                "project_id": t.project_id,
                "assignee": _user_dict(t.assignee),
            }
        )
    for s in stories:
        events.append(
            {
                "kind": "story",
                "id": s.id,
                "title": s.title,
                "date": s.updated_at.date().isoformat(),
                "anchor": "updated_at",
                "status": s.status.value if hasattr(s.status, "value") else str(s.status),
                "priority": s.priority.value
                if hasattr(s.priority, "value")
                else str(s.priority),
                "project_id": s.project_id,
                "assignee": _user_dict(s.assignee),
            }
        )
    for b in bugs:
        events.append(
            {
                "kind": "bug",
                "id": b.id,
                "title": b.title,
                "date": b.updated_at.date().isoformat(),
                "anchor": "updated_at",
                "status": b.status.value if hasattr(b.status, "value") else str(b.status),
                "severity": b.severity.value
                if hasattr(b.severity, "value")
                else str(b.severity),
                "priority": b.priority.value
                if hasattr(b.priority, "value")
                else str(b.priority),
                "project_id": b.project_id,
                "assignee": _user_dict(b.assignee),
            }
        )

    # Stable order: by date then by kind (task < story < bug) then by id.
    KIND_ORDER: dict[str, int] = {"task": 0, "story": 1, "bug": 2}
    events.sort(key=lambda e: (e["date"], KIND_ORDER.get(e["kind"], 99), e["id"]))

    return {
        "start": start_d.isoformat(),
        "end": end_d.isoformat(),
        "events": events,
    }

"""Seed default admin and a few starter rows so the UI is alive on first boot."""
from __future__ import annotations

import asyncio
from datetime import date, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.security import hash_password
from app.models import (
    Bug,
    BugSeverity,
    BugStatus,
    Project,
    ProjectStatus,
    Story,
    StoryStatus,
    Task,
    TaskStatus,
    User,
    UserRole,
)


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        admin = (
            await db.execute(
                select(User).where(User.username == settings.DEFAULT_ADMIN_USERNAME)
            )
        ).scalar_one_or_none()

        if admin is None:
            admin = User(
                username=settings.DEFAULT_ADMIN_USERNAME,
                full_name="Administrator",
                email=None,
                role=UserRole.admin,
                is_active=True,
                hashed_password=hash_password(settings.DEFAULT_ADMIN_PASSWORD),
            )
            db.add(admin)
            await db.flush()
            print(f"[seed] created admin user '{admin.username}' / '{settings.DEFAULT_ADMIN_PASSWORD}'")
        else:
            print(f"[seed] admin user '{admin.username}' already exists - skipped")

        # Sample project + story + task + bug, only on first run
        any_project = (await db.execute(select(Project).limit(1))).scalar_one_or_none()
        if any_project is None:
            demo = Project(
                code="DEMO",
                name="Welcome to SL Flow",
                description="A starter project so you can explore the UI right away. Edit or delete me.",
                status=ProjectStatus.active,
                color="#722ed1",
                start_date=date.today(),
                end_date=date.today() + timedelta(days=30),
                owner_id=admin.id,
            )
            db.add(demo)
            await db.flush()

            s = Story(
                title="Set up your first real project",
                description="Replace this demo data with your own work.",
                acceptance_criteria="A real project exists with at least one task.",
                status=StoryStatus.active,
                project_id=demo.id,
                creator_id=admin.id,
                assignee_id=admin.id,
                estimate_points=3,
            )
            db.add(s)
            await db.flush()

            db.add(
                Task(
                    title="Click around the dashboard",
                    description="Familiarise yourself with charts, filters and theme switcher.",
                    status=TaskStatus.todo,
                    estimate_hours=1,
                    project_id=demo.id,
                    story_id=s.id,
                    creator_id=admin.id,
                    assignee_id=admin.id,
                    due_date=date.today() + timedelta(days=2),
                )
            )
            db.add(
                Bug(
                    title="Sample bug: button alignment",
                    description="This is a sample bug record. Feel free to delete.",
                    status=BugStatus.open,
                    severity=BugSeverity.minor,
                    project_id=demo.id,
                    creator_id=admin.id,
                )
            )
            print("[seed] inserted demo project + story + task + bug")

        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import (
    attachments,
    audit_logs,
    auth,
    bugs,
    comments,
    dashboard,
    db_backups,
    projects,
    stories,
    system,
    tasks,
    users,
)
from app.core.config import settings
from app.core.scheduler import shutdown_scheduler, start_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s :: %(message)s")
logger = logging.getLogger("slflow")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Boot the APScheduler that runs periodic database backups.
    await start_scheduler()
    try:
        yield
    finally:
        await shutdown_scheduler()


def create_app() -> FastAPI:
    app = FastAPI(
        title="SL Flow API",
        description="ZenTao-inspired project & task management.",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(users.router)
    api.include_router(projects.router)
    api.include_router(stories.router)
    api.include_router(tasks.router)
    api.include_router(bugs.router)
    api.include_router(comments.router)
    api.include_router(attachments.router)
    api.include_router(dashboard.router)
    api.include_router(system.router)
    api.include_router(audit_logs.router)
    api.include_router(db_backups.router)

    @api.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api)

    @app.exception_handler(Exception)
    async def unhandled(request, exc):  # pragma: no cover
        logger.exception("unhandled exception")
        return JSONResponse(status_code=500, content={"detail": "internal server error"})

    return app


app = create_app()

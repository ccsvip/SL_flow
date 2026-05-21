from __future__ import annotations

import asyncio
import os
import shlex
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from app.api.deps import AdminUser, CurrentUser
from app.core.config import settings

router = APIRouter(prefix="/system", tags=["system"])


def _read_local_version() -> str:
    p = Path(settings.APP_VERSION_FILE)
    if p.is_file():
        return p.read_text(encoding="utf-8").strip()
    return "0.0.0"


async def _run(cmd: list[str], cwd: str | None = None, timeout: float = 60.0) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return 124, "", "command timeout"
    return proc.returncode or 0, stdout.decode("utf-8", "ignore"), stderr.decode("utf-8", "ignore")


async def _git_info() -> dict[str, Any]:
    repo = settings.GIT_REPO_PATH
    if not Path(repo, ".git").exists():
        return {"available": False, "reason": "Not a git working tree at GIT_REPO_PATH"}

    info: dict[str, Any] = {"available": True, "path": repo}

    rc, out, _ = await _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo)
    info["branch"] = out.strip() if rc == 0 else None

    rc, out, _ = await _run(["git", "rev-parse", "HEAD"], cwd=repo)
    info["local_commit"] = out.strip() if rc == 0 else None

    rc, out, _ = await _run(["git", "log", "-1", "--pretty=%s|%an|%ai"], cwd=repo)
    if rc == 0 and out.strip():
        msg, author, date = out.strip().split("|", 2)
        info["local_message"] = msg
        info["local_author"] = author
        info["local_date"] = date
    return info


@router.get("/version")
async def get_version(_: CurrentUser) -> dict[str, Any]:
    git = await _git_info()
    return {
        "app_version": _read_local_version(),
        "hot_reload_enabled": settings.ENABLE_HOT_RELOAD,
        "git": git,
    }


@router.post("/check-update")
async def check_update(_: AdminUser) -> dict[str, Any]:
    if not settings.ENABLE_HOT_RELOAD:
        raise HTTPException(status_code=400, detail="Hot reload disabled by configuration")

    repo = settings.GIT_REPO_PATH
    if not Path(repo, ".git").exists():
        raise HTTPException(status_code=400, detail="Not a git working tree at GIT_REPO_PATH")

    rc, _, err = await _run(["git", "fetch", "--all", "--prune"], cwd=repo, timeout=90)
    if rc != 0:
        raise HTTPException(status_code=502, detail=f"git fetch failed: {err.strip()}")

    info = await _git_info()
    branch = info.get("branch") or "main"
    rc, remote_commit, _ = await _run(["git", "rev-parse", f"origin/{branch}"], cwd=repo)
    if rc != 0:
        info["remote_available"] = False
        info["update_available"] = False
        return info

    remote_commit = remote_commit.strip()
    info["remote_commit"] = remote_commit
    info["remote_available"] = True
    info["update_available"] = remote_commit and remote_commit != info.get("local_commit")

    if info["update_available"]:
        rc, out, _ = await _run(
            ["git", "log", "-1", "--pretty=%s|%an|%ai", remote_commit], cwd=repo
        )
        if rc == 0 and out.strip():
            parts = out.strip().split("|", 2)
            info["remote_message"] = parts[0]
            info["remote_author"] = parts[1] if len(parts) > 1 else None
            info["remote_date"] = parts[2] if len(parts) > 2 else None

        rc, out, _ = await _run(
            [
                "git",
                "log",
                "--pretty=%h %s",
                f"{info['local_commit']}..{remote_commit}",
            ],
            cwd=repo,
        )
        if rc == 0:
            info["incoming_commits"] = [line for line in out.strip().splitlines() if line]

    return info


async def _do_pull_and_rebuild() -> None:
    """Background task: git pull and `docker compose up -d --build`.

    Runs detached so we can return 202 to the client before the backend
    container itself restarts.
    """
    repo = settings.GIT_REPO_PATH
    log_path = Path("/app/uploads/.last_update.log")
    log_path.parent.mkdir(parents=True, exist_ok=True)

    async def _log(msg: str) -> None:
        with log_path.open("a", encoding="utf-8") as fp:
            fp.write(msg + "\n")

    await _log(f"=== update at {asyncio.get_event_loop().time()} ===")
    rc, out, err = await _run(["git", "pull", "--ff-only"], cwd=repo, timeout=180)
    await _log(f"[git pull] rc={rc}\n{out}\n{err}")
    if rc != 0:
        return

    # Rebuild via host docker (compose project name = directory basename or env COMPOSE_PROJECT_NAME).
    rc, out, err = await _run(
        ["docker", "compose", "up", "-d", "--build"], cwd=repo, timeout=600
    )
    await _log(f"[compose up] rc={rc}\n{out}\n{err}")


@router.post("/apply-update", status_code=status.HTTP_202_ACCEPTED)
async def apply_update(_: AdminUser, bg: BackgroundTasks) -> dict[str, Any]:
    if not settings.ENABLE_HOT_RELOAD:
        raise HTTPException(status_code=400, detail="Hot reload disabled")
    repo = settings.GIT_REPO_PATH
    if not Path(repo, ".git").exists():
        raise HTTPException(status_code=400, detail="Not a git working tree")
    bg.add_task(_do_pull_and_rebuild)
    return {
        "status": "scheduled",
        "message": "Update started in background. The backend will rebuild and restart shortly.",
    }


@router.get("/update-log")
async def update_log(_: AdminUser) -> dict[str, str]:
    log_path = Path("/app/uploads/.last_update.log")
    if not log_path.is_file():
        return {"log": ""}
    return {"log": log_path.read_text(encoding="utf-8", errors="ignore")[-8000:]}

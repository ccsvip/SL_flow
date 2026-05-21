from __future__ import annotations

import asyncio
import json
import os
import time
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
    info["update_available"] = bool(remote_commit) and remote_commit != info.get("local_commit")

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


async def _resolve_host_repo_path() -> str | None:
    """Find the HOST filesystem path of the repo so the sibling updater
    container can bind-mount it correctly via the docker socket.

    Strategy:
      1. Use $HOST_REPO_PATH if explicitly provided in env (preferred path).
      2. Fall back to `docker inspect $HOSTNAME` and read the Source of the
         mount whose Destination is /workspace.
      3. Return None if both fail (caller will refuse to schedule an update).
    """
    explicit = os.environ.get("HOST_REPO_PATH", "").strip()
    if explicit:
        return explicit

    container_id = os.environ.get("HOSTNAME", "").strip()
    if not container_id:
        return None

    rc, out, _ = await _run(
        ["docker", "inspect", container_id], timeout=10
    )
    if rc != 0 or not out.strip():
        return None

    try:
        info = json.loads(out)
        if not info:
            return None
        mounts = info[0].get("Mounts", []) or []
        for m in mounts:
            if m.get("Destination") == "/workspace":
                src = m.get("Source") or ""
                return src or None
    except (ValueError, KeyError, IndexError):
        return None
    return None


async def _resolve_compose_project_name() -> str:
    """Pin the compose project name so the sibling updater targets the
    SAME running stack instead of creating a parallel "workspace" project.

    Order: $COMPOSE_PROJECT_NAME env -> docker inspect label -> "slflow".
    """
    explicit = os.environ.get("COMPOSE_PROJECT_NAME", "").strip()
    if explicit:
        return explicit

    container_id = os.environ.get("HOSTNAME", "").strip()
    if container_id:
        rc, out, _ = await _run(["docker", "inspect", container_id], timeout=10)
        if rc == 0 and out.strip():
            try:
                info = json.loads(out)
                if info:
                    labels = info[0].get("Config", {}).get("Labels", {}) or {}
                    name = labels.get("com.docker.compose.project")
                    if name:
                        return name
            except (ValueError, KeyError, IndexError):
                pass
    return "slflow"


async def _do_pull_and_rebuild() -> None:
    """Background task: git pull and `docker compose up -d --build`.

    The compose rebuild will recreate this very backend container, which
    SIGKILLs every PID inside the container's namespace. `setsid` + `nohup`
    cannot save us - they detach from the parent process, not from the
    container's pid namespace.

    Solution: spawn the rebuild from a SIBLING docker container that lives
    in its own pid namespace. The host docker daemon owns that sibling, so
    when this backend container dies, the sibling survives, finishes the
    rebuild, and the new backend comes up.

    Critical correctness requirements (otherwise the sibling rebuilds the
    WRONG thing or nothing at all):
      - Bind-mount the HOST repo path, not /workspace from inside this
        container (the host daemon resolves paths in the host filesystem).
      - Pass COMPOSE_PROJECT_NAME so the sibling's `docker compose up`
        targets the same stack instead of a parallel "workspace" one.
      - Write logs to a path BOTH the backend AND the sibling can see -
        i.e. inside the workspace bind-mount, not /app/uploads (which is
        only visible to the backend).
    """
    repo = settings.GIT_REPO_PATH
    # Logs and lock both live inside the workspace so the sibling can
    # append to the same file the backend reads. Without this, the
    # /api/system/update-log endpoint would never see anything past the
    # `[spawn]` line (the sibling's writes would land on the workspace
    # volume only, while the route reads from /app/uploads).
    log_path = Path(repo) / ".last_update.log"
    lock_path = Path(repo) / ".update.lock"

    def _log(msg: str) -> None:
        try:
            with log_path.open("a", encoding="utf-8") as fp:
                fp.write(msg + "\n")
        except OSError:
            pass  # log is best-effort

    # Atomic lock acquisition via O_CREAT|O_EXCL. Two concurrent admins
    # clicking "apply-update" race here; only one wins. The loser exits
    # quietly. Stale locks (>15 min old) are reclaimed in the same call.
    locked = False
    try:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
            os.close(fd)
            locked = True
        except FileExistsError:
            # Reclaim if stale.
            try:
                age = time.time() - lock_path.stat().st_mtime
            except OSError:
                age = 0
            if age > 900:
                try:
                    lock_path.unlink()
                    fd = os.open(
                        str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644
                    )
                    os.close(fd)
                    locked = True
                except (FileExistsError, OSError):
                    _log("[abort] could not reclaim stale lock")
                    return
            else:
                _log("[abort] another update is already in progress")
                return

        _log(f"=== update started at {time.strftime('%Y-%m-%dT%H:%M:%S%z')} ===")

        # 1. git pull (synchronous, fast).
        rc, out, err = await _run(["git", "pull", "--ff-only"], cwd=repo, timeout=180)
        _log(f"[git pull] rc={rc}\n{out}\n{err}")
        if rc != 0:
            _log("[abort] git pull failed - skipping rebuild")
            return

        # 2. Discover host paths and project name (so the sibling targets
        # exactly this running stack).
        host_repo = await _resolve_host_repo_path()
        if not host_repo:
            _log(
                "[abort] cannot resolve HOST_REPO_PATH - set it in .env "
                "(absolute host path of the repo) or grant docker socket "
                "access so we can inspect ourselves."
            )
            return
        project = await _resolve_compose_project_name()
        _log(f"[spawn] host_repo={host_repo} project={project}")

        # Best-effort: kill any leftover updater container from a previous run.
        await _run(["docker", "rm", "-f", "slflow-updater"], timeout=10)

        # 3. Spawn the sibling. It runs `docker compose up -d --build` against
        # the same project as the running stack. When this backend container
        # is recreated mid-rebuild, the sibling keeps going.
        inner_script = (
            "echo \"[updater] starting at $(date -Iseconds)\" >> /workspace/.last_update.log && "
            "cd /workspace && "
            "docker compose up -d --build >> /workspace/.last_update.log 2>&1; "
            "rc=$?; "
            "echo \"[updater] docker compose up exit=$rc at $(date -Iseconds)\" >> /workspace/.last_update.log; "
            # Best-effort: clean up the lock file the spawner left behind so
            # the next update can proceed once we're done.
            "rm -f /workspace/.update.lock; "
            "exit $rc"
        )
        sibling_cmd = [
            "docker",
            "run",
            "--rm",
            "-d",
            "--name",
            "slflow-updater",
            "-e",
            f"COMPOSE_PROJECT_NAME={project}",
            "-v",
            "/var/run/docker.sock:/var/run/docker.sock",
            "-v",
            f"{host_repo}:/workspace",
            "-w",
            "/workspace",
            # Pin minor for stability; bump explicitly when you need a newer
            # compose plugin. The official `docker` image bundles the
            # docker-compose-plugin since 24.x.
            "docker:27.5.1-cli",
            "sh",
            "-c",
            inner_script,
        ]

        rc, out, err = await _run(sibling_cmd, timeout=60)
        _log(f"[spawn] docker run rc={rc} sibling_id={out.strip()[:12]}\n{err}")
        if rc != 0:
            _log("[abort] failed to spawn updater sibling")
            return

        # On success we deliberately leave the lock file in place; the
        # sibling removes it as its last step. If our backend container
        # is recreated before that, the sibling still gets to clean up.
        # `locked` stays True so the `finally` below does NOT remove it -
        # the sibling owns it from now on.
        locked = False  # transferred ownership
    finally:
        if locked:
            lock_path.unlink(missing_ok=True)


@router.post("/apply-update", status_code=status.HTTP_202_ACCEPTED)
async def apply_update(_: AdminUser, bg: BackgroundTasks) -> dict[str, Any]:
    if not settings.ENABLE_HOT_RELOAD:
        raise HTTPException(status_code=400, detail="Hot reload disabled")
    repo = settings.GIT_REPO_PATH
    if not Path(repo, ".git").exists():
        raise HTTPException(
            status_code=400,
            detail="Not a git working tree at GIT_REPO_PATH. The hot-update feature requires the project to be cloned via git, not unzipped.",
        )
    bg.add_task(_do_pull_and_rebuild)
    return {
        "status": "scheduled",
        "message": "Update scheduled in background. The backend will rebuild and restart shortly. Refresh the page in 30-90 seconds.",
    }


@router.get("/update-log")
async def update_log(_: AdminUser) -> dict[str, str]:
    # Read from the workspace location so we can see the SIBLING's writes
    # (the sibling only mounts the workspace, not /app/uploads).
    log_path = Path(settings.GIT_REPO_PATH) / ".last_update.log"
    if not log_path.is_file():
        return {"log": ""}
    return {"log": log_path.read_text(encoding="utf-8", errors="ignore")[-8000:]}

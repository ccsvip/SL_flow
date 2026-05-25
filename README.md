# SL Flow

A modern, ZenTao-inspired project & task management platform.

## Stack

- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL 16 + Alembic + JWT
- **Frontend**: React 18 + TypeScript + Vite + Ant Design 5 + Zustand + TanStack Query + ECharts
- **Infra**: Docker Compose + Nginx

## Features

- JWT authentication, password change, default `admin / admin` (change on first login!)
- Roles: `admin` and `user`. Admin can create/manage users; users see same features minus user management.
- Projects, Stories (requirements), Tasks, Bugs - full CRUD with comments.
- Multi-file uploads (images & videos), preview & lightbox.
- Dashboard with ECharts visualizations (status pies, trend lines, kanban heatmaps).
- Light / Dark / Auto theme switching.
- Built-in version detection & one-click hot update (git pull + service restart).
- Confirm dialogs on destructive actions, optimistic UI, toast feedback.

## Quick Start

```bash
# 1. Create .env from the example
cp .env.example .env

# 2. Generate a strong JWT secret (the backend refuses to boot without one)
#    Replace the SECRET_KEY=replace-me-* line in .env with the output of:
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))"

# 3. Set HOST_REPO_PATH in .env to the ABSOLUTE host path of this repo,
#    e.g. /srv/slflow on Linux, or C:\code\mine\SL_flow on Windows.
#    This is required for the hot-update feature to mount the right source
#    when it spawns the updater sibling container.

# 4. Boot the stack
docker compose up -d --build
```

Then open http://localhost:8080 and log in with `admin / admin`.

> **Windows PowerShell users:** the `>` redirection writes UTF-16 LE which
> can confuse some shells. Either use git-bash / WSL for the secret-generation
> step, or run it inside the container after the first build:
> `docker compose run --rm backend python -c "import secrets; print(secrets.token_urlsafe(48))"`

## Hot Update

The backend container mounts the host docker socket (`/var/run/docker.sock`) and
the project directory (`./` → `/workspace`). Clicking **「立即应用更新」** in
the UI triggers:

1. If the working tree has uncommitted changes (manual sysadmin tweaks,
   stale lockfiles, etc.) the backend runs `git stash push -u -m
   slflow-pre-update-{ts}` first so the pull doesn't fail with "your local
   changes would be overwritten". The stash is left as a recoverable safety
   net (`git stash list` / `git stash apply`) and is NOT auto-popped.
2. `git pull --ff-only` inside the backend container against `/workspace`.
3. Spawn of a sibling container `slflow-updater` (image `docker:27.5.1-cli`)
   that owns the orchestration. The sibling is given the **host** repo path
   (from `HOST_REPO_PATH`) and the original `COMPOSE_PROJECT_NAME` so its
   compose commands target the same running stack.
4. The sibling runs `docker compose build` FIRST. If the build fails, the
   running containers stay up untouched and the failure is logged to
   `.last_update.log`. Only when the build succeeds does the sibling run
   `docker compose up -d --remove-orphans` to swap in the new images, then
   poll `/api/healthz` for up to 120s and log the result.

Disable by setting `ENABLE_HOT_RELOAD=false`.

### Recovering from a stuck update

If a hot update fails (502 errors, backend restart loop, "another update is
in progress" forever), SSH to the host, then:

```bash
cd /root/workspace/SL_flow   # or wherever HOST_REPO_PATH points
sudo bash scripts/recover.sh
```

The script clears stale locks + orphan updater containers, rebuilds backend
and frontend in place (database keeps running), waits for `/api/healthz` to
return 200, and prints diagnostic logs if it doesn't. The currently running
stack stays alive while the rebuild happens; only on a successful build does
it swap containers.

## Default Ports

- Frontend: http://localhost:8080
- Backend API: http://localhost:8000 (proxied at `/api` via the frontend Nginx)
- PostgreSQL: localhost:5432

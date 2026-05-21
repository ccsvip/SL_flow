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
# 1. Generate a strong JWT secret (the backend refuses to boot without one)
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))" > .env
# 2. Append the rest of the defaults
cat .env.example | grep -v '^SECRET_KEY=' >> .env
# 3. Boot the stack
docker compose up -d --build
```

Then open http://localhost:8080 and log in with `admin / admin`.

## Hot Update

The backend container mounts the project directory and the host docker socket.
When the user clicks "check for update" the backend runs `git fetch` against the
working tree at `/workspace`, compares `HEAD` to `origin/<branch>`, and on
confirmation runs `git pull` and triggers `docker compose up -d --build` against
the host daemon. Disable by setting `ENABLE_HOT_RELOAD=false`.

## Default Ports

- Frontend: http://localhost:8080
- Backend API: http://localhost:8000 (proxied at `/api` via the frontend Nginx)
- PostgreSQL: localhost:5432

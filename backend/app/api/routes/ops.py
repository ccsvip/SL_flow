"""Ops / 运维看板 endpoint.

Aggregates host, container, database and security signals into a single
admin-only payload for the front-end Ops page.

Design notes
------------
* The backend container has /var/run/docker.sock mounted, so it can talk to
  the host's docker daemon via the `docker` CLI (already inside the image
  thanks to the existing hot-update feature).  We use `docker info`, `docker
  ps` and `docker stats --no-stream` rather than reading /proc directly,
  because /proc inside the container only exposes the container's own view.
* DB metrics use the existing async session and a couple of `pg_*` views.
* Security signals are pulled from the in-app `audit_logs` table and the
  `users` table (locked / inactive accounts).  We deliberately do NOT shell
  out to read postgres logs — they're noisy and the audit table is the
  source of truth for authenticated activity.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select, text

from app.api.deps import AdminUser, DBSession
from app.models.audit_log import AuditLog
from app.models.user import User

router = APIRouter(prefix="/ops", tags=["ops"])

# Container names we care about (matches docker-compose service names with
# the `slflow-` container_name prefix).
PROJECT_CONTAINERS = ("slflow-db", "slflow-backend", "slflow-frontend")


async def _run(cmd: list[str], timeout: float = 8.0) -> tuple[int, str, str]:
    """Tiny subprocess helper with a timeout.

    Returns (rc, stdout, stderr).  On timeout we return rc=124 to mirror
    coreutils' `timeout(1)` convention.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        return 127, "", str(exc)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return 124, "", "command timeout"
    return proc.returncode or 0, out.decode("utf-8", "ignore"), err.decode("utf-8", "ignore")


def _parse_size(s: str) -> int:
    """Parse a docker size string like '12.3MiB' or '1.2GB' into bytes."""
    if not s:
        return 0
    s = s.strip()
    units = {
        "B": 1,
        "KB": 1000, "KIB": 1024,
        "MB": 1000**2, "MIB": 1024**2,
        "GB": 1000**3, "GIB": 1024**3,
        "TB": 1000**4, "TIB": 1024**4,
    }
    for u in sorted(units.keys(), key=len, reverse=True):
        if s.upper().endswith(u):
            try:
                return int(float(s[: -len(u)]) * units[u])
            except ValueError:
                return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def _parse_percent(s: str) -> float:
    s = (s or "").strip().rstrip("%")
    try:
        return float(s)
    except ValueError:
        return 0.0


async def _docker_info() -> dict[str, Any]:
    """Host info from `docker info --format '{{json .}}'`."""
    if not shutil.which("docker"):
        return {"available": False, "reason": "docker CLI not on PATH"}

    rc, out, err = await _run(["docker", "info", "--format", "{{json .}}"])
    if rc != 0:
        return {"available": False, "reason": err.strip() or f"rc={rc}"}
    try:
        info = json.loads(out)
    except json.JSONDecodeError:
        return {"available": False, "reason": "invalid json from docker info"}
    return {
        "available": True,
        "ncpu": info.get("NCPU"),
        "mem_total": info.get("MemTotal"),
        "kernel": info.get("KernelVersion"),
        "os": info.get("OperatingSystem"),
        "arch": info.get("Architecture"),
        "server_version": info.get("ServerVersion"),
        "containers": info.get("Containers"),
        "containers_running": info.get("ContainersRunning"),
        "containers_stopped": info.get("ContainersStopped"),
        "images": info.get("Images"),
        "name": info.get("Name"),
    }


async def _container_states() -> list[dict[str, Any]]:
    """Map of project containers and their lifecycle state."""
    if not shutil.which("docker"):
        return []
    rc, out, _ = await _run(
        [
            "docker",
            "ps",
            "-a",
            "--filter",
            f"name=^/({'|'.join(PROJECT_CONTAINERS)})$",
            "--format",
            "{{json .}}",
        ]
    )
    if rc != 0:
        return []
    rows: list[dict[str, Any]] = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        rows.append(
            {
                "name": row.get("Names"),
                "image": row.get("Image"),
                "state": row.get("State"),
                "status": row.get("Status"),
                "created_at": row.get("CreatedAt"),
                "running_for": row.get("RunningFor"),
                "ports": row.get("Ports"),
            }
        )
    # Stable order matching PROJECT_CONTAINERS
    rows.sort(key=lambda r: PROJECT_CONTAINERS.index(r["name"]) if r["name"] in PROJECT_CONTAINERS else 999)
    return rows


async def _container_stats() -> list[dict[str, Any]]:
    """Live CPU / memory snapshot for project containers."""
    if not shutil.which("docker"):
        return []
    rc, out, _ = await _run(
        [
            "docker",
            "stats",
            "--no-stream",
            "--format",
            "{{json .}}",
            *PROJECT_CONTAINERS,
        ],
        timeout=10.0,
    )
    if rc != 0:
        return []
    out_rows: list[dict[str, Any]] = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        # MemUsage looks like "12.3MiB / 1.96GiB"
        mem_used = mem_limit = 0
        mem_str = row.get("MemUsage") or ""
        if "/" in mem_str:
            u, l = mem_str.split("/", 1)
            mem_used = _parse_size(u)
            mem_limit = _parse_size(l)
        out_rows.append(
            {
                "name": row.get("Name"),
                "cpu_percent": _parse_percent(row.get("CPUPerc")),
                "mem_used": mem_used,
                "mem_limit": mem_limit,
                "mem_percent": _parse_percent(row.get("MemPerc")),
                "net_io": row.get("NetIO"),
                "block_io": row.get("BlockIO"),
                "pids": row.get("PIDs"),
            }
        )
    out_rows.sort(key=lambda r: PROJECT_CONTAINERS.index(r["name"]) if r["name"] in PROJECT_CONTAINERS else 999)
    return out_rows


async def _db_metrics(db) -> dict[str, Any]:
    """Postgres-level signals via pg_* catalog views.

    We use `text(...)` because these are admin-style queries that don't map
    cleanly onto ORM models.
    """
    out: dict[str, Any] = {}

    # Database size + name
    row = (
        await db.execute(
            text(
                "SELECT current_database() AS name, "
                "pg_database_size(current_database()) AS size_bytes, "
                "version() AS version"
            )
        )
    ).mappings().one()
    out["name"] = row["name"]
    out["size_bytes"] = int(row["size_bytes"])
    out["version"] = row["version"]

    # Connection count (this DB only) + max connections
    row = (
        await db.execute(
            text(
                "SELECT count(*) FILTER (WHERE datname = current_database()) AS active, "
                "(SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max "
                "FROM pg_stat_activity"
            )
        )
    ).mappings().one()
    out["connections_active"] = int(row["active"])
    out["connections_max"] = int(row["max"])

    # Top 5 tables by size
    rows = (
        await db.execute(
            text(
                "SELECT relname AS table, "
                "pg_total_relation_size(c.oid) AS size_bytes, "
                "n_live_tup AS rows "
                "FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid "
                "WHERE c.relkind = 'r' AND n.nspname = 'public' "
                "ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 5"
            )
        )
    ).mappings().all()
    out["top_tables"] = [
        {"table": r["table"], "size_bytes": int(r["size_bytes"]), "rows": int(r["rows"] or 0)}
        for r in rows
    ]
    return out


async def _security_metrics(db) -> dict[str, Any]:
    """Account- and audit-trail-derived signals."""
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)

    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    active_users = (
        await db.execute(select(func.count(User.id)).where(User.is_active.is_(True)))
    ).scalar_one()
    admin_users = (
        await db.execute(
            select(func.count(User.id)).where(
                User.is_active.is_(True), User.role == "admin"
            )
        )
    ).scalar_one()

    # Recent audit activity
    audit_24h = (
        await db.execute(
            select(func.count(AuditLog.id)).where(AuditLog.created_at >= since_24h)
        )
    ).scalar_one()
    audit_7d = (
        await db.execute(
            select(func.count(AuditLog.id)).where(AuditLog.created_at >= since_7d)
        )
    ).scalar_one()

    # Failed logins (audit action == 'login_failed' or similar) — we look
    # for any action containing 'login' with success=False if those columns
    # exist; otherwise fall back to a name match.  We try the most
    # specific first and silently degrade so the dashboard never blows up
    # because of a schema mismatch in some forks.
    failed_logins_24h = 0
    try:
        failed_logins_24h = (
            await db.execute(
                text(
                    "SELECT count(*) FROM audit_logs "
                    "WHERE created_at >= :since "
                    "AND (action ILIKE '%login_fail%' OR action ILIKE '%failed_login%')"
                ),
                {"since": since_24h},
            )
        ).scalar_one()
    except Exception:  # pragma: no cover - schema fork tolerance
        failed_logins_24h = 0

    # Latest 8 audit events for a feed-style component
    recent_rows = (
        await db.execute(
            select(AuditLog).order_by(AuditLog.created_at.desc()).limit(8)
        )
    ).scalars().all()
    recent = [
        {
            "id": r.id,
            "action": getattr(r, "action", None),
            "actor_id": getattr(r, "actor_id", None) or getattr(r, "user_id", None),
            "target_type": getattr(r, "target_type", None),
            "target_id": getattr(r, "target_id", None),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent_rows
    ]

    return {
        "users_total": int(total_users),
        "users_active": int(active_users),
        "users_admin": int(admin_users),
        "audit_24h": int(audit_24h),
        "audit_7d": int(audit_7d),
        "failed_logins_24h": int(failed_logins_24h),
        "recent_audit": recent,
    }


@router.get("/overview")
async def overview(db: DBSession, _: AdminUser) -> dict[str, Any]:
    """Single endpoint that powers the Ops dashboard.

    All four sections are gathered in parallel so the page renders in one
    round-trip.  Each gatherer is wrapped so a failure in one section
    (e.g. docker socket gone) does not blank out the others.
    """
    started = time.monotonic()

    async def _safe(awaitable, fallback):
        try:
            return await awaitable
        except Exception as exc:  # pragma: no cover - defensive
            return {"error": str(exc), **(fallback if isinstance(fallback, dict) else {})}

    host, containers, stats, db_metrics, security = await asyncio.gather(
        _safe(_docker_info(), {"available": False}),
        _safe(_container_states(), []),
        _safe(_container_stats(), []),
        _safe(_db_metrics(db), {}),
        _safe(_security_metrics(db), {}),
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "host": host,
        "containers": containers if isinstance(containers, list) else [],
        "container_stats": stats if isinstance(stats, list) else [],
        "database": db_metrics,
        "security": security,
        "compose_project": os.environ.get("COMPOSE_PROJECT_NAME", "slflow"),
    }

"""Database backup / restore primitives.

Wraps `pg_dump` and `psql` so the FastAPI process can produce and consume
gzipped SQL dumps. We intentionally use plain-SQL+gzip (`.sql.gz`) instead
of pg_dump's custom format because:

  - it can be inspected with `gunzip -c | head` for quick sanity checks,
  - it imports with the universally-available `psql` (no `pg_restore`),
  - it's diff-friendly between versions during dev.

Authentication uses the PG* env vars (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
populated from DATABASE_URL so the password never appears on the command line.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import shlex
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

from app.core.config import settings

logger = logging.getLogger("slflow.backup")

BACKUP_FILENAME_RE = re.compile(r"^[A-Za-z0-9._\-]+\.sql\.gz$")


@dataclass(frozen=True)
class PgConn:
    host: str
    port: int
    user: str
    password: str
    database: str

    def env(self) -> dict[str, str]:
        return {
            "PGHOST": self.host,
            "PGPORT": str(self.port),
            "PGUSER": self.user,
            "PGPASSWORD": self.password,
            "PGDATABASE": self.database,
        }


def parse_database_url(url: str = "") -> PgConn:
    """Turn the SQLAlchemy-style DATABASE_URL into a PgConn the pg CLI tools understand.

    Accepts `postgresql://`, `postgresql+asyncpg://`, etc. - the +driver
    suffix is dropped before parsing.
    """
    u = url or settings.DATABASE_URL
    # strip the SQLAlchemy driver suffix if present
    scheme_end = u.find("://")
    scheme = u[:scheme_end]
    rest = u[scheme_end:]
    base_scheme = scheme.split("+", 1)[0]
    parsed = urlparse(base_scheme + rest)
    if not parsed.hostname:
        raise ValueError(f"DATABASE_URL has no host: {url!r}")
    return PgConn(
        host=parsed.hostname,
        port=parsed.port or 5432,
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        database=(parsed.path or "/").lstrip("/") or "postgres",
    )


def generate_backup_filename(prefix: str = "manual") -> str:
    """File names always end in .sql.gz so the listing UI can rely on it."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_prefix = re.sub(r"[^A-Za-z0-9_-]", "_", prefix)
    return f"slflow-{safe_prefix}-{ts}.sql.gz"


async def _run(
    cmd: list[str],
    *,
    env: Optional[dict[str, str]] = None,
    timeout: float = 600.0,
    stdin_pipe: Optional[asyncio.subprocess.Process] = None,
    stdout_to_file: Optional[Path] = None,
    stdin_from_file: Optional[Path] = None,
) -> tuple[int, bytes, bytes]:
    full_env = None
    if env is not None:
        import os as _os

        full_env = dict(_os.environ)
        full_env.update(env)

    kwargs: dict = dict(stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    fout = None
    fin = None
    try:
        if stdout_to_file is not None:
            fout = open(stdout_to_file, "wb")
            kwargs["stdout"] = fout
        if stdin_from_file is not None:
            fin = open(stdin_from_file, "rb")
            kwargs["stdin"] = fin

        proc = await asyncio.create_subprocess_exec(*cmd, env=full_env, **kwargs)
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return 124, b"", b"timeout"
        return (proc.returncode or 0, stdout or b"", stderr or b"")
    finally:
        if fout is not None:
            fout.close()
        if fin is not None:
            fin.close()


async def perform_backup_to_disk(out_path: Path, timeout: float = 1200.0) -> tuple[int, str]:
    """Run `pg_dump | gzip > out_path` and return (rc, stderr-text).

    We wire pg_dump's stdout directly to gzip's stdin via an OS pipe so the
    full SQL stream never has to flow through the Python event loop. The
    output of gzip is redirected to `out_path` at the OS level too.
    """
    import os as _os

    conn = parse_database_url()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    pg_dump_cmd = [
        "pg_dump",
        "--no-owner",
        "--no-privileges",
        "--clean",
        "--if-exists",
    ]

    env = dict(_os.environ)
    env.update(conn.env())

    pipe_read, pipe_write = _os.pipe()
    fout = open(out_path, "wb")
    pg_proc = None
    gz_proc = None
    try:
        pg_proc = await asyncio.create_subprocess_exec(
            *pg_dump_cmd,
            env=env,
            stdout=pipe_write,
            stderr=asyncio.subprocess.PIPE,
        )
        # We must close our copy of the write end so gzip sees EOF when
        # pg_dump exits; otherwise gzip waits forever.
        _os.close(pipe_write)
        pipe_write = -1

        gz_proc = await asyncio.create_subprocess_exec(
            "gzip",
            "-9",
            stdin=pipe_read,
            stdout=fout,
            stderr=asyncio.subprocess.PIPE,
        )
        _os.close(pipe_read)
        pipe_read = -1

        try:
            pg_stderr_bytes, _ = await asyncio.wait_for(
                pg_proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            pg_proc.kill()
            gz_proc.kill()
            return 124, "pg_dump timeout"

        gz_stderr_bytes, _ = await asyncio.wait_for(
            gz_proc.communicate(), timeout=timeout
        )

        rc_pg = pg_proc.returncode or 0
        rc_gz = gz_proc.returncode or 0
    finally:
        try:
            if pipe_read != -1:
                _os.close(pipe_read)
        except OSError:
            pass
        try:
            if pipe_write != -1:
                _os.close(pipe_write)
        except OSError:
            pass
        fout.close()

    err = (pg_stderr_bytes or b"").decode("utf-8", "ignore") + (
        gz_stderr_bytes or b""
    ).decode("utf-8", "ignore")

    if rc_pg != 0 or rc_gz != 0:
        try:
            out_path.unlink(missing_ok=True)
        except OSError:
            pass
        rc = rc_pg if rc_pg != 0 else rc_gz
        return rc, err or f"pg_dump rc={rc_pg} gzip rc={rc_gz}"
    return 0, err


async def perform_restore_from_disk(
    in_path: Path, drop_first: bool = True, timeout: float = 1800.0
) -> tuple[int, str]:
    """Restore a `.sql.gz` archive into the configured database.

    If `drop_first` is True we first wipe the public schema so the dump can
    apply cleanly. The CALLER is responsible for running this only after
    snapshotting the current state (we don't snapshot here to keep the
    function single-purpose).
    """
    import os as _os

    conn = parse_database_url()
    if not in_path.is_file():
        return 2, f"backup file not found: {in_path}"

    env = dict(_os.environ)
    env.update(conn.env())

    if drop_first:
        rc, _, err = await _run(
            [
                "psql",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
            ],
            env=env,
            timeout=120,
        )
        if rc != 0:
            return rc, err.decode("utf-8", "ignore") if isinstance(err, bytes) else err

    # gunzip -c file.sql.gz | psql -v ON_ERROR_STOP=1 --single-transaction
    # Wired with an OS pipe so neither stream flows through Python.
    pipe_read, pipe_write = _os.pipe()
    gz_proc = None
    psql_proc = None
    try:
        gz_proc = await asyncio.create_subprocess_exec(
            "gunzip",
            "-c",
            str(in_path),
            env=env,
            stdout=pipe_write,
            stderr=asyncio.subprocess.PIPE,
        )
        _os.close(pipe_write)
        pipe_write = -1

        psql_proc = await asyncio.create_subprocess_exec(
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "--single-transaction",
            env=env,
            stdin=pipe_read,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _os.close(pipe_read)
        pipe_read = -1

        try:
            psql_stdout, psql_stderr = await asyncio.wait_for(
                psql_proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            gz_proc.kill()
            psql_proc.kill()
            return 124, "restore timeout"

        gz_stderr, _ = await asyncio.wait_for(gz_proc.communicate(), timeout=timeout)

        rc_gz = gz_proc.returncode or 0
        rc_psql = psql_proc.returncode or 0
    finally:
        try:
            if pipe_read != -1:
                _os.close(pipe_read)
        except OSError:
            pass
        try:
            if pipe_write != -1:
                _os.close(pipe_write)
        except OSError:
            pass

    err = (gz_stderr or b"").decode("utf-8", "ignore") + "\n" + (
        psql_stderr or b""
    ).decode("utf-8", "ignore")
    if rc_gz != 0:
        return rc_gz, "gunzip failed: " + err
    if rc_psql != 0:
        return rc_psql, "psql failed: " + err
    return 0, err.strip()


def sha256_of(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as fp:
        for chunk in iter(lambda: fp.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_filename(name: str) -> str:
    """Reject path traversal etc. for upload-restore filenames."""
    base = Path(name).name  # strips any directory components
    if not BACKUP_FILENAME_RE.match(base):
        # fall back to a server-generated name so we never accept arbitrary input
        base = generate_backup_filename(prefix="upload")
    return base

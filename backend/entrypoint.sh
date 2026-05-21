#!/usr/bin/env bash
set -euo pipefail

cd /app

# Refuse to boot with an unsafe SECRET_KEY. A fixed shared secret in
# production lets anyone who's seen the repo mint admin tokens.
# Reject:
#   - empty
#   - the change-me-* placeholder from older configs
#   - the replace-me-* placeholder from .env.example
#   - anything shorter than 32 characters (too easy to brute force)
if [[ -z "${SECRET_KEY:-}" ]] \
   || [[ "${SECRET_KEY}" == change-me* ]] \
   || [[ "${SECRET_KEY}" == replace-me* ]] \
   || [[ ${#SECRET_KEY} -lt 32 ]]; then
  echo "[entrypoint] FATAL: SECRET_KEY is missing, a placeholder, or shorter than 32 chars." >&2
  echo "[entrypoint] Generate a strong key BEFORE starting:" >&2
  echo "[entrypoint]   python -c 'import secrets; print(secrets.token_urlsafe(48))'" >&2
  echo "[entrypoint] Then put it in .env as SECRET_KEY=..." >&2
  exit 1
fi

echo "[entrypoint] Waiting for database..."
mkdir -p /app/uploads /app/backups
python -c "
import asyncio, sys
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings

async def wait():
    for i in range(60):
        try:
            engine = create_async_engine(settings.DATABASE_URL)
            async with engine.connect() as c:
                await c.execute(__import__('sqlalchemy').text('SELECT 1'))
            await engine.dispose()
            print('[entrypoint] DB ready.')
            return
        except Exception as e:
            print(f'[entrypoint] DB not ready ({e!r}), retry {i+1}/60')
            await asyncio.sleep(2)
    sys.exit('[entrypoint] DB never became ready')

asyncio.run(wait())
"

echo "[entrypoint] Running Alembic migrations..."
alembic upgrade head

echo "[entrypoint] Seeding default admin..."
python -m app.scripts.seed

echo "[entrypoint] Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"

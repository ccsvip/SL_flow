#!/usr/bin/env bash
set -euo pipefail

cd /app

echo "[entrypoint] Waiting for database..."
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

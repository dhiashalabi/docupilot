#!/usr/bin/env bash
# Development backend entrypoint: hot-reload FastAPI.
set -euo pipefail

cd /app/apps/backend

echo "[dev-backend] syncing deps..."
uv sync

echo "[dev-backend] running database migrations..."
.venv/bin/alembic upgrade head || echo "[dev-backend] migration skipped/failed (continuing)"

echo "[dev-backend] starting uvicorn --reload on :8000"
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

#!/usr/bin/env bash
# Backend entrypoint: apply migrations, then start the given command.
set -euo pipefail

cd /app/apps/backend

echo "[backend] running database migrations..."
.venv/bin/alembic upgrade head || {
    echo "[backend] migration failed" >&2
    exit 1
}

echo "[backend] starting: $*"
exec "$@"

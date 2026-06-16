#!/usr/bin/env bash
# Development frontend entrypoint: Next.js dev server with hot reload.
set -euo pipefail

cd /app/apps/frontend

echo "[dev-frontend] installing deps..."
pnpm install

echo "[dev-frontend] starting next dev on :3000"
exec pnpm dev -p 3000

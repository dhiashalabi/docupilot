"""Health and readiness endpoints."""

from __future__ import annotations

import asyncio

import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.deps import SessionDep

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """Liveness probe."""
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(session: SessionDep) -> dict:
    """Readiness probe: verifies the database connection."""
    await session.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}


async def _check_database(session: SessionDep) -> bool:
    try:
        await session.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


async def _check_redis() -> bool:
    try:
        from redis.asyncio import from_url

        client = from_url(settings.celery_broker_url)
        try:
            return bool(await client.ping())
        finally:
            await client.aclose()
    except Exception:  # noqa: BLE001
        return False


async def _check_worker() -> bool:
    try:
        from app.workers.celery_app import celery_app

        def _ping() -> list:
            return celery_app.control.ping(timeout=1.0) or []

        replies = await asyncio.to_thread(_ping)
        return len(replies) > 0
    except Exception:  # noqa: BLE001
        return False


async def _check_model() -> bool:
    """Return True only if the configured LLM is loaded on the vLLM server."""
    url = f"{settings.vllm_base_url.rstrip('/')}/models"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                url, headers={"Authorization": f"Bearer {settings.vllm_api_key}"}
            )
        if resp.status_code != 200:
            return False
        try:
            data = resp.json()
        except ValueError:
            return False
        loaded = {m.get("id") for m in (data.get("data") or []) if isinstance(m, dict)}
        # Empty response should be treated as "not ready" rather than "ok".
        return bool(loaded) and settings.llm_model in loaded
    except Exception:  # noqa: BLE001
        return False


@router.get("/health/llm")
async def llm_health() -> dict:
    """Report whether the local vLLM model server is up and serving a model."""
    up = await _check_model()
    return {"status": "ready" if up else "loading", "llm": settings.llm_model}


@router.get("/health/system")
async def system_health(session: SessionDep) -> dict:
    """Aggregate the status of every subsystem for the UI health widget."""
    db_ok, redis_ok, worker_ok, model_ok = await asyncio.gather(
        _check_database(session),
        _check_redis(),
        _check_worker(),
        _check_model(),
    )

    components = [
        {"key": "api", "name": "API", "status": "up"},
        {"key": "database", "name": "Database", "status": "up" if db_ok else "down"},
        {"key": "redis", "name": "Queue (Redis)", "status": "up" if redis_ok else "down"},
        {"key": "worker", "name": "Worker", "status": "up" if worker_ok else "down"},
        {"key": "model", "name": "Model (vLLM)", "status": "up" if model_ok else "down"},
    ]

    up_count = sum(1 for c in components if c["status"] == "up")
    if up_count == len(components):
        overall = "operational"
    elif up_count == 0:
        overall = "down"
    else:
        overall = "degraded"

    return {"status": overall, "components": components}

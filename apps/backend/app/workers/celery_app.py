"""Celery application instance.

Uses Redis as both broker and result backend (per settings). Tasks run in a
dedicated worker container that reuses the backend image. The worker uses a
synchronous SQLAlchemy session because Celery tasks are not async.
"""

from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "docupilot",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,  # heavy tasks: one at a time per worker process
    task_acks_late=True,
)

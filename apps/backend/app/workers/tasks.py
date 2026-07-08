"""Background tasks: document ingestion pipeline.

Pipeline (sync, runs in the worker container):
  1. Mark document PROCESSING.
  2. Parse PDF -> markdown (Docling, PyMuPDF fallback).
  3. Detect language.
  4. Structure-aware chunking.
  5. Embed chunks with BGE-M3 (in-process), batched to limit peak memory.
  6. Persist chunks + vectors.
  7. Mark document READY (or FAILED with error).

A periodic sweeper (:func:`reap_stuck_jobs`) marks any PROCESSING job that
hasn't finished within ``settings.ingest_stuck_after_seconds`` as FAILED so
worker crashes never leave documents permanently pending.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.ai.language import detect_language
from app.config import settings
from app.db.session import SyncSessionLocal
from app.domain.models import (
    STATUS_FAILED,
    STATUS_PROCESSING,
    STATUS_READY,
    Document,
    DocumentChunk,
    ProcessingJob,
)
from app.logging import get_logger
from app.pdf import parser
from app.rag import chunker, embedder
from app.storage import file_path
from app.workers.celery_app import celery_app

logger = get_logger(__name__)

# Maximum number of chunk texts to embed in a single call to avoid OOM on
# large documents.
_EMBED_BATCH_SIZE = 64


def _latest_job(session, document_id):
    """Return the most-recently created ProcessingJob for this document."""
    return session.scalars(
        select(ProcessingJob)
        .where(ProcessingJob.document_id == document_id)
        .order_by(ProcessingJob.created_at.desc())
    ).first()


@celery_app.task(
    name="ingest_document",
    bind=True,
    autoretry_for=(OperationalError, TimeoutError, ConnectionError),
    retry_backoff=2,
    retry_backoff_max=60,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def ingest_document(self, document_id: str) -> dict:
    """Parse, chunk, embed and store a document."""
    session = SyncSessionLocal()
    try:
        document = session.get(Document, document_id)
        if document is None:
            logger.warning("ingest_document_missing", document_id=document_id)
            return {"status": "missing"}

        job = _latest_job(session, document_id)

        # Idempotency guard: skip if already successfully ingested and this is
        # not a deliberate reingest (reingest resets status to PENDING first).
        if document.status == STATUS_READY:
            logger.info("ingest_document_already_ready", document_id=document_id)
            return {"status": "already_ready"}

        document.status = STATUS_PROCESSING
        if job:
            job.status = STATUS_PROCESSING
            job.celery_task_id = self.request.id
            job.started_at = datetime.now(UTC)
            job.progress = 10
        session.commit()

        path = Path(file_path(document.storage_key))
        if not path.exists():
            raise FileNotFoundError(f"Source PDF not found: {path}")

        parsed = parser.parse_pdf(path)
        # Enforce the page-count cap before spending disk + compute on chunks.
        if (
            settings.max_document_pages
            and parsed.page_count
            and parsed.page_count > settings.max_document_pages
        ):
            raise ValueError(
                f"Document has {parsed.page_count} pages; limit is {settings.max_document_pages}"
            )
        document.page_count = parsed.page_count
        document.language = detect_language(parsed.markdown)
        if job:
            job.progress = 40
        session.commit()

        chunks = chunker.chunk_markdown(parsed.markdown, parsed.page_map or None)
        texts = [c.content for c in chunks]

        # Embed in batches to cap peak memory usage on large documents.
        vectors: list[list[float]] = []
        for i in range(0, len(texts), _EMBED_BATCH_SIZE):
            batch = texts[i : i + _EMBED_BATCH_SIZE]
            vectors.extend(embedder.embed_texts(batch))

        if job:
            job.progress = 80
        session.commit()

        for c, vec in zip(chunks, vectors, strict=True):
            session.add(
                DocumentChunk(
                    document_id=document.id,
                    chunk_index=c.index,
                    content=c.content,
                    page_from=c.page_from,
                    page_to=c.page_to,
                    section_title=c.section_title,
                    token_count=c.meta.get("char_len"),
                    embedding=vec,
                    meta=c.meta,
                )
            )

        document.status = STATUS_READY
        document.error = None
        if job:
            job.status = STATUS_READY
            job.progress = 100
            job.finished_at = datetime.now(UTC)
        session.commit()
        logger.info("ingest_document_done", document_id=document_id, chunks=len(chunks))
        return {"status": "ready", "chunks": len(chunks)}

    except Exception as exc:  # noqa: BLE001
        session.rollback()
        logger.error("ingest_document_failed", document_id=document_id, error=str(exc))
        document = session.get(Document, document_id)
        if document:
            document.status = STATUS_FAILED
            document.error = str(exc)
        # Use the same ordered query as the happy path to always update the
        # correct (latest) job rather than an arbitrary one.
        job = _latest_job(session, document_id)
        if job:
            job.status = STATUS_FAILED
            job.error = str(exc)
            job.finished_at = datetime.now(UTC)
        session.commit()
        raise
    finally:
        session.close()


@celery_app.task(name="reap_stuck_jobs")
def reap_stuck_jobs() -> dict:
    """Mark PROCESSING jobs older than the configured cutoff as FAILED.

    Guards against worker crashes leaving documents stuck in PROCESSING
    forever. Also flips the parent Document status so the UI shimmer stops.
    Idempotent: only touches rows still in PROCESSING.
    """
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.ingest_stuck_after_seconds)
    reaped = 0
    session = SyncSessionLocal()
    try:
        stuck = session.scalars(
            select(ProcessingJob).where(
                ProcessingJob.status == STATUS_PROCESSING,
                ProcessingJob.started_at.is_not(None),
                ProcessingJob.started_at < cutoff,
            )
        ).all()
        for job in stuck:
            job.status = STATUS_FAILED
            job.error = "Worker did not finish within the allowed time"
            job.finished_at = datetime.now(UTC)
            doc = session.get(Document, job.document_id)
            if doc is not None and doc.status == STATUS_PROCESSING:
                doc.status = STATUS_FAILED
                doc.error = "Ingestion timed out"
            reaped += 1
        if reaped:
            session.commit()
            logger.warning("reap_stuck_jobs", count=reaped)
        return {"reaped": reaped}
    finally:
        session.close()

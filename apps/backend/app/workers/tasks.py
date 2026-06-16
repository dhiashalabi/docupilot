"""Background tasks: document ingestion pipeline.

Pipeline (sync, runs in the worker container):
  1. Mark document PROCESSING.
  2. Parse PDF -> markdown (Docling, PyMuPDF fallback).
  3. Detect language.
  4. Structure-aware chunking.
  5. Embed chunks with BGE-M3 (in-process).
  6. Persist chunks + vectors.
  7. Mark document READY (or FAILED with error).
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select

from app.ai.language import detect_language
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


@celery_app.task(name="ingest_document", bind=True)
def ingest_document(self, document_id: str) -> dict:
    """Parse, chunk, embed and store a document."""
    session = SyncSessionLocal()
    try:
        document = session.get(Document, document_id)
        if document is None:
            logger.warning("ingest_document_missing", document_id=document_id)
            return {"status": "missing"}

        job = session.scalars(
            select(ProcessingJob)
            .where(ProcessingJob.document_id == document.id)
            .order_by(ProcessingJob.created_at.desc())
        ).first()

        document.status = STATUS_PROCESSING
        if job:
            job.status = STATUS_PROCESSING
            job.celery_task_id = self.request.id
            job.started_at = datetime.now(UTC)
            job.progress = 10
        session.commit()

        path = Path(file_path(document.storage_key))
        parsed = parser.parse_pdf(path)
        document.page_count = parsed.page_count
        document.language = detect_language(parsed.markdown)
        if job:
            job.progress = 40
        session.commit()

        chunks = chunker.chunk_markdown(parsed.markdown, parsed.page_map or None)
        texts = [c.content for c in chunks]
        vectors = embedder.embed_texts(texts)
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
        job = session.scalars(
            select(ProcessingJob).where(ProcessingJob.document_id == document_id)
        ).first()
        if job:
            job.status = STATUS_FAILED
            job.error = str(exc)
            job.finished_at = datetime.now(UTC)
        session.commit()
        raise
    finally:
        session.close()

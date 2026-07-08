"""Document service: upload, listing, retrieval and deletion."""

from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime
from typing import BinaryIO

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.config import settings
from app.domain.models import Document, ProcessingJob
from app.storage import delete_file, save_file, save_stream, sha256_bytes


# Strip C0/C1 control chars from user-supplied filenames.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def _sanitize_filename(filename: str | None) -> str:
    """Strip control chars, cap length, ensure a sensible default."""
    if not filename:
        return "document.pdf"
    cleaned = _CONTROL_CHARS_RE.sub("", filename).strip()
    if not cleaned:
        return "document.pdf"
    # Drop any path components a client may have snuck in.
    cleaned = cleaned.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    return cleaned[:255] or "document.pdf"


async def _find_by_hash(session: AsyncSession, content_hash: str) -> Document | None:
    return (
        await session.scalars(select(Document).where(Document.content_hash == content_hash))
    ).first()


async def create_document(
    session: AsyncSession, filename: str, content_type: str | None, data: bytes
) -> Document:
    """Validate and persist an uploaded PDF, creating its processing job.

    Buffered variant: accepts the full byte payload. New callers should prefer
    :func:`create_document_from_stream` which avoids loading the whole file
    into memory.
    """
    # Size check before any disk I/O so we fail fast on oversized uploads.
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise AppError(f"File exceeds {settings.max_upload_mb} MB limit")

    if content_type != "application/pdf":
        raise AppError("Only PDF files are supported")

    # Validate PDF magic bytes regardless of the declared Content-Type.
    if not data.startswith(b"%PDF-"):
        raise AppError("Uploaded file is not a valid PDF")

    content_hash = sha256_bytes(data)
    existing = await _find_by_hash(session, content_hash)
    if existing is not None:
        return existing

    storage_key = save_file(data)
    document = Document(
        filename=_sanitize_filename(filename),
        storage_key=storage_key,
        size_bytes=len(data),
        content_hash=content_hash,
        status="PENDING",
    )
    session.add(document)
    await session.flush()

    job = ProcessingJob(document_id=document.id, job_type="ingest", status="PENDING")
    session.add(job)
    await session.flush()
    return document


async def create_document_from_stream(
    session: AsyncSession,
    filename: str | None,
    content_type: str | None,
    src: BinaryIO,
) -> Document:
    """Stream an uploaded PDF to disk while enforcing size + PDF magic bytes.

    Returns an existing document row when the content hash already exists,
    avoiding duplicate storage + ingestion.
    """
    if content_type != "application/pdf":
        raise AppError("Only PDF files are supported")

    # Peek the first 5 bytes to validate the magic before we spend disk I/O.
    header = src.read(5)
    if header != b"%PDF-":
        raise AppError("Uploaded file is not a valid PDF")

    # Reconstruct a stream that yields the header we just consumed followed by
    # the rest of the upload. Simplest approach: read the file in the worker
    # thread with a small pre-buffer chained in.
    class _Prefixed:
        def __init__(self, prefix: bytes, rest: BinaryIO) -> None:
            self._prefix = prefix
            self._rest = rest

        def read(self, n: int = -1) -> bytes:
            if self._prefix:
                if n is None or n < 0 or n >= len(self._prefix):
                    out = self._prefix
                    self._prefix = b""
                    return out + (self._rest.read(-1 if n is None or n < 0 else n - len(out)))
                out = self._prefix[:n]
                self._prefix = self._prefix[n:]
                return out
            return self._rest.read(n)

    max_bytes = settings.max_upload_mb * 1024 * 1024
    storage_key, size_bytes, content_hash = await asyncio.to_thread(
        save_stream, _Prefixed(header, src), suffix=".pdf", max_bytes=max_bytes
    )

    existing = await _find_by_hash(session, content_hash)
    if existing is not None:
        # We wrote a duplicate to disk; drop it to keep storage tidy.
        try:
            delete_file(storage_key)
        except Exception:  # noqa: BLE001
            pass
        return existing

    document = Document(
        filename=_sanitize_filename(filename),
        storage_key=storage_key,
        size_bytes=size_bytes,
        content_hash=content_hash,
        status="PENDING",
    )
    session.add(document)
    await session.flush()

    job = ProcessingJob(document_id=document.id, job_type="ingest", status="PENDING")
    session.add(job)
    await session.flush()
    return document


async def list_documents(
    session: AsyncSession,
    *,
    limit: int | None = None,
    before: datetime | None = None,
) -> list[Document]:
    stmt = select(Document).order_by(Document.created_at.desc())
    if before is not None:
        stmt = stmt.where(Document.created_at < before)
    if limit is not None:
        stmt = stmt.limit(limit)
    rows = await session.scalars(stmt)
    return list(rows)


async def get_document(session: AsyncSession, document_id: uuid.UUID) -> Document:
    doc = await session.get(Document, document_id)
    if doc is None:
        raise NotFoundError("Document not found")
    return doc


async def get_latest_job(session: AsyncSession, document_id: uuid.UUID) -> ProcessingJob:
    """Return the most recent processing job for a document."""
    await get_document(session, document_id)
    job = (
        await session.scalars(
            select(ProcessingJob)
            .where(ProcessingJob.document_id == document_id)
            .order_by(ProcessingJob.created_at.desc())
        )
    ).first()
    if job is None:
        raise NotFoundError("No processing job found for this document")
    return job


async def reingest_document(session: AsyncSession, document_id: uuid.UUID) -> Document:
    """Reset a document to PENDING and create a fresh ingestion job.

    Existing chunks are removed so re-ingestion starts clean. The caller is
    responsible for enqueueing the Celery task.
    """
    from app.domain.models import DocumentChunk

    doc = await get_document(session, document_id)
    await session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
    doc.status = "PENDING"
    doc.error = None
    job = ProcessingJob(document_id=doc.id, job_type="ingest", status="PENDING")
    session.add(job)
    await session.flush()
    return doc


async def delete_document(session: AsyncSession, document_id: uuid.UUID) -> None:
    doc = await get_document(session, document_id)
    storage_key = doc.storage_key
    await session.delete(doc)
    # Best-effort file removal after the DB row is scheduled for deletion.
    # We delete after the session.delete() call so if this raises the DB
    # transaction can still roll back without an orphaned row pointing to a
    # missing file.
    await session.flush()
    delete_file(storage_key)

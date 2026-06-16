"""Document service: upload, listing, retrieval and deletion."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.config import settings
from app.domain.models import Document, ProcessingJob
from app.storage import save_file


async def create_document(session: AsyncSession, filename: str, content_type: str | None, data: bytes) -> Document:
    """Validate and persist an uploaded PDF, creating its processing job."""
    if content_type != "application/pdf":
        raise AppError("Only PDF files are supported")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise AppError(f"File exceeds {settings.max_upload_mb} MB limit")

    storage_key = save_file(data)
    document = Document(
        filename=filename or "document.pdf",
        storage_key=storage_key,
        size_bytes=len(data),
        status="PENDING",
    )
    session.add(document)
    await session.flush()

    job = ProcessingJob(document_id=document.id, job_type="ingest", status="PENDING")
    session.add(job)
    await session.flush()
    return document


async def list_documents(session: AsyncSession) -> list[Document]:
    rows = await session.scalars(select(Document).order_by(Document.created_at.desc()))
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
    await session.execute(
        delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
    )
    doc.status = "PENDING"
    doc.error = None
    job = ProcessingJob(document_id=doc.id, job_type="ingest", status="PENDING")
    session.add(job)
    await session.flush()
    return doc


async def delete_document(session: AsyncSession, document_id: uuid.UUID) -> None:
    doc = await get_document(session, document_id)
    await session.delete(doc)

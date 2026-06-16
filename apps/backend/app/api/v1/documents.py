"""Document endpoints: upload, list, get, delete."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, UploadFile

from app.deps import SessionDep
from app.schemas import DocumentRead, ProcessingJobRead
from app.services import document_service
from app.workers.celery_app import celery_app

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentRead, status_code=201)
async def upload_document(file: UploadFile, session: SessionDep) -> DocumentRead:
    data = await file.read()
    document = await document_service.create_document(
        session, file.filename or "document.pdf", file.content_type, data
    )
    await session.flush()
    doc_id = str(document.id)
    # Hand off heavy parsing/embedding to the worker.
    celery_app.send_task("ingest_document", args=[doc_id])
    return DocumentRead.model_validate(document)


@router.get("", response_model=list[DocumentRead])
async def list_documents(session: SessionDep) -> list[DocumentRead]:
    docs = await document_service.list_documents(session)
    return [DocumentRead.model_validate(d) for d in docs]


@router.get("/{document_id}", response_model=DocumentRead)
async def get_document(document_id: uuid.UUID, session: SessionDep) -> DocumentRead:
    doc = await document_service.get_document(session, document_id)
    return DocumentRead.model_validate(doc)


@router.get("/{document_id}/job", response_model=ProcessingJobRead)
async def get_document_job(document_id: uuid.UUID, session: SessionDep) -> ProcessingJobRead:
    """Return the latest ingestion job (status + progress) for a document."""
    job = await document_service.get_latest_job(session, document_id)
    return ProcessingJobRead.model_validate(job)


@router.post("/{document_id}/reingest", response_model=DocumentRead)
async def reingest_document(document_id: uuid.UUID, session: SessionDep) -> DocumentRead:
    """Re-run ingestion for a document (e.g. after a FAILED status)."""
    document = await document_service.reingest_document(session, document_id)
    await session.flush()
    celery_app.send_task("ingest_document", args=[str(document.id)])
    return DocumentRead.model_validate(document)


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: uuid.UUID, session: SessionDep) -> None:
    await document_service.delete_document(session, document_id)


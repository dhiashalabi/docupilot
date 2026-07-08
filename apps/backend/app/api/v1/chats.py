"""Chat endpoints: create, list, get, update, delete and list messages."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Query, UploadFile

from app.deps import SessionDep
from app.schemas import ChatCreate, ChatRead, ChatUpdate, DocumentRead, MessageRead
from app.services import chat_service, document_service
from app.workers.celery_app import celery_app

router = APIRouter(prefix="/chats", tags=["chats"])


def _to_read(chat) -> ChatRead:
    # `chat.documents` is already eagerly loaded by get_chat/list_chats via
    # selectinload(Chat.documents), so reading it here avoids an N+1 query.
    doc_ids = [link.document_id for link in chat.documents]
    return ChatRead(
        id=chat.id,
        title=chat.title,
        document_ids=doc_ids,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
    )


@router.post("", response_model=ChatRead, status_code=201)
async def create_chat(payload: ChatCreate, session: SessionDep) -> ChatRead:
    chat = await chat_service.create_chat(session, payload.title, payload.document_ids)
    return _to_read(chat)


@router.get("", response_model=list[ChatRead])
async def list_chats(
    session: SessionDep,
    limit: int | None = Query(default=None, ge=1, le=200),
    before: datetime | None = Query(default=None),
) -> list[ChatRead]:
    chats = await chat_service.list_chats(session, limit=limit, before=before)
    return [_to_read(c) for c in chats]


@router.get("/{chat_id}", response_model=ChatRead)
async def get_chat(chat_id: uuid.UUID, session: SessionDep) -> ChatRead:
    chat = await chat_service.get_chat(session, chat_id)
    return _to_read(chat)


@router.patch("/{chat_id}", response_model=ChatRead)
@router.put("/{chat_id}", response_model=ChatRead)
async def update_chat(chat_id: uuid.UUID, payload: ChatUpdate, session: SessionDep) -> ChatRead:
    chat = await chat_service.update_chat(session, chat_id, payload.title, payload.document_ids)
    return _to_read(chat)


@router.delete("/{chat_id}", status_code=204)
async def delete_chat(chat_id: uuid.UUID, session: SessionDep) -> None:
    await chat_service.delete_chat(session, chat_id)


@router.post("/{chat_id}/documents", response_model=DocumentRead, status_code=201)
async def upload_document_to_chat(
    chat_id: uuid.UUID, file: UploadFile, session: SessionDep
) -> DocumentRead:
    """Upload a new PDF and immediately link it to this chat.

    The document is processed asynchronously (status starts as PENDING).
    Poll GET /documents/{id}/job to track ingestion progress. If the same
    PDF (by content hash) has been uploaded before, it is linked to this
    chat without triggering a duplicate ingestion.
    """
    chat = await chat_service.get_chat(session, chat_id)
    document = await document_service.create_document_from_stream(
        session, file.filename, file.content_type, file.file
    )
    await session.flush()
    await chat_service.add_document(session, chat, document.id)
    if document.status == "PENDING":
        celery_app.send_task("ingest_document", args=[str(document.id)])
    return DocumentRead.model_validate(document)


@router.get("/{chat_id}/messages", response_model=list[MessageRead])
async def list_messages(
    chat_id: uuid.UUID,
    session: SessionDep,
    limit: int | None = Query(default=None, ge=1, le=500),
    before: datetime | None = Query(default=None),
) -> list[MessageRead]:
    messages = await chat_service.list_messages(session, chat_id, limit=limit, before=before)
    return [MessageRead.model_validate(m) for m in messages]

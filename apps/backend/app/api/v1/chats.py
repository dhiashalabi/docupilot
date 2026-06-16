"""Chat endpoints: create, list, get, update, delete and list messages."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.deps import SessionDep
from app.schemas import ChatCreate, ChatRead, ChatUpdate, MessageRead
from app.services import chat_service

router = APIRouter(prefix="/chats", tags=["chats"])


async def _to_read(session, chat) -> ChatRead:
    doc_ids = await chat_service.get_document_ids(session, chat)
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
    return await _to_read(session, chat)


@router.get("", response_model=list[ChatRead])
async def list_chats(session: SessionDep) -> list[ChatRead]:
    chats = await chat_service.list_chats(session)
    return [await _to_read(session, c) for c in chats]


@router.get("/{chat_id}", response_model=ChatRead)
async def get_chat(chat_id: uuid.UUID, session: SessionDep) -> ChatRead:
    chat = await chat_service.get_chat(session, chat_id)
    return await _to_read(session, chat)


@router.patch("/{chat_id}", response_model=ChatRead)
async def update_chat(chat_id: uuid.UUID, payload: ChatUpdate, session: SessionDep) -> ChatRead:
    chat = await chat_service.update_chat(
        session, chat_id, payload.title, payload.document_ids
    )
    return await _to_read(session, chat)


@router.delete("/{chat_id}", status_code=204)
async def delete_chat(chat_id: uuid.UUID, session: SessionDep) -> None:
    await chat_service.delete_chat(session, chat_id)


@router.get("/{chat_id}/messages", response_model=list[MessageRead])
async def list_messages(chat_id: uuid.UUID, session: SessionDep) -> list[MessageRead]:
    messages = await chat_service.list_messages(session, chat_id)
    return [MessageRead.model_validate(m) for m in messages]

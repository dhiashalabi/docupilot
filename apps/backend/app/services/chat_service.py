"""Chat service: create/list/update chats and manage their document scope."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.domain.models import Chat, ChatDocument, Document, Message


def title_from_message(text: str, *, max_len: int = 80) -> str | None:
    cleaned = " ".join((text or "").split())
    if not cleaned:
        return None
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


async def create_chat(
    session: AsyncSession, title: str | None, document_ids: list[uuid.UUID]
) -> Chat:
    chat = Chat(title=title)
    session.add(chat)
    await session.flush()
    await _set_documents(session, chat, document_ids)
    return chat


async def _set_documents(session: AsyncSession, chat: Chat, document_ids: list[uuid.UUID]) -> None:
    # Validate the documents exist before linking.
    if document_ids:
        found = await session.scalars(select(Document.id).where(Document.id.in_(document_ids)))
        valid = set(found)
        missing = set(document_ids) - valid
        if missing:
            raise NotFoundError(f"Unknown document ids: {', '.join(str(m) for m in missing)}")

    # Clear existing links and recreate.
    existing = await session.scalars(select(ChatDocument).where(ChatDocument.chat_id == chat.id))
    for link in existing:
        await session.delete(link)
    await session.flush()
    for doc_id in dict.fromkeys(document_ids):
        session.add(ChatDocument(chat_id=chat.id, document_id=doc_id))
    await session.flush()


async def get_chat(session: AsyncSession, chat_id: uuid.UUID) -> Chat:
    chat = await session.get(Chat, chat_id, options=[selectinload(Chat.documents)])
    if chat is None:
        raise NotFoundError("Chat not found")
    return chat


async def list_chats(session: AsyncSession) -> list[Chat]:
    rows = await session.scalars(
        select(Chat).options(selectinload(Chat.documents)).order_by(Chat.updated_at.desc())
    )
    return list(rows)


async def update_chat(
    session: AsyncSession,
    chat_id: uuid.UUID,
    title: str | None,
    document_ids: list[uuid.UUID] | None,
) -> Chat:
    chat = await get_chat(session, chat_id)
    if title is not None:
        chat.title = title
    if document_ids is not None:
        await _set_documents(session, chat, document_ids)
    await session.flush()
    await session.refresh(chat)
    return chat


async def delete_chat(session: AsyncSession, chat_id: uuid.UUID) -> None:
    chat = await get_chat(session, chat_id)
    await session.delete(chat)


async def add_document(
    session: AsyncSession, chat: Chat, document_id: uuid.UUID
) -> None:
    """Link a single document to a chat without disturbing existing links."""
    existing = await session.scalars(
        select(ChatDocument).where(
            ChatDocument.chat_id == chat.id,
            ChatDocument.document_id == document_id,
        )
    )
    if existing.first() is None:
        session.add(ChatDocument(chat_id=chat.id, document_id=document_id))
        await session.flush()


async def get_document_ids(session: AsyncSession, chat_id: uuid.UUID) -> list[uuid.UUID]:
    rows = await session.scalars(
        select(ChatDocument.document_id).where(ChatDocument.chat_id == chat_id)
    )
    return list(rows)


async def list_messages(session: AsyncSession, chat_id: uuid.UUID) -> list[Message]:
    await get_chat(session, chat_id)
    rows = await session.scalars(
        select(Message)
        .options(selectinload(Message.citations))
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at)
    )
    return list(rows)

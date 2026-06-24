"""RAG orchestration: retrieve, assemble, stream the answer, persist citations.

This is the heart of the chat workflow. It supports single-doc, multi-doc and
cross-document comparison, integrates conversation history (with summarisation
for long chats) and records only the citations the model actually used.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import prompts, vllm_client
from app.ai.language import detect_language
from app.config import settings
from app.domain.models import Chat, ChatDocument, Message, MessageCitation
from app.rag import context_assembler, embedder, retriever
from app.services import chat_service


async def _chat_document_ids(session: AsyncSession, chat: Chat) -> list[uuid.UUID]:
    rows = await session.scalars(
        select(ChatDocument.document_id).where(ChatDocument.chat_id == chat.id)
    )
    return list(rows)


async def _history(
    session: AsyncSession,
    chat_id: uuid.UUID,
    exclude_id: uuid.UUID | None = None,
) -> list[dict[str, str]]:
    stmt = select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at)
    if exclude_id is not None:
        stmt = stmt.where(Message.id != exclude_id)
    rows = await session.scalars(stmt)
    msgs = list(rows)
    return [{"role": m.role, "content": m.content} for m in msgs]


async def _build_context(
    session: AsyncSession,
    chat: Chat,
    question: str,
    exclude_message_id: uuid.UUID | None = None,
):
    """Embed the question, retrieve chunks and prepare prompt messages."""
    doc_ids = await _chat_document_ids(session, chat)
    # When a chat has no linked documents skip retrieval entirely; build_chat_messages
    # will surface "(no relevant excerpts found)" so the LLM still gets a valid prompt.
    if doc_ids:
        query_vec = await asyncio.to_thread(embedder.embed_query, question)
        chunks = await retriever.retrieve(
            session, query_vec, document_ids=doc_ids, query_text=question
        )
        passages = context_assembler.to_passages(chunks)
    else:
        chunks = []
        passages = []

    # Exclude the just-committed user message so the question is not sent twice
    # (build_chat_messages already appends the question as the final user turn).
    history = await _history(session, chat.id, exclude_id=exclude_message_id)
    history_summary = None
    recent = history
    if len(history) > settings.max_history_messages:
        older = history[: -settings.max_history_messages]
        recent = history[-settings.max_history_messages :]
        try:
            history_summary = await vllm_client.complete(
                prompts.build_history_summary_messages(older)
            )
        except Exception:  # noqa: BLE001
            history_summary = None

    comparison = context_assembler.is_comparison_query(question, doc_ids)
    messages = prompts.build_chat_messages(
        question=question,
        passages=passages,
        history=recent,
        history_summary=history_summary,
        comparison=comparison,
    )
    return messages, chunks


async def answer_stream(session: AsyncSession, chat: Chat, question: str) -> AsyncIterator[dict]:
    """Stream an answer.

    Yields dict events: {"type": "token", "text": ...} during generation and a
    final {"type": "done", "message_id": ..., "citations": [...]} event after the
    user + assistant messages and citations have been persisted.
    """
    lang = detect_language(question)
    user_msg = Message(chat_id=chat.id, role="user", content=question, language=lang)
    session.add(user_msg)
    if not (chat.title or "").strip():
        chat.title = chat_service.title_from_message(question)
    session.add(chat)
    # Commit the user's message immediately so it is never lost if the client
    # disconnects or the LLM call fails mid-stream.
    await session.commit()

    messages, chunks = await _build_context(
        session, chat, question, exclude_message_id=user_msg.id
    )

    buffer: list[str] = []
    async for token in vllm_client.stream(messages):
        buffer.append(token)
        yield {"type": "token", "text": token}

    answer = "".join(buffer)
    assistant_msg = Message(chat_id=chat.id, role="assistant", content=answer, language=lang)
    session.add(assistant_msg)
    # Bump the parent chat so chat lists order by most-recent activity.
    chat.updated_at = datetime.now(UTC)
    session.add(chat)
    await session.flush()

    cited = context_assembler.extract_cited_indices(answer, max_index=len(chunks))
    # Use the appropriate score floor depending on whether reranking was applied.
    citation_min_score = (
        settings.rerank_min_score if settings.rerank_enabled else settings.retrieval_min_score
    )
    citations_out: list[dict] = []
    for n in cited:
        chunk = chunks[n - 1]
        # Skip citations whose retrieval score fell below the relevance floor so
        # that a mis-numbered [n] in the model's output cannot surface an
        # irrelevant source. (The first chunk is never filtered to guarantee at
        # least one citation is possible when the model is well-behaved.)
        if n > 1 and chunk.score < citation_min_score:
            continue
        session.add(
            MessageCitation(
                message_id=assistant_msg.id,
                chunk_id=chunk.chunk_id,
                document_id=chunk.document_id,
                page_from=chunk.page_from,
                page_to=chunk.page_to,
                score=chunk.score,
            )
        )
        citations_out.append(
            {
                "n": n,
                "document_id": str(chunk.document_id),
                "filename": chunk.filename,
                "page_from": chunk.page_from,
                "page_to": chunk.page_to,
                "score": round(chunk.score, 4),
            }
        )

    await session.flush()
    # Commit assistant message + citations immediately so they are durable even
    # if the client disconnects before the outer commit in messages.py runs.
    await session.commit()
    yield {
        "type": "done",
        "message_id": str(assistant_msg.id),
        "citations": citations_out,
    }

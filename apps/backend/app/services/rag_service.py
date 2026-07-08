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
    """Return the most recent history turns, capped at ``max_history_summary_messages``.

    Fetches the newest N rows in DESC order then reverses in Python so that
    very long chats don't scan the full message table on every turn.
    """
    cap = max(
        settings.max_history_messages,
        settings.max_history_summary_messages,
    )
    stmt = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc())
        .limit(cap)
    )
    if exclude_id is not None:
        stmt = stmt.where(Message.id != exclude_id)
    rows = await session.scalars(stmt)
    msgs = list(reversed(list(rows)))
    return [{"role": m.role, "content": m.content} for m in msgs]


async def _build_context(
    session: AsyncSession,
    chat: Chat,
    question: str,
    exclude_message_id: uuid.UUID | None = None,
):
    """Embed the question, retrieve chunks and prepare prompt messages."""
    doc_ids = await _chat_document_ids(session, chat)
    # When the chat has linked documents we scope retrieval to them; otherwise
    # we search the entire corpus so global-scope chats (the UI's "Answering
    # from all documents" state) actually behave that way. If the corpus is
    # empty the retriever returns [] and build_chat_messages surfaces
    # "(no relevant excerpts found)".
    query_vec = await asyncio.to_thread(embedder.embed_query, question)
    chunks = await retriever.retrieve(
        session,
        query_vec,
        document_ids=doc_ids or None,
        query_text=question,
    )
    passages = context_assembler.to_passages(chunks)

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

    If the client disconnects mid-stream, the accumulated partial reply is
    persisted with ``meta={"interrupted": true}`` before the cancellation
    propagates, so we never silently lose an assistant turn.
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

    messages, chunks = await _build_context(session, chat, question, exclude_message_id=user_msg.id)

    buffer: list[str] = []
    interrupted = False
    try:
        async for token in vllm_client.stream(messages):
            buffer.append(token)
            yield {"type": "token", "text": token}
    except asyncio.CancelledError:
        interrupted = True
        # Persist the partial reply outside the cancellation window so it
        # survives even when the client disconnects mid-generation. We shield
        # the DB writes so the CancelledError can't tear them down.
        await asyncio.shield(
            _persist_assistant_reply(
                session,
                chat=chat,
                lang=lang,
                answer="".join(buffer),
                chunks=chunks,
                interrupted=True,
            )
        )
        raise
    finally:
        # If we didn't cancel and no exception fired, the happy-path below
        # handles persistence. If some *other* exception fired, do nothing —
        # the outer error handler will rollback.
        pass

    if interrupted:  # unreachable: cancellation re-raises above
        return

    result = await _persist_assistant_reply(
        session,
        chat=chat,
        lang=lang,
        answer="".join(buffer),
        chunks=chunks,
        interrupted=False,
    )
    yield {
        "type": "done",
        "message_id": result["message_id"],
        "citations": result["citations"],
    }


async def _persist_assistant_reply(
    session: AsyncSession,
    *,
    chat: Chat,
    lang: str | None,
    answer: str,
    chunks: list,
    interrupted: bool,
) -> dict:
    """Persist the assistant message + citations. Returns the payload for `done`."""
    meta = {"interrupted": True} if interrupted else None
    assistant_msg = Message(
        chat_id=chat.id, role="assistant", content=answer, language=lang, meta=meta
    )
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
    return {"message_id": str(assistant_msg.id), "citations": citations_out}

"""Message endpoint: post a question and stream the grounded answer via SSE.

Streaming uses Server-Sent Events (text/event-stream). Each event carries a JSON
payload: token events during generation, then a final 'done' event with the
persisted assistant message id and its citations. SSE comment frames
(``: keepalive``) are emitted during idle periods to keep proxies from
dropping long-lived connections.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.logging import get_logger
from app.schemas import MessageCreate
from app.services import chat_service, rag_service

logger = get_logger(__name__)

router = APIRouter(prefix="/chats", tags=["messages"])


@router.post("/{chat_id}/messages/stream")
async def stream_message(chat_id: uuid.UUID, payload: MessageCreate) -> StreamingResponse:
    """Stream an answer to a question as Server-Sent Events."""

    async def event_source() -> AsyncIterator[str]:
        # Use a dedicated session so we control commit timing across the stream.
        async with AsyncSessionLocal() as stream_session:
            try:
                chat = await chat_service.get_chat(stream_session, chat_id)
                gen = rag_service.answer_stream(stream_session, chat, payload.content)
                keepalive = settings.sse_keepalive_seconds
                while True:
                    # Race the next event against a keepalive tick so long
                    # LLM stalls don't allow proxies (nginx, cloudflare) to
                    # close the connection.
                    try:
                        event = await asyncio.wait_for(gen.__anext__(), timeout=keepalive)
                    except StopAsyncIteration:
                        break
                    except asyncio.TimeoutError:
                        # SSE comment frame — ignored by all clients.
                        yield ": keepalive\n\n"
                        continue
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                await stream_session.commit()
            except asyncio.CancelledError:
                # Client disconnected. The RAG layer has already shielded the
                # partial-reply persistence, so we must NOT rollback here —
                # doing so would erase the assistant message it just committed.
                logger.info("stream_cancelled", chat_id=str(chat_id))
                raise
            except Exception:  # noqa: BLE001
                logger.exception("stream_error", chat_id=str(chat_id))
                await stream_session.rollback()
                # Emit a stable error code – do NOT send str(exc) to the client.
                err = {"type": "error", "detail": "An error occurred while generating the answer."}
                yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

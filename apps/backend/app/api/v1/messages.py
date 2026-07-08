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
from contextlib import suppress

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
            producer_task: asyncio.Task | None = None
            try:
                chat = await chat_service.get_chat(stream_session, chat_id)
                gen = rag_service.answer_stream(stream_session, chat, payload.content)

                # Producer/consumer decouples keep-alive timing from the
                # generator. Racing ``asyncio.wait_for`` directly against
                # ``gen.__anext__()`` would cancel the generator on every idle
                # tick, catastrophic when the first token takes longer than the
                # keep-alive interval (embedder/reranker cold start, history
                # summarisation, transient vLLM slowness). With a queue only
                # ``queue.get`` is cancelled; the producer keeps driving the
                # generator, and only a real client disconnect (which cancels
                # the outer task, and hence this producer via the finally
                # block below) propagates cancellation into ``answer_stream``.
                _EVENT, _ERROR, _DONE = "event", "error", "done"
                queue: asyncio.Queue = asyncio.Queue()

                async def _producer() -> None:
                    try:
                        async for event in gen:
                            await queue.put((_EVENT, event))
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:  # noqa: BLE001
                        await queue.put((_ERROR, exc))
                    finally:
                        await queue.put((_DONE, None))

                producer_task = asyncio.create_task(_producer())
                keepalive = settings.sse_keepalive_seconds

                while True:
                    try:
                        kind, item = await asyncio.wait_for(queue.get(), timeout=keepalive)
                    except asyncio.TimeoutError:
                        # SSE comment frame — ignored by all clients.
                        yield ": keepalive\n\n"
                        continue
                    if kind == _DONE:
                        break
                    if kind == _ERROR:
                        raise item  # type: ignore[misc]
                    yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

                # Surface any final producer error not carried through the queue.
                await producer_task
                await stream_session.commit()
            except asyncio.CancelledError:
                # Real client disconnect. The RAG layer has shielded the
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
            finally:
                if producer_task is not None and not producer_task.done():
                    producer_task.cancel()
                    with suppress(asyncio.CancelledError, Exception):
                        await producer_task

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

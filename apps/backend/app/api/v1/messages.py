"""Message endpoint: post a question and stream the grounded answer via SSE.

Streaming uses Server-Sent Events (text/event-stream). Each event carries a JSON
payload: token events during generation, then a final 'done' event with the
persisted assistant message id and its citations.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.db.session import AsyncSessionLocal
from app.deps import SessionDep
from app.schemas import MessageCreate
from app.services import chat_service, rag_service

router = APIRouter(prefix="/chats", tags=["messages"])


@router.post("/{chat_id}/messages/stream")
async def stream_message(
    chat_id: uuid.UUID, payload: MessageCreate, session: SessionDep
) -> StreamingResponse:
    """Stream an answer to a question as Server-Sent Events."""
    # Validate the chat exists before opening the stream.
    await chat_service.get_chat(session, chat_id)

    async def event_source() -> AsyncIterator[str]:
        # Use a dedicated session so we control commit timing across the stream.
        async with AsyncSessionLocal() as stream_session:
            try:
                chat = await chat_service.get_chat(stream_session, chat_id)
                async for event in rag_service.answer_stream(
                    stream_session, chat, payload.content
                ):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                await stream_session.commit()
            except Exception as exc:  # noqa: BLE001
                await stream_session.rollback()
                err = {"type": "error", "detail": str(exc)}
                yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

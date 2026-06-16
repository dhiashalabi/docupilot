"""Search endpoint: semantic search across stored document chunks."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import SessionDep
from app.schemas import SearchHit, SearchRequest
from app.services import generation_service

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=list[SearchHit])
async def search(payload: SearchRequest, session: SessionDep) -> list[SearchHit]:
    hits = await generation_service.search(
        session, payload.query, payload.document_ids, payload.top_k
    )
    return [
        SearchHit(
            chunk_id=h.chunk_id,
            document_id=h.document_id,
            filename=h.filename,
            content=h.content,
            page_from=h.page_from,
            page_to=h.page_to,
            score=round(h.score, 4),
        )
        for h in hits
    ]

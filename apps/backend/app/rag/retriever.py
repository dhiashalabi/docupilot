"""Vector retrieval over pgvector.

Uses cosine distance (`<=>`) against the HNSW index on
`document_chunks.embedding`. Supports scoping to a set of document IDs for
single-doc, multi-doc and cross-document workflows.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.domain.models import Document, DocumentChunk


@dataclass
class RetrievedChunk:
    """A retrieved chunk with its similarity score and source metadata."""

    chunk_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    content: str
    page_from: int | None
    page_to: int | None
    score: float


def _apply_min_score(
    chunks: list[RetrievedChunk], *, reranked: bool = False
) -> list[RetrievedChunk]:
    """Drop chunks below the configured relevance floor.

    Uses `rerank_min_score` after cross-encoder reranking (sigmoid scale) and
    `retrieval_min_score` for plain cosine-similarity results.
    Always keeps at least the top result so the context is never empty.
    """
    floor = settings.rerank_min_score if reranked else settings.retrieval_min_score
    if floor <= 0.0 or not chunks:
        return chunks
    filtered = [c for c in chunks if c.score >= floor]
    return filtered if filtered else chunks[:1]


async def retrieve(
    session: AsyncSession,
    query_embedding: list[float],
    document_ids: list[uuid.UUID] | None = None,
    top_k: int | None = None,
    query_text: str | None = None,
) -> list[RetrievedChunk]:
    """Return the top-k most similar chunks, optionally scoped to documents.

    When reranking is enabled and `query_text` is provided, the vector search
    over-fetches candidates and a cross-encoder reorders them to the final k.
    """
    k = top_k or settings.retrieval_top_k
    rerank = settings.rerank_enabled and bool(query_text)
    fetch_k = k * settings.rerank_overfetch if rerank else k

    distance = DocumentChunk.embedding.cosine_distance(query_embedding)

    stmt = (
        select(
            DocumentChunk.id,
            DocumentChunk.document_id,
            Document.filename,
            DocumentChunk.content,
            DocumentChunk.page_from,
            DocumentChunk.page_to,
            distance.label("distance"),
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(DocumentChunk.embedding.is_not(None))
        .order_by(distance)
        .limit(fetch_k)
    )
    if document_ids:
        stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))

    # Tune HNSW search breadth for this transaction (better recall).
    if settings.hnsw_ef_search:
        await session.execute(
            text("SELECT set_config('hnsw.ef_search', :ef, true)").bindparams(
                ef=str(settings.hnsw_ef_search)
            )
        )

    rows = (await session.execute(stmt)).all()
    candidates = [
        RetrievedChunk(
            chunk_id=row.id,
            document_id=row.document_id,
            filename=row.filename,
            content=row.content,
            page_from=row.page_from,
            page_to=row.page_to,
            score=1.0 - float(row.distance),  # cosine similarity
        )
        for row in rows
    ]

    if rerank and candidates:
        from app.rag import reranker

        scores = await asyncio.to_thread(
            reranker.rerank_scores, query_text, [c.content for c in candidates]
        )
        if len(scores) != len(candidates):
            raise RuntimeError(
                f"Reranker returned {len(scores)} scores for {len(candidates)} candidates"
            )
        for chunk, score in zip(candidates, scores):
            chunk.score = score
        candidates.sort(key=lambda c: c.score, reverse=True)
        candidates = candidates[:k]
        return _apply_min_score(candidates, reranked=True)

    return _apply_min_score(candidates)

"""Optional cross-encoder reranking (BGE reranker, in-process via FlagEmbedding).

Reranking re-scores retrieved candidates against the query with a cross-encoder,
which is usually a bigger quality win for grounded RAG than upgrading the LLM.
Disabled by default; the model is loaded lazily only when `rerank_enabled` is on.
"""

from __future__ import annotations

import threading

from app.config import settings
from app.logging import get_logger

logger = get_logger(__name__)

_model = None
_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from FlagEmbedding import FlagReranker

                logger.info("loading_reranker_model", model=settings.rerank_model)
                _model = FlagReranker(
                    settings.rerank_model, use_fp16=settings.embedding_use_fp16
                )
    return _model


def rerank_scores(query: str, passages: list[str]) -> list[float]:
    """Return a relevance score for each passage given the query."""
    if not passages:
        return []
    model = _get_model()
    scores = model.compute_score([[query, p] for p in passages], normalize=True)
    # FlagReranker returns a float for a single pair, else a list.
    if isinstance(scores, (int, float)):
        return [float(scores)]
    return [float(s) for s in scores]

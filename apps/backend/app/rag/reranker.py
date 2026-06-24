"""Optional cross-encoder reranking (BGE reranker, in-process via sentence-transformers).

Reranking re-scores retrieved candidates against the query with a cross-encoder,
which is usually a bigger quality win for grounded RAG than upgrading the LLM.
Disabled by default; the model is loaded lazily only when `rerank_enabled` is on.

We use sentence-transformers' `CrossEncoder` rather than FlagEmbedding's
`FlagReranker` so reranking stays compatible with transformers v5 (FlagEmbedding's
reranker inference still calls the removed `tokenizer.prepare_for_model`). The same
`BAAI/bge-reranker-v2-m3` weights are loaded, and `Sigmoid` maps logits to the
0-1 range, matching the previous `normalize=True` behaviour.
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
                import torch
                from sentence_transformers import CrossEncoder

                logger.info("loading_reranker_model", model=settings.rerank_model)
                model_kwargs = (
                    {"torch_dtype": torch.float16} if settings.embedding_use_fp16 else None
                )
                _model = CrossEncoder(
                    settings.rerank_model,
                    activation_fn=torch.nn.Sigmoid(),
                    device=settings.embedding_device or None,
                    model_kwargs=model_kwargs,
                )
    return _model


def rerank_scores(query: str, passages: list[str]) -> list[float]:
    """Return a relevance score for each passage given the query."""
    if not passages:
        return []
    model = _get_model()
    scores = model.predict(
        [(query, p) for p in passages],
        batch_size=settings.embedding_batch_size,
        show_progress_bar=False,
    )
    return [float(s) for s in scores]

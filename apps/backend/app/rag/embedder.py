"""BGE-M3 embeddings.

By default the model is loaded lazily as a process-wide singleton (initialised
once per worker/web process). BGE-M3 produces 1024-dim dense vectors and is
strongly multilingual (Arabic, English, French, Spanish, ...), matching
DocuPilot's needs.

When `settings.embedding_base_url` is set, embedding is offloaded to a single
self-hosted HTTP backend instead of loading the model in-process. This keeps the
web image light and the heavy model resident in one place. The backend contract
is a JSON POST to `{base_url}/embed` with `{"texts": [...], "is_query": bool}`
returning `{"embeddings": [[...]]}`. This stays fully local; no external service
is involved.
"""

from __future__ import annotations

import threading

import httpx

from app.config import settings
from app.logging import get_logger

logger = get_logger(__name__)

_model = None
_lock = threading.Lock()

# BGE-M3 retrieval instructions improve query/passage asymmetry handling.
_QUERY_INSTRUCTION = "Represent this query for retrieving relevant documents: "


def _get_model():
    """Load (once) and return the BGE-M3 model."""
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from FlagEmbedding import BGEM3FlagModel

                logger.info(
                    "loading_embedding_model",
                    model=settings.embedding_model,
                    device=settings.embedding_device,
                    fp16=settings.embedding_use_fp16,
                )
                kwargs: dict = {"use_fp16": settings.embedding_use_fp16}
                if settings.embedding_device:
                    kwargs["devices"] = settings.embedding_device
                _model = BGEM3FlagModel(settings.embedding_model, **kwargs)
    return _model


def warmup() -> None:
    """Eagerly load the in-process model (no-op when using a remote backend)."""
    if settings.embedding_base_url:
        return
    _get_model()


def _remote_embed(texts: list[str], *, is_query: bool) -> list[list[float]]:
    """Embed via the configured HTTP backend."""
    url = f"{settings.embedding_base_url.rstrip('/')}/embed"
    resp = httpx.post(
        url,
        json={"texts": texts, "is_query": is_query},
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.json()["embeddings"]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of passages/documents into dense vectors."""
    if not texts:
        return []
    if settings.embedding_base_url:
        return _remote_embed(texts, is_query=False)
    model = _get_model()
    output = model.encode(
        texts,
        batch_size=settings.embedding_batch_size,
        max_length=8192,
    )
    return [vec.tolist() for vec in output["dense_vecs"]]


def embed_query(query: str) -> list[float]:
    """Embed a single search query into a dense vector."""
    if settings.embedding_base_url:
        return _remote_embed([query], is_query=True)[0]
    model = _get_model()
    output = model.encode(
        [_QUERY_INSTRUCTION + query],
        batch_size=1,
        max_length=8192,
    )
    return output["dense_vecs"][0].tolist()

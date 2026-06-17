"""Application configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralised, validated application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App ---
    app_name: str = "DocuPilot"
    environment: str = Field(default="development")
    debug: bool = Field(default=True)
    api_prefix: str = "/api/v1"
    # Comma-separated list (or JSON array) of allowed CORS origins.
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:8080",
            "http://localhost:3000",
            "https://3000-01kv8qt5y96a31hqwjxve2fkdx.cloudspaces.litng.ai",
        ]
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Allow a comma-separated string for `ALLOWED_ORIGINS` env values."""
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                return stripped
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    # --- Database ---
    database_url: str = Field(
        default="postgresql+asyncpg://docupilot:docupilot@localhost:5432/docupilot"
    )

    # --- Redis / Celery ---
    celery_broker_url: str = Field(default="redis://localhost:6379/1")
    celery_result_backend: str = Field(default="redis://localhost:6379/2")

    # --- Storage (local filesystem) ---
    storage_path: str = Field(default="./storage")

    # --- Uploads ---
    max_upload_mb: int = 50

    # --- vLLM (OpenAI-compatible local LLM server) ---
    vllm_base_url: str = Field(default="http://localhost:8001/v1")
    vllm_api_key: str = Field(default="not-needed")
    llm_model: str = Field(default="Qwen/Qwen3-14B-AWQ")
    llm_max_tokens: int = 1024
    llm_temperature: float = 0.3
    llm_context_window: int = 32768

    # --- Embeddings (BGE-M3) ---
    # By default the model runs in-process via FlagEmbedding. Set
    # `embedding_base_url` to offload embedding to a single self-hosted backend
    # (keeps the web image light and the model resident in one place).
    embedding_model: str = Field(default="BAAI/bge-m3")
    embedding_dim: int = 1024
    # FP16 only makes sense on a CUDA device; keep False for CPU (the default).
    embedding_use_fp16: bool = False
    embedding_batch_size: int = 16
    # e.g. "cpu", "cuda", "cuda:0". None lets FlagEmbedding choose.
    embedding_device: str | None = None
    # Optional HTTP embedding backend, e.g. "http://worker:8002". When unset the
    # model is loaded in-process.
    embedding_base_url: str | None = None
    # Load the in-process model at startup so the first request isn't a stall.
    embedding_warmup: bool = False

    # --- RAG ---
    chunk_target_chars: int = 1800
    chunk_overlap_chars: int = 200
    retrieval_top_k: int = 8
    max_history_messages: int = 10
    # pgvector HNSW search breadth; higher = better recall, slower. None = leave
    # the server default.
    hnsw_ef_search: int | None = 64
    # Optional cross-encoder reranking. When enabled, retrieval over-fetches
    # `retrieval_top_k * rerank_overfetch` candidates and reranks them down to
    # `retrieval_top_k`. Loads a reranker model in-process (off by default).
    rerank_enabled: bool = False
    rerank_model: str = "BAAI/bge-reranker-v2-m3"
    rerank_overfetch: int = 4

    @property
    def sync_database_url(self) -> str:
        """Synchronous SQLAlchemy URL (used by Alembic and Celery)."""
        return self.database_url.replace("+asyncpg", "+psycopg")


@lru_cache
def get_settings() -> Settings:
    """Return a cached settings instance."""
    return Settings()


settings = get_settings()

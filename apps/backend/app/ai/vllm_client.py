"""vLLM client (OpenAI-compatible API) for Qwen3-32B.

vLLM serves an OpenAI-compatible `/v1` endpoint, so we use the official `openai`
async client pointed at the local server. Supports both buffered and streaming
chat completions with tenacity-based retries on transient failures.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings
from app.core.exceptions import LLMError
from app.logging import get_logger

logger = get_logger(__name__)

# Retry only on transient network/rate-limit errors, not on 4xx client errors.
_TRANSIENT = (APIConnectionError, RateLimitError)

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    """Return a cached async OpenAI client targeting the local vLLM server."""
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=settings.vllm_base_url,
            api_key=settings.vllm_api_key,
            timeout=60.0,
        )
    return _client


@retry(
    retry=retry_if_exception_type(_TRANSIENT),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
async def complete(messages: list[dict[str, str]]) -> str:
    """Return a single buffered chat completion."""
    try:
        resp = await get_client().chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
        )
        return resp.choices[0].message.content or ""
    except _TRANSIENT:
        raise
    except APIStatusError as exc:
        logger.error("llm_completion_status_error", status=exc.status_code, error=str(exc))
        raise LLMError("Failed to get a response from the language model") from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("llm_completion_failed", error=str(exc))
        raise LLMError("Failed to get a response from the language model") from exc


async def stream(messages: list[dict[str, str]]) -> AsyncIterator[str]:
    """Yield chat completion content tokens as they arrive."""
    try:
        response = await get_client().chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            stream=True,
            timeout=120.0,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as exc:  # noqa: BLE001
        logger.error("llm_stream_failed", error=str(exc))
        raise LLMError("Failed to stream a response from the language model") from exc

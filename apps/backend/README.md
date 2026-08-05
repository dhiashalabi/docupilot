# DocuPilot backend

FastAPI + SQLAlchemy + Celery + pgvector service that ingests PDFs, embeds
their chunks, and streams grounded chat answers via SSE.

**See also:** [docs/BACKEND.md](../../docs/BACKEND.md) (modules, API, Celery),
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md),
[docs/DATA_FLOWS.md](../../docs/DATA_FLOWS.md),
[docs/RAG.md](../../docs/RAG.md),
[docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

## Configuration

Runtime settings live in [`app/config.py`](app/config.py) and are populated
from environment variables (or a `.env` file). Highlights:

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://docupilot:docupilot@localhost:5432/docupilot` | Async DSN. Sync variant is derived automatically for Alembic + Celery. |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | Redis DB 1 / 2 | |
| `STORAGE_PATH` | `./storage` | Local filesystem root for uploaded PDFs. |
| `MAX_UPLOAD_MB` | `50` | Enforced while streaming the upload to disk. |
| `MAX_DOCUMENT_PAGES` | `2000` | Ingestion FAILs on PDFs above this. |
| `VLLM_BASE_URL` | `http://localhost:8001/v1` | OpenAI-compatible endpoint. |
| `LLM_MODEL` | `Qwen/Qwen3-14B-AWQ` | Must match the model actually loaded on vLLM (checked by `/health/system`). |
| `SSE_KEEPALIVE_SECONDS` | `15` | Comment-frame interval for the message stream. |
| `INGEST_STUCK_AFTER_SECONDS` | `900` | The `reap_stuck_jobs` beat task marks PROCESSING jobs older than this as FAILED. |
| `MAX_HISTORY_MESSAGES` | `10` | Recent turns sent to the LLM verbatim. |
| `MAX_HISTORY_SUMMARY_MESSAGES` | `50` | Hard cap on history rows loaded per turn. |

### `ALLOWED_ORIGINS`

CORS allow-list for the API. Accepts either a **comma-separated string** or a
**JSON array**:

```bash
# Comma-separated (most convenient in shell/compose):
ALLOWED_ORIGINS=https://app.example.com,https://staging.example.com

# JSON array (identical result):
ALLOWED_ORIGINS='["https://app.example.com","https://staging.example.com"]'
```

Empty or unset falls back to `http://localhost:3000` and `http://localhost:8080`.

## Endpoints

The full v1 surface is under `/api/v1`. Notable behaviours:

- `POST /documents` and `POST /chats/{id}/documents` **stream uploads to disk**
  and **deduplicate by SHA-256 content hash** — uploading the same PDF twice
  returns the existing row (still HTTP 201) instead of creating a duplicate.
- `GET /chats`, `GET /documents`, `GET /chats/{id}/messages` accept optional
  `limit` and `before` (ISO-8601 timestamp) query parameters for cursor
  pagination. Omitting both preserves the "return everything" default.
- `POST /chats/{id}/messages/stream` emits Server-Sent Events. During long
  silences a `: keepalive` comment frame is emitted every
  `SSE_KEEPALIVE_SECONDS` so proxies don't drop the connection. If the client
  disconnects mid-stream the partial reply is persisted with
  `meta.interrupted = true`.
- Every request/response carries an `X-Request-ID` header (generated when
  absent). The same id is bound into structlog context and appears on every
  log line for the request.

## Operations

- **Migrations:** `alembic upgrade head`. The `0002_backend_hardening`
  revision adds `documents.updated_at`, `documents.content_hash` (with a
  partial unique index over non-NULL values), and `messages.meta`; the
  migration opportunistically sha256-backfills existing rows from disk.
- **Workers:** run at least one Celery worker
  (`celery -A app.workers.celery_app.celery_app worker`) and one Celery
  beat (`... beat`). The `beat` service is what triggers `reap_stuck_jobs`.

# Development Guide

How to run DocuPilot locally for development. For a high-level overview of the
project, see the [README](../README.md).

DocuPilot is composed of:

| Component | Tech | Default port |
| --- | --- | --- |
| Frontend | Next.js (App Router) | `3000` |
| Backend API | FastAPI (uvicorn) | `8000` |
| Worker | Celery | – |
| Database | PostgreSQL + pgvector | `5432` |
| Queue / cache | Redis | `6379` |
| LLM server | vLLM (OpenAI-compatible) | `8001` |
| Embeddings | BGE-M3 (in-process, no service) | – |

> The embedding model (BGE-M3) runs **inside** the backend and worker processes.
> It has no container of its own and downloads its weights once into the shared
> Hugging Face cache.

---

## Prerequisites

- **Docker** and **Docker Compose** — required for Postgres and Redis (and
  optionally the rest of the stack).
- **[uv](https://docs.astral.sh/uv/)** — Python toolchain for the backend.
- **[pnpm](https://pnpm.io/)** and **Node.js 20+** — for the frontend.
- A reachable **LLM server** (one of):
  - A remote GPU box running vLLM (recommended for real use), or
  - [Ollama](https://ollama.com/) running locally (easiest for dev), or
  - The bundled `vllm` container (requires a local NVIDIA GPU + the NVIDIA
    Container Toolkit).

You only need `uv`/`pnpm` for the **hybrid** workflow below. The **all-in-Docker**
workflow needs nothing but Docker.

---

## First-time setup

```bash
git clone <repo> docupilot && cd docupilot
cp .env.example .env
```

Then pick one of the two workflows below.

---

## Workflow A — Everything in Docker (simplest)

Best when you just want the app running, or you have a local NVIDIA GPU.

```bash
docker compose -f docker-compose.dev.yml up
```

This starts Postgres, Redis, vLLM, the backend (hot reload), the frontend (hot
reload), and the Celery worker. Source is mounted, so edits reload automatically.
Migrations run on backend startup.

- Frontend: http://localhost:3000
- API + Swagger docs: http://localhost:8000/docs
- vLLM: http://localhost:8001/v1

Common tasks (`make help` lists all):

```bash
make up           # start dev stack
make logs         # tail all logs
make worker-logs  # tail worker logs
make migrate      # apply migrations
make makemigration msg="add x"  # autogenerate a migration
make shell-backend
make shell-db     # open psql
make lint         # ruff + eslint
make down         # stop
make clean        # stop and remove volumes
```

> Requires a local NVIDIA GPU for the `vllm` service. If you don't have one, use
> Workflow B with Ollama or a remote LLM.

---

## Workflow B — Hybrid: deps in Docker, app on host (recommended)

Run only the stateful dependencies (Postgres + Redis) in Docker, and run the
code you're editing natively for the fastest reload loop. The LLM lives on a
remote GPU box (or local Ollama).

### 1. Start the dependencies

```bash
docker compose -f docker-compose.dev.yml up -d db redis
```

### 2. Configure `.env` for host networking

When the app runs on your host (not inside the Compose network), use `localhost`
instead of the service names `db` / `redis` / `vllm`:

```bash
DATABASE_URL=postgresql+asyncpg://docupilot:docupilot@localhost:5432/docupilot
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

VLLM_BASE_URL=http://localhost:8001/v1
VLLM_API_KEY=not-needed
LLM_MODEL=Qwen/Qwen3-14B-AWQ
```

### 3. Run the backend (terminal 1)

```bash
cd apps/backend
uv sync                          # first run / when deps change
uv run alembic upgrade head      # apply migrations
uv run fastapi dev               # hot-reload API on :8000
```

### 4. Run the worker (terminal 2)

Needed for PDF ingestion / background jobs.

```bash
cd apps/backend
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info --concurrency=1
```

### 5. Run the frontend (terminal 3)

```bash
cd apps/frontend
pnpm install                     # first run / when deps change
pnpm dev                         # :3000
```

### 6. Connect the LLM (terminal 4)

**Remote vLLM via SSH tunnel** (keeps `VLLM_BASE_URL=http://localhost:8001/v1`):

```bash
ssh -N -L 8001:localhost:8001 user@gpu-server
```

**Or local Ollama** (no GPU server needed):

```bash
ollama pull qwen3:14b
ollama serve
```

…and set in `.env`:

```bash
VLLM_BASE_URL=http://localhost:11434/v1
VLLM_API_KEY=ollama
LLM_MODEL=qwen3:14b
```

> The app starts fine without an LLM — only chat/summary requests fail until one
> is reachable, and the in-app System Health widget shows **Model (vLLM): Down**.

---

## Verifying it works

- Open http://localhost:3000 and the **System Health** indicator in the header.
  Green = all subsystems up; amber = partial; red = all down.
- Health endpoints:

```bash
curl http://localhost:8000/api/v1/health          # liveness
curl http://localhost:8000/api/v1/health/ready     # database
curl http://localhost:8000/api/v1/health/system    # all subsystems
```

---

## Database migrations

```bash
# hybrid (host)
cd apps/backend
uv run alembic upgrade head                       # apply
uv run alembic revision --autogenerate -m "msg"   # create

# all-in-docker
make migrate
make makemigration msg="msg"
```

---

## Linting

```bash
# backend
cd apps/backend && uv run ruff check .

# frontend
cd apps/frontend && pnpm lint
```

---

## Environment variables

`.env.example` documents every variable. The ones that change between the two
workflows are the host names in `DATABASE_URL`, `CELERY_BROKER_URL`,
`CELERY_RESULT_BACKEND`, and `VLLM_BASE_URL` (`db`/`redis`/`vllm` inside Docker
vs. `localhost` on the host). See [Self-hosting the model](../README.md#self-hosting-the-model)
for choosing `LLM_MODEL` by GPU VRAM.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `connection refused` to Postgres/Redis | Deps not running: `docker compose -f docker-compose.dev.yml up -d db redis`. In hybrid mode, ensure `.env` uses `localhost`, not `db`/`redis`. |
| System Health shows **Model: Down** | No reachable LLM. Start the SSH tunnel or Ollama, and check `VLLM_BASE_URL`. |
| System Health shows **Worker: Down** | The Celery worker isn't running (terminal 2). |
| Uploads stay **Processing / Pending** | Worker not running, or it can't reach the DB/Redis. Check the worker logs. |
| First chat is very slow | Embedding model or LLM weights still loading. Set `EMBEDDING_WARMUP=true` to preload embeddings at startup. |
| Frontend can't reach the API (CORS) | Add your origin to `ALLOWED_ORIGINS` and confirm `NEXT_PUBLIC_API_URL`. |

---

## Production

See the [Production section of the README](../README.md#production) for the
`docker-compose.prod.yml` deployment.

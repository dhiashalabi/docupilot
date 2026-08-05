# DocuPilot frontend

Next.js (App Router) UI for DocuPilot — documents, chat with citations, semantic
search, and PDF generation. Built with TypeScript, Tailwind CSS, and shadcn/ui.

**See also:** [docs/FRONTEND.md](../../docs/FRONTEND.md) (routes, data layer,
feature flows), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md),
[docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

## Run

Prefer the repo root workflows:

- **All-in-Docker:** see the [root README](../../README.md) quickstart
  (`docker compose -f docker-compose.dev.yml up` or `make up`).
- **Hybrid (recommended for UI work):** see
  [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) — run Postgres/Redis in Docker,
  then from this directory:

```bash
pnpm install
pnpm dev
```

App: http://localhost:3000 · API (default): http://localhost:8000

Set `NEXT_PUBLIC_API_URL` if the backend is not on that URL.

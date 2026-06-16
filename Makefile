DEV  := docker compose -f docker-compose.dev.yml
PROD := docker compose -f docker-compose.prod.yml

.PHONY: help up down logs build migrate makemigration shell-backend shell-db \
        worker-logs lint prod-up prod-down prod-build clean ollama-tunnel

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS=":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start the development stack
	$(DEV) up

down: ## Stop the development stack
	$(DEV) down

build: ## Build dev images
	$(DEV) build

logs: ## Tail all dev logs
	$(DEV) logs -f

worker-logs: ## Tail worker logs
	$(DEV) logs -f worker

migrate: ## Apply database migrations
	$(DEV) exec backend bash -c "cd /app/apps/backend && .venv/bin/alembic upgrade head"

makemigration: ## Autogenerate a migration (msg="...")
	$(DEV) exec backend bash -c "cd /app/apps/backend && .venv/bin/alembic revision --autogenerate -m '$(msg)'"

shell-backend: ## Open a shell in the backend container
	$(DEV) exec backend bash

shell-db: ## Open a psql shell
	$(DEV) exec db psql -U docupilot -d docupilot

ollama-tunnel: ## Start WSL SSH tunnel to Lightning Ollama (hybrid dev)
	@bash scripts/lightning-ollama-tunnel.sh start

lint: ## Lint backend (ruff) and frontend (eslint)
	$(DEV) exec backend bash -c "cd /app/apps/backend && .venv/bin/ruff check ."
	$(DEV) exec frontend bash -c "cd /app/apps/frontend && pnpm lint"

prod-up: ## Start the production stack
	$(PROD) up -d --build

prod-down: ## Stop the production stack
	$(PROD) down

prod-build: ## Build production images
	$(PROD) build

clean: ## Remove dev containers and volumes
	$(DEV) down -v

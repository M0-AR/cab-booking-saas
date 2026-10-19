SHELL := /bin/bash

.PHONY: init up down logs ps seed migrate test reset

# Create .env with generated secrets (safe to re-run; never overwrites).
init:
	@if [ -f .env ]; then \
		echo ".env already exists — leaving it untouched."; \
	else \
		cp .env.example .env; \
		sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$$(openssl rand -hex 24)/" .env; \
		sed -i "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=$$(openssl rand -hex 24)/" .env; \
		sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$$(openssl rand -hex 48)/" .env; \
		echo "Created .env with fresh secrets."; \
	fi

up: init
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

migrate:
	docker compose exec api alembic upgrade head

seed:
	docker compose exec api python -m scripts.seed_demo

test:
	cd backend && ./.venv/bin/pytest -q

reset:
	docker compose down -v
	docker compose up -d --build

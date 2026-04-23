SHELL := /bin/zsh

PNPM := pnpm
PRISMA := $(PNPM) prisma

.PHONY: help install dev runbackend closebackend build start lint test test-cov migrate migrate-reset generate seed db-push db-status studio docker-up docker-down docker-logs

help:
	@echo "Cashquest Backend Make targets"
	@echo "  make install        Install dependencies"
	@echo "  make dev            Run Nest in watch mode"
	@echo "  make runbackend     Start backend container and Nest dev server"
	@echo "  make closebackend   Stop backend container"
	@echo "  make build          Build backend"
	@echo "  make start          Start backend"
	@echo "  make lint           Run ESLint with fixes"
	@echo "  make test           Run tests"
	@echo "  make test-cov       Run tests with coverage"
	@echo "  make migrate        Run prisma migrate dev"
	@echo "  make migrate-reset  Reset database and reapply migrations"
	@echo "  make generate       Regenerate Prisma Client"
	@echo "  make seed           Seed database"
	@echo "  make db-push        Push Prisma schema to database"
	@echo "  make db-status      Show migration status"
	@echo "  make studio         Open Prisma Studio"
	@echo "  make docker-up      Start docker-compose services"
	@echo "  make docker-down    Stop docker-compose services"
	@echo "  make docker-logs    Tail docker-compose logs"

install:
	$(PNPM) install

dev:
	$(PNPM) run start:dev

closebackend:
	docker compose stop backend

runbackend:
	@set -e; \
	cleanup() { docker compose down; }; \
	trap 'trap - EXIT; cleanup; exit 130' INT TERM; \
	trap cleanup EXIT; \
	docker compose up -d; \
	$(PNPM) prisma studio & \
	$(PNPM) run start:dev

build:
	$(PNPM) run build

start:
	$(PNPM) run start

lint:
	$(PNPM) run lint

test:
	$(PNPM) run test

test-cov:
	$(PNPM) run test:cov

migrate:
	$(PRISMA) migrate dev

migrate-reset:
	$(PRISMA) migrate reset --force

generate:
	$(PRISMA) generate

seed:
	$(PRISMA) db seed

db-push:
	$(PRISMA) db push

db-status:
	$(PRISMA) migrate status

studio:
	$(PRISMA) studio

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

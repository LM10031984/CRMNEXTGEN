.PHONY: help up down logs clean status pull-models db-migrate db-seed db-studio dev test lint format

help: ## Afficher l'aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# === Docker ===

up: ## Lancer tous les services Docker
	docker compose up -d
	@echo ""
	@echo "✅ Services lancés. Vérifie avec : make status"
	@echo ""
	@echo "  Postgres  : localhost:5432       (qualiof / qualiof_dev)"
	@echo "  Redis     : localhost:6379"
	@echo "  MinIO     : http://localhost:9001 (qualiof / qualiof_dev_minio)"
	@echo "  Gotenberg : http://localhost:3001"
	@echo ""
	@echo "💡 Ollama : utiliser la version native sur Mac M-series (brew install ollama)"

down: ## Arrêter tous les services
	docker compose down

logs: ## Suivre les logs en temps réel
	docker compose logs -f

status: ## Voir l'état des services
	docker compose ps

clean: ## ⚠️ Tout arrêter ET supprimer les volumes (RESET COMPLET)
	@read -p "Supprimer toutes les données ? [y/N] " confirm; \
	if [ "$$confirm" = "y" ]; then \
		docker compose down -v; \
		echo "✅ Reset complet effectué"; \
	else \
		echo "Annulé"; \
	fi

# === Ollama (modèles IA) ===

pull-models: ## Télécharger le modèle Llama 3.1 8B
	@if command -v ollama >/dev/null 2>&1; then \
		echo "Ollama natif détecté, pull en cours..."; \
		ollama pull llama3.1:8b; \
	else \
		echo "Ollama natif non trouvé, pull via le container..."; \
		docker compose --profile full up -d ollama; \
		docker compose exec ollama ollama pull llama3.1:8b; \
	fi

# === Base de données (à utiliser quand le mono-repo Next.js sera créé) ===

db-migrate: ## Appliquer les migrations Prisma
	pnpm --filter @qualiof/db prisma migrate dev

db-seed: ## Charger les données de seed (Pascal BIANCO + 5 personnes + 2 sessions)
	pnpm --filter @qualiof/db prisma db seed

db-studio: ## Ouvrir Prisma Studio
	pnpm --filter @qualiof/db prisma studio

# === Dev ===

dev: ## Lancer le front Next.js en dev
	pnpm --filter @qualiof/web dev

test: ## Lancer les tests (Vitest + Playwright)
	pnpm test

lint: ## Linter le code
	pnpm lint

format: ## Formatter le code
	pnpm format

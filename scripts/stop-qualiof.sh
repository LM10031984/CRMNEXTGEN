#!/usr/bin/env bash
#
# Arrête proprement QualiOF : Next.js + worker BullMQ + services Docker.
# Invoqué par /Applications/QualiOF Quit.app (double-clic).
#

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/laurentmarx/Documents/CRM Next gen/files"
QUALIOF_PORT=3010

cd "$PROJECT_DIR"

# 1. Stopper Next.js sur le port QualiOF
lsof -ti:$QUALIOF_PORT 2>/dev/null | xargs kill 2>/dev/null || true

# 2. Stopper le worker BullMQ closure-generation
pgrep -f "closure-worker.ts" 2>/dev/null | xargs kill 2>/dev/null || true
pgrep -f "concurrently.*pnpm dev.*pnpm worker:closure" 2>/dev/null | xargs kill 2>/dev/null || true

# 3. Stopper les services Docker (Postgres, Redis, MinIO, Gotenberg, WeasyPrint)
docker compose down 2>/dev/null || true

# 4. Notification
osascript -e 'display notification "QualiOF arrêté proprement" with title "QualiOF" sound name "Glass"'

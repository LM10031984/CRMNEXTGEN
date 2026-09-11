#!/usr/bin/env bash
#
# Arrête proprement QualiOF : Next.js + worker BullMQ + services Docker.
# Invoqué par /Applications/QualiOF Quit.app (double-clic).
#

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# ── Le répertoire du projet, dérivé de l'EMPLACEMENT de ce script ──────────────
#
# Il était écrit en dur jusqu'au 11/09/2026 — un chemin absolu sous l'ancien
# emplacement iCloud. Le dépôt est sorti d'iCloud, et l'ancien dossier EXISTE
# toujours : iCloud y a laissé une coquille qui ne contient que `apps/`. Le `cd`
# réussissait, puis tout échouait sans message utile.
#
# Le chemin n'est volontairement PAS recopié ici, même en commentaire : le garde
# `apps/web/src/lib/__tests__/chemins-en-dur.test.ts` balaie aussi les
# commentaires, et il a raison — un chemin mort recopié finit par être relu comme
# une consigne.
#
# La dérivation donne aussi, gratuitement, le fonctionnement depuis n'importe quel
# worktree — c'est le dépôt où VIT le script qui est lancé, pas un autre.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# La garde est la PREMIÈRE chose après le PATH, AVANT tout docker/osascript :
# placée plus bas, elle ne garderait rien.
if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo "QualiOF : aucun package.json dans $PROJECT_DIR — le dépôt a bougé ou le script a été copié hors du dépôt." >&2
  osascript -e 'display notification "Dépôt introuvable — voir /tmp/qualiof-stop.log" with title "QualiOF" sound name "Basso"' 2>/dev/null || true
  exit 1
fi

# Mode de vérification : ce qui rend ce script testable sans démarrer Docker ni
# tuer un processus.
if [ "${QUALIOF_CHECK_ONLY:-}" = "1" ]; then
  echo "$PROJECT_DIR"
  exit 0
fi

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

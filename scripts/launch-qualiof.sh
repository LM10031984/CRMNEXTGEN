#!/usr/bin/env bash
#
# Lance QualiOF en local : Docker + Next.js + Worker + navigateur.
# Invoqué par /Applications/QualiOF.app (double-clic).
#

set -e

# PATH explicite car invoqué hors shell login (Automator/osascript)
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
  osascript -e 'display notification "Dépôt introuvable — voir /tmp/qualiof-launch.log" with title "QualiOF" sound name "Basso"' 2>/dev/null || true
  exit 1
fi

# Mode de vérification : ce qui rend ce script testable sans démarrer Docker ni
# tuer un processus.
if [ "${QUALIOF_CHECK_ONLY:-}" = "1" ]; then
  echo "$PROJECT_DIR"
  exit 0
fi

cd "$PROJECT_DIR"

# 1. Démarrer Docker Desktop si pas tournant
if ! docker info > /dev/null 2>&1; then
  osascript -e 'display notification "Démarrage de Docker Desktop..." with title "QualiOF"'
  open -a "Docker"
  # Attendre que Docker soit prêt (max 60s)
  for i in {1..30}; do
    if docker info > /dev/null 2>&1; then
      break
    fi
    sleep 2
  done
fi

# 2. Démarrer les services backend (Postgres, Redis, MinIO, Gotenberg, WeasyPrint)
osascript -e 'display notification "Démarrage des services Docker..." with title "QualiOF"'
docker compose up -d

# Port unique QualiOF — évite collision avec d'autres projets Next sur 3000/3001/3002
QUALIOF_PORT=3010

# 3. Lancer pnpm dev:full dans une fenêtre Terminal (pour visualiser les logs)
# Le chemin contient une espace et traverse un heredoc AppleScript : on garde les
# quotes SIMPLES autour de $PROJECT_DIR côté shell de la fenêtre Terminal.
osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd '$PROJECT_DIR' && PORT=$QUALIOF_PORT pnpm dev:full"
end tell
APPLESCRIPT

# 4. Attendre que Next.js réponde sur QUALIOF_PORT (max 60s)
osascript -e 'display notification "Attente du démarrage de Next.js..." with title "QualiOF"'
for i in {1..60}; do
  # Vérifie que c'est bien QualiOF qui répond (pas un zombie sur le même port)
  if curl -s "http://localhost:$QUALIOF_PORT" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 5. Ouvrir le navigateur (ou afficher erreur si timeout)
if curl -s "http://localhost:$QUALIOF_PORT" > /dev/null 2>&1; then
  open "http://localhost:$QUALIOF_PORT"
  osascript -e "display notification \"QualiOF prêt sur http://localhost:$QUALIOF_PORT\" with title \"QualiOF\""
else
  osascript -e 'display notification "Timeout — vérifier la fenêtre Terminal" with title "QualiOF" sound name "Basso"'
  exit 1
fi

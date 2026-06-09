#!/usr/bin/env bash
#
# Lance QualiOF en local : Docker + Next.js + Worker + navigateur.
# Invoqué par ~/Applications/QualiOF.app (double-clic).
#

set -e

# PATH explicite car invoqué hors shell login (Automator/osascript)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/laurentmarx/Documents/CRM Next gen/files"

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
osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd '/Users/laurentmarx/Documents/CRM Next gen/files' && PORT=$QUALIOF_PORT pnpm dev:full"
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

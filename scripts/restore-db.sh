#!/usr/bin/env bash
# Sprint 1 — Restore Postgres depuis un backup pg_dump.
#
# Le service `postgres-backup` (docker-compose) écrit ses dumps dans le volume
# Docker `postgres_backups` selon la convention :
#
#   /backups/daily/qualiof-YYYYMMDD-HHMMSS.sql.gz
#   /backups/weekly/qualiof-YYYYMMDD-HHMMSS.sql.gz
#   /backups/monthly/qualiof-YYYYMMDD-HHMMSS.sql.gz
#
# Usage :
#   ./scripts/restore-db.sh                # liste les backups dispo
#   ./scripts/restore-db.sh latest         # restaure le dernier dump daily
#   ./scripts/restore-db.sh <fichier.gz>   # restaure un dump précis
#
# Exécuté manuellement par l'admin — pas appelé automatiquement par l'app.
set -euo pipefail

CONTAINER="${PG_CONTAINER:-qualiof_postgres}"
BACKUP_CONTAINER="${BACKUP_CONTAINER:-qualiof_pg_backup}"
DB="${POSTGRES_DB:-qualiof}"
USER="${POSTGRES_USER:-qualiof}"

ARG="${1:-list}"

list_backups() {
  echo "Backups disponibles dans le volume postgres_backups :"
  docker exec "$BACKUP_CONTAINER" sh -c 'ls -lh /backups/daily/ 2>/dev/null && echo "---" && ls -lh /backups/weekly/ 2>/dev/null && echo "---" && ls -lh /backups/monthly/ 2>/dev/null' || {
    echo "Le container $BACKUP_CONTAINER n'est pas démarré. Lance : docker compose up -d postgres-backup"
    exit 1
  }
}

if [[ "$ARG" == "list" ]]; then
  list_backups
  exit 0
fi

if [[ "$ARG" == "latest" ]]; then
  FILE=$(docker exec "$BACKUP_CONTAINER" sh -c 'ls -t /backups/daily/*.sql.gz 2>/dev/null | head -n1')
  if [[ -z "$FILE" ]]; then
    echo "Aucun backup daily disponible."
    exit 1
  fi
  echo "Dernier backup : $FILE"
else
  FILE="$ARG"
fi

# Sanity check : confirmer avant de WIPE
echo ""
echo "⚠️  Cette opération va REMPLACER la BDD '$DB' du container '$CONTAINER'."
echo "Backup à restaurer : $FILE"
read -p "Tape 'restore' pour confirmer : " confirm
if [[ "$confirm" != "restore" ]]; then
  echo "Abandonné."
  exit 1
fi

echo "[1/3] Drop + recreate database…"
docker exec -u postgres "$CONTAINER" psql -c "DROP DATABASE IF EXISTS ${DB}_restore;"
docker exec -u postgres "$CONTAINER" psql -c "CREATE DATABASE ${DB}_restore;"

echo "[2/3] Restauration du dump…"
docker exec "$BACKUP_CONTAINER" sh -c "gunzip -c $FILE" | \
  docker exec -i -u postgres "$CONTAINER" psql "${DB}_restore"

echo "[3/3] Rename atomique ${DB} → ${DB}_old, ${DB}_restore → ${DB}…"
docker exec -u postgres "$CONTAINER" psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB}' AND pid <> pg_backend_pid();" || true
docker exec -u postgres "$CONTAINER" psql -c "ALTER DATABASE ${DB} RENAME TO ${DB}_old_$(date +%Y%m%d%H%M%S);"
docker exec -u postgres "$CONTAINER" psql -c "ALTER DATABASE ${DB}_restore RENAME TO ${DB};"

echo ""
echo "✅ Restauration terminée. L'ancienne BDD est conservée sous '${DB}_old_*' au cas où."
echo "Pour la supprimer définitivement plus tard :"
echo "    docker exec -u postgres $CONTAINER psql -c \"DROP DATABASE <nom_ancienne>;\""

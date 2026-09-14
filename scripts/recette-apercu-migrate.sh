#!/usr/bin/env bash
# Applique les migrations en attente sur la base d'APERÇU (Vercel Preview), et
# rien d'autre. Même garde-fou que recette-apercu-seed.sh : l'URL est tirée de
# Vercel, vérifiée (ref aperçu, jamais prod), puis le fichier temporaire est effacé.
# Usage : scripts/recette-apercu-migrate.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REF_APERCU="oodxvrzpxdrggzyurlwl"
REF_PROD="gntlqyscahbgjrmsbzil"
ENVF=".env.apercu"
trap 'rm -f "$ENVF"' EXIT

echo "→ 1/3 Récupération des variables Preview depuis Vercel"
vercel env pull --environment=preview --yes "$ENVF" >/dev/null
lire() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
DATABASE_URL="$(lire DATABASE_URL)"
DIRECT_URL="$(lire DIRECT_URL)"
[ -n "$DATABASE_URL" ] || { echo "❌ DATABASE_URL absente des variables Preview"; exit 1; }
[ -n "$DIRECT_URL" ] || DIRECT_URL="$DATABASE_URL"

echo "→ 2/3 Contrôle de la cible"
case "$DATABASE_URL$DIRECT_URL" in *"$REF_PROD"*) echo "❌ STOP : URL de PRODUCTION. Rien n'a été fait."; exit 1;; esac
case "$DATABASE_URL" in *"$REF_APERCU"*) echo "   ✓ base d'aperçu ($REF_APERCU)";; *) echo "❌ STOP : pas la base d'aperçu. Rien n'a été fait."; exit 1;; esac
export DATABASE_URL DIRECT_URL

echo "→ 3/3 prisma migrate deploy (aperçu)"
pnpm --filter @qualiof/db exec prisma migrate deploy
echo "✅ Base d'aperçu à jour."

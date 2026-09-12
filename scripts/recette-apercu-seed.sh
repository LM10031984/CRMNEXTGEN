#!/usr/bin/env bash
# Prépare la base d'APERÇU (Vercel Preview) pour la recette C.3 :
#   1. récupère l'URL de la base d'aperçu depuis Vercel (jamais tapée à la main),
#   2. vérifie que c'est bien l'aperçu (oodxvrzpxdrggzyurlwl) et PAS la prod,
#   3. seed de base (tenant + admin@startacademy.fr / admin + catalogues),
#   4. jeu de démo signature (DEMO-SIG-01),
#   5. rebranche l'email du dirigeant démo et le signataire OF sur $RECETTE_EMAIL,
#   6. efface le fichier d'env temporaire.
# Usage : RECETTE_EMAIL=laurent@start-academy.fr scripts/recette-apercu-seed.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${RECETTE_EMAIL:?RECETTE_EMAIL manquant (ton adresse pour la recette)}"
REF_APERCU="oodxvrzpxdrggzyurlwl"
REF_PROD="gntlqyscahbgjrmsbzil"
ENVF=".env.apercu"

trap 'rm -f "$ENVF"' EXIT

echo "→ 1/6 Récupération des variables Preview depuis Vercel"
vercel env pull --environment=preview --yes "$ENVF" >/dev/null

lire() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
DATABASE_URL="$(lire DATABASE_URL)"
DIRECT_URL="$(lire DIRECT_URL)"
[ -n "$DATABASE_URL" ] || { echo "❌ DATABASE_URL absente des variables Preview"; exit 1; }
[ -n "$DIRECT_URL" ] || DIRECT_URL="$DATABASE_URL"

echo "→ 2/6 Contrôle de la cible"
case "$DATABASE_URL$DIRECT_URL" in
  *"$REF_PROD"*) echo "❌ STOP : l'URL pointe sur la PRODUCTION. Rien n'a été fait."; exit 1;;
esac
case "$DATABASE_URL" in
  *"$REF_APERCU"*) echo "   ✓ base d'aperçu ($REF_APERCU)";;
  *) echo "❌ STOP : l'URL ne ressemble pas à la base d'aperçu. Rien n'a été fait."; exit 1;;
esac
export DATABASE_URL DIRECT_URL SEED_ALLOW_PROD=1

echo "→ 3/6 Seed de base (tenant, admin, catalogues)"
pnpm --filter @qualiof/db exec tsx prisma/seed.ts

echo "→ 4/6 Jeu de démo signature (DEMO-SIG-01)"
pnpm --filter @qualiof/db exec tsx scripts/seed-demo-signature.ts

echo "→ 5/6 Adresses de recette → $RECETTE_EMAIL"
pnpm --filter @qualiof/db exec tsx scripts/recette-rebrancher-emails.ts

echo "→ 6/6 Nettoyage du fichier d'env temporaire"
echo "✅ Base d'aperçu prête. Connexion : admin@startacademy.fr / admin"

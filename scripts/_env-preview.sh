#!/usr/bin/env bash
#
# Prépare l'environnement PREVIEW du projet Vercel `qualiof` pour la recette
# d'acceptation du lot C.3 (`.planning/specs/evidence/signature-C3/RECETTE.md`).
#
#   bash scripts/_env-preview.sh
#
# ── CE QUE CE SCRIPT NE FAIT PAS, ET POURQUOI ────────────────────────────────
#
#  · Il ne touche JAMAIS `DATABASE_URL`, `DIRECT_URL` ni `AUTH_SECRET` en
#    Preview. Elles sont déjà posées et pointent la base d'APERÇU
#    (`oodxvrzpxdrggzyurlwl`, pooler `aws-1`) — vérifié le 11/09/2026. Les
#    réécrire risquerait d'y mettre la production.
#  · Il ne lit JAMAIS `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` des fichiers
#    `.env` : celles-là pointent la PRODUCTION. Le script les demande à la main,
#    et REFUSE la référence de projet de production si elle est saisie.
#  · Il n'écrit rien en scope `production` ni `development`. Chaque appel porte
#    explicitement `preview`.
#
# ── UN CHOIX ASSUMÉ : `printf`, PAS `echo` ──────────────────────────────────
#
# `echo "$v" | vercel env add …` ajoute un SAUT DE LIGNE à la valeur. Sur
# `SMTP_PASS` ou une clé d'API, ce caractère invisible fait échouer
# l'authentification sans un message qui le dise. On pousse donc avec
# `printf '%s'`.
#
set -euo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="$ICI/../files/.env.local"
ENV_PARTAGE="$ICI/../files/.env"

# Référence du projet Supabase de PRODUCTION — celle qu'on refuse.
REF_PROD="gntlqyscahbgjrmsbzil"
# Celle de l'aperçu, pour confirmer plutôt que deviner.
REF_APERCU="oodxvrzpxdrggzyurlwl"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
gras()  { printf '\033[1m%s\033[0m\n' "$*"; }

# ── Garde-fous d'entrée ─────────────────────────────────────────────────────

command -v vercel >/dev/null || { rouge "⛔ La CLI vercel est introuvable."; exit 1; }
command -v openssl >/dev/null || { rouge "⛔ openssl est introuvable."; exit 1; }
[ -f "$ICI/.vercel/project.json" ] || {
  rouge "⛔ Projet Vercel non lié depuis $ICI."
  echo "   Lancer d'abord :  vercel link --yes --project qualiof"
  exit 1
}
[ -f "$ENV_PARTAGE" ] || { rouge "⛔ Introuvable : $ENV_PARTAGE"; exit 1; }

gras "Préparation du scope PREVIEW — projet qualiof"
echo "  source n°1 : $ENV_LOCAL"
echo "  source n°2 : $ENV_PARTAGE  (uniquement pour ce que la n°1 ne porte pas)"
echo

# ── Lecture d'un fichier .env, sans l'exécuter ──────────────────────────────
#
# On ne « source » pas ces fichiers : un `$(…)` ou un backtick dans une valeur
# s'exécuterait. On extrait la ligne, on retire les guillemets, point.
lire_var() {
  local fichier="$1" nom="$2" ligne valeur
  [ -f "$fichier" ] || return 1
  ligne="$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?${nom}=" "$fichier" || true)"
  [ -n "$ligne" ] || return 1
  valeur="${ligne#*=}"
  valeur="${valeur%\"}"; valeur="${valeur#\"}"
  valeur="${valeur%\'}"; valeur="${valeur#\'}"
  [ -n "$valeur" ] || return 1
  printf '%s' "$valeur"
}

POUSSEES=(); MANQUANTES=(); DEPUIS_PARTAGE=()

# Pousse une valeur. `rm` d'abord : `vercel env add` refuse un nom déjà présent.
pousser() {
  local nom="$1" valeur="$2"
  vercel env rm "$nom" preview --yes >/dev/null 2>&1 || true
  printf '%s' "$valeur" | vercel env add "$nom" preview >/dev/null 2>&1
  POUSSEES+=("$nom")
  vert "  ✓ $nom"
}

# Cherche dans .env.local, sinon dans .env, sinon signale le manque.
pousser_depuis_fichiers() {
  local nom="$1" valeur
  if valeur="$(lire_var "$ENV_LOCAL" "$nom")"; then
    pousser "$nom" "$valeur"
  elif valeur="$(lire_var "$ENV_PARTAGE" "$nom")"; then
    pousser "$nom" "$valeur"
    DEPUIS_PARTAGE+=("$nom")
  else
    MANQUANTES+=("$nom")
    rouge "  ✗ $nom — absent des deux fichiers"
  fi
}

# ── 1. Rendu PDF, SMTP, cron, identité de l'organisme ───────────────────────

gras "1. Valeurs reprises des fichiers .env"
for nom in \
  GOTENBERG_URL WEASYPRINT_URL \
  SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS \
  MAIL_FROM MAIL_REPLY_TO \
  CRON_SECRET
do
  pousser_depuis_fichiers "$nom"
done

# Tous les OF_* présents, quels qu'ils soient : la liste bouge avec la fiche
# organisme, et l'énumérer ici la ferait diverger au premier ajout.
for nom in $(grep -hoE '^[[:space:]]*(export[[:space:]]+)?OF_[A-Z0-9_]+' "$ENV_PARTAGE" "$ENV_LOCAL" 2>/dev/null \
             | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//' | sort -u)
do
  pousser_depuis_fichiers "$nom"
done
echo

# ── 2. Valeurs fixées par la recette ────────────────────────────────────────

gras "2. Valeurs fixées par la recette"
pousser SIGNATURE_PROVIDER "docuseal"
pousser DOCUSEAL_BASE_URL  "https://api.docuseal.eu"
pousser STORAGE_PROVIDER   "supabase"
# ⚠ DÉROGATION CONSCIENTE à la règle du 10/09/2026 (« l'aperçu n'envoie jamais
# de vrais emails »). La recette l'exige. À remettre à `true` juste après —
# section 7 de RECETTE.md.
pousser MAIL_DRY_RUN       "false"
rouge "  ⚠ MAIL_DRY_RUN=false : l'aperçu enverra de VRAIS emails."
rouge "    À remettre à true dès la recette terminée."
echo

# ── 3. Le secret de webhook, généré ici ─────────────────────────────────────

gras "3. Secret de webhook DocuSeal"
WEBHOOK_SECRET="$(openssl rand -hex 32)"
pousser DOCUSEAL_WEBHOOK_SECRET "$WEBHOOK_SECRET"
echo
gras "  ┌─ À RECOPIER DANS DOCUSEAL (Settings → Webhooks → Secret) ─────────┐"
echo   "    $WEBHOOK_SECRET"
gras "  └────────────────────────────────────────────────────────────────────┘"
echo "  Il ne sera plus jamais affiché : Vercel le chiffre."
echo

# ── 4. Les trois valeurs saisies à la main ──────────────────────────────────
#
# Elles ne transitent par aucun fichier lu par un agent : saisie masquée,
# variables locales, jamais réaffichées.

gras "4. Saisie manuelle — ces trois-là ne sont lues nulle part"

printf '  DOCUSEAL_API_KEY (saisie masquée) : '
read -rs DOCUSEAL_API_KEY; echo
[ -n "$DOCUSEAL_API_KEY" ] || { rouge "⛔ Vide — rien de plus n'a été poussé."; exit 1; }
pousser DOCUSEAL_API_KEY "$DOCUSEAL_API_KEY"
unset DOCUSEAL_API_KEY

echo
echo "  ⚠ Les DEUX suivantes viennent du projet Supabase d'APERÇU"
echo "    (ref attendue : $REF_APERCU), JAMAIS de la production."
printf '  SUPABASE_URL de l’aperçu : '
read -r SUPABASE_URL
case "$SUPABASE_URL" in
  *"$REF_PROD"*)
    rouge "⛔ C'est la référence de PRODUCTION ($REF_PROD)."
    rouge "   Rien de plus n'a été poussé. Reprendre avec le projet d'aperçu."
    exit 1 ;;
  *"$REF_APERCU"*)
    vert "  ✓ référence d'aperçu reconnue" ;;
  "")
    rouge "⛔ Vide — rien de plus n'a été poussé."; exit 1 ;;
  *)
    rouge "  ⚠ Référence inconnue — ni l'aperçu, ni la production."
    printf '  Continuer quand même ? (tapez OUI) : '
    read -r reponse
    [ "$reponse" = "OUI" ] || { rouge "⛔ Interrompu."; exit 1; } ;;
esac
pousser SUPABASE_URL "$SUPABASE_URL"
unset SUPABASE_URL

printf '  SUPABASE_SERVICE_ROLE_KEY de l’aperçu (saisie masquée) : '
read -rs SUPABASE_SERVICE_ROLE_KEY; echo
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || { rouge "⛔ Vide."; exit 1; }
pousser SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
unset SUPABASE_SERVICE_ROLE_KEY
echo

# ── 5. Bilan ────────────────────────────────────────────────────────────────

gras "5. Ce qui est en scope preview (valeurs chiffrées, jamais affichées)"
vercel env ls preview
echo

gras "Bilan"
echo "  ${#POUSSEES[@]} variables poussées."
if [ "${#DEPUIS_PARTAGE[@]}" -gt 0 ]; then
  echo
  echo "  ⓘ Absentes de .env.local, reprises de $ENV_PARTAGE :"
  printf '      %s\n' "${DEPUIS_PARTAGE[@]}"
fi
if [ "${#MANQUANTES[@]}" -gt 0 ]; then
  echo
  rouge "  ⚠ INTROUVABLES dans les deux fichiers — à poser à la main :"
  printf '      %s\n' "${MANQUANTES[@]}"
  echo
  echo "    Ce que chacune coûte si elle reste absente :"
  echo "      WEASYPRINT_URL  — un gabarit rendu par WeasyPrint échouera à la"
  echo "                        régénération avec ancres, et rien ne partira."
  echo "      MAIL_REPLY_TO   — « Répondez simplement à ce message » devient FAUX :"
  echo "                        les réponses partiront vers MAIL_FROM, qui doit"
  echo "                        alors être une boîte réellement lue."
  echo
  echo "    Pour en poser une :  printf '%s' 'la-valeur' | vercel env add NOM preview"
fi
echo
gras "Ensuite"
echo "  1. Deployment Protection → Protection Bypass for Automation → Generate Secret"
echo "  2. URL du webhook DocuSeal = alias de branche + ?x-vercel-protection-bypass=<ce secret>"
echo "     (l'alias se LIT :  vercel inspect <url-du-dernier-deploiement>)"
echo "  3. Migrations sur la base d'aperçu, puis redéploiement."
echo "  → tout est détaillé dans .planning/specs/evidence/signature-C3/RECETTE.md"

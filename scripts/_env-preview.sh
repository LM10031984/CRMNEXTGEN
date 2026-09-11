#!/usr/bin/env bash
#
# Prépare l'environnement PREVIEW du projet Vercel `qualiof` pour la recette
# d'acceptation du lot C.3 (`.planning/specs/evidence/signature-C3/RECETTE.md`).
#
#   bash scripts/_env-preview.sh
#
# ── ON NE CROIT PLUS LE CODE RETOUR : ON RELIT ──────────────────────────────
#
# Tentative du 11/09/2026 : le script a annoncé « 28 poussées · 0 en échec », et
# `vercel env ls preview` n'en montrait AUCUNE. Les `add` rendaient 0 et
# affichaient « ✓ Added » sans que rien ne soit écrit.
#
# ⚠ LA CAUSE N'EST PAS ÉTABLIE. Reproduction tentée trois fois — commande seule,
# séquence `rm` puis `add`, et fonction identique dans un script avec les mêmes
# `set` : les trois ONT écrit. Ne pouvant pas nommer le défaut, on cesse de faire
# confiance au canal qui a menti : après CHAQUE écriture, le script relit
# `vercel env ls preview` et ne compte « poussée » que si le nom y FIGURE
# VRAIMENT. Une tentative est retentée une fois, puis déclarée en échec.
#
# C'est plus lent (un appel de relecture par variable) et c'est le prix d'un
# bilan qui décrit l'état réel plutôt que ses propres intentions.
#
# ── REJOUABLE ───────────────────────────────────────────────────────────────
#
# La première version s'est arrêtée en cours de route et a laissé l'aperçu dans
# un état PIRE qu'avant : `MAIL_DRY_RUN` retirée et jamais reposée. Deux causes,
# corrigées ici :
#
#  1. **Les erreurs de `vercel env add` étaient masquées** (`2>&1 >/dev/null`),
#     donc le message qui aurait tout expliqué n'a jamais été lu. Elles sont
#     maintenant CAPTURÉES et AFFICHÉES.
#  2. **Un seul échec tuait le script** (`set -e`), laissant les variables
#     suivantes non posées et la précédente retirée. Chaque variable est
#     désormais indépendante : un échec est compté, nommé, et on continue.
#
# Conséquence : le script peut être relancé autant de fois que nécessaire. Pour
# chaque variable, `rm` (l'absence n'est pas une erreur) puis `add` — et le `rm`
# de `MAIL_DRY_RUN` est collé à son `add`, jamais fait « pour plus tard ».
#
# ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
#
#  · Il ne touche JAMAIS `DATABASE_URL`, `DIRECT_URL` ni `AUTH_SECRET` en
#    Preview. Elles pointent la base d'APERÇU (`oodxvrzpxdrggzyurlwl`, pooler
#    `aws-1`) — vérifié le 11/09/2026. Les réécrire risquerait d'y mettre la
#    production.
#  · Il ne lit JAMAIS `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` des fichiers
#    `.env` : celles-là pointent la PRODUCTION. Saisie à la main, et REFUS de la
#    référence de production.
#  · Il ne redemande pas `DOCUSEAL_API_KEY` si elle est déjà posée.
#  · Il n'écrit rien en scope `production` ni `development`.
#
# ── `printf`, PAS `echo` ────────────────────────────────────────────────────
#
# `echo "$v" | vercel env add …` ajoute un SAUT DE LIGNE à la valeur. Sur
# `SMTP_PASS` ou une clé d'API, ce caractère invisible fait échouer
# l'authentification sans un message qui le dise.
#
set -uo pipefail   # PAS -e : un échec isolé ne doit pas laisser l'aperçu à moitié posé.

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="$ICI/../files/.env.local"
ENV_PARTAGE="$ICI/../files/.env"

REF_PROD="gntlqyscahbgjrmsbzil"
REF_APERCU="oodxvrzpxdrggzyurlwl"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
gras()  { printf '\033[1m%s\033[0m\n' "$*"; }

command -v vercel >/dev/null || { rouge "⛔ La CLI vercel est introuvable."; exit 1; }
command -v openssl >/dev/null || { rouge "⛔ openssl est introuvable."; exit 1; }
[ -f "$ICI/.vercel/project.json" ] || {
  rouge "⛔ Projet Vercel non lié depuis $ICI."
  echo "   Lancer d'abord :  vercel link --yes --project qualiof"
  exit 1
}
[ -f "$ENV_PARTAGE" ] || { rouge "⛔ Introuvable : $ENV_PARTAGE"; exit 1; }

gras "Préparation du scope PREVIEW — projet qualiof (rejouable)"
echo "  source n°1 : $ENV_LOCAL"
echo "  source n°2 : $ENV_PARTAGE  (uniquement pour ce que la n°1 ne porte pas)"
echo

# ── Lecture d'un .env SANS l'exécuter ───────────────────────────────────────
# On ne « source » pas : un `$(…)` dans une valeur s'exécuterait.
lire_var() {
  local fichier="$1" nom="$2" ligne valeur
  [ -f "$fichier" ] || return 1
  ligne="$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?${nom}=" "$fichier" 2>/dev/null)"
  [ -n "$ligne" ] || return 1
  valeur="${ligne#*=}"
  valeur="${valeur%\"}"; valeur="${valeur#\"}"
  valeur="${valeur%\'}"; valeur="${valeur#\'}"
  [ -n "$valeur" ] || return 1
  printf '%s' "$valeur"
}

POUSSEES=(); MANQUANTES=(); DEPUIS_PARTAGE=(); ECHECS=(); IGNOREES=()
DERNIERE_SORTIE=""

# L'inventaire des variables DÉJÀ posées.
#
# Relu UNE SEULE FOIS, avant la première écriture — et c'est volontaire : il ne
# sert qu'à la section 4, qui interroge `DOCUSEAL_API_KEY` et les deux
# `SUPABASE_*`. Aucune des sections 1 à 3 n'y touche, donc l'inventaire reste
# juste pour ce qu'on lui demande. Le rafraîchir entre-temps coûterait un appel
# réseau par variable pour aucune réponse différente.
INVENTAIRE=""
rafraichir_inventaire() {
  INVENTAIRE="$(vercel env ls preview 2>/dev/null | awk '{print $1}')"
}
existe_deja() {
  printf '%s\n' "$INVENTAIRE" | grep -qx "$1"
}

# Le nom figure-t-il VRAIMENT dans le scope preview, maintenant ?
#
# Relecture fraîche à chaque appel : c'est tout l'intérêt. Un inventaire mis en
# cache reproduirait exactement le défaut qu'on cherche à attraper.
est_pose() {
  vercel env ls preview 2>/dev/null | awk '{print $1}' | grep -qx "$1"
}

# Une tentative d'écriture : `rm` puis `add`. Rend 0 si le nom est ENSUITE
# présent — pas si la commande a dit qu'elle avait réussi.
tenter_ecriture() {
  local nom="$1" valeur="$2"
  # `rm` d'abord : `vercel env add` refuse un nom déjà présent, et c'est ce qui
  # rend le script rejouable. L'absence n'est pas une erreur.
  vercel env rm "$nom" preview --yes >/dev/null 2>&1 || true
  DERNIERE_SORTIE="$(printf '%s' "$valeur" | vercel env add "$nom" preview 2>&1)"
  est_pose "$nom"
}

# Pousse UNE variable, VÉRIFIE, retente une fois, et n'abandonne jamais le reste.
pousser() {
  local nom="$1" valeur="$2"
  DERNIERE_SORTIE=""

  if tenter_ecriture "$nom" "$valeur"; then
    POUSSEES+=("$nom"); vert "  ✓ $nom"; return 0
  fi

  rouge "  ↻ $nom — annoncée écrite mais ABSENTE à la relecture. Seconde tentative…"
  sleep 1
  if tenter_ecriture "$nom" "$valeur"; then
    POUSSEES+=("$nom"); vert "  ✓ $nom (à la seconde tentative)"; return 0
  fi

  ECHECS+=("$nom")
  rouge "  ✗ $nom — TOUJOURS absente après deux tentatives."
  rouge "      Ce que vercel a répondu la dernière fois :"
  printf '      %s\n' "$DERNIERE_SORTIE" | grep -vE '^[[:space:]]*$' | head -6
  return 1
}

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

rafraichir_inventaire

# ── 1. Rendu PDF, SMTP, cron, identité de l'organisme ───────────────────────
#
# ⚠ `WEASYPRINT_URL` a été RETIRÉE de cette liste le 11/09/2026 : la production
# n'en porte pas non plus. Le rendu passe par Gotenberg ; réclamer une variable
# que personne ne pose ne produisait qu'un faux manque dans le bilan.

gras "1. Valeurs reprises des fichiers .env"
for nom in \
  GOTENBERG_URL \
  SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS \
  MAIL_FROM \
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
# Absente des deux fichiers .env : posée en dur, sur décision du 11/09/2026.
# Sans elle, « Répondez simplement à ce message » (gabarits C.2c) est FAUX.
pousser MAIL_REPLY_TO      "formation@start-academy.fr"

# ⚠ DÉROGATION CONSCIENTE à la règle du 10/09/2026 (« l'aperçu n'envoie jamais
# de vrais emails »). Le `rm` est DANS `pousser`, collé à son `add` : c'est ce
# qui empêche de la laisser retirée si la suite échoue.
pousser MAIL_DRY_RUN       "false"
if printf '%s\n' "${ECHECS[@]:-}" | grep -qx "MAIL_DRY_RUN"; then
  rouge "  ⛔ MAIL_DRY_RUN a été RETIRÉE et n'a pas pu être reposée."
  rouge "     À reposer À LA MAIN sans attendre :"
  echo  "       printf '%s' 'true' | vercel env add MAIL_DRY_RUN preview"
else
  rouge "  ⚠ MAIL_DRY_RUN=false : l'aperçu enverra de VRAIS emails."
  rouge "    À remettre à true dès la recette terminée."
fi
echo

# ── 3. Le secret de webhook ─────────────────────────────────────────────────

gras "3. Secret de webhook DocuSeal"
WEBHOOK_SECRET="$(openssl rand -hex 32)"
pousser DOCUSEAL_WEBHOOK_SECRET "$WEBHOOK_SECRET"
echo
gras "  ┌─ À RECOPIER DANS DOCUSEAL (Settings → Webhooks → Secret) ─────────┐"
echo   "    $WEBHOOK_SECRET"
gras "  └────────────────────────────────────────────────────────────────────┘"
echo "  Il ne sera plus jamais affiché : Vercel le chiffre."
echo "  ⚠ Rejouer ce script en GÉNÈRE UN NOUVEAU : il faudra le recopier à"
echo "    nouveau dans DocuSeal, sinon les webhooks seront rejetés."
echo

# ── 4. Les valeurs saisies à la main ────────────────────────────────────────
#
# Elles ne transitent par aucun fichier lu par un agent : saisie masquée,
# variables locales, `unset` juste après.

gras "4. Saisie manuelle — ces valeurs ne sont lues nulle part"

if existe_deja "DOCUSEAL_API_KEY"; then
  IGNOREES+=("DOCUSEAL_API_KEY")
  vert "  ↷ DOCUSEAL_API_KEY déjà posée — laissée telle quelle, rien n'est redemandé."
else
  printf '  DOCUSEAL_API_KEY (saisie masquée) : '
  read -rs DOCUSEAL_API_KEY; echo
  if [ -z "$DOCUSEAL_API_KEY" ]; then
    ECHECS+=("DOCUSEAL_API_KEY")
    rouge "  ✗ DOCUSEAL_API_KEY — saisie vide, non posée."
  else
    pousser DOCUSEAL_API_KEY "$DOCUSEAL_API_KEY"
  fi
  unset DOCUSEAL_API_KEY
fi

if existe_deja "SUPABASE_URL" && existe_deja "SUPABASE_SERVICE_ROLE_KEY"; then
  IGNOREES+=("SUPABASE_URL" "SUPABASE_SERVICE_ROLE_KEY")
  vert "  ↷ SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY déjà posées — rien n'est redemandé."
else
  echo
  echo "  ⚠ Les DEUX suivantes viennent du projet Supabase d'APERÇU"
  echo "    (ref attendue : $REF_APERCU), JAMAIS de la production."
  printf '  SUPABASE_URL de l’aperçu : '
  read -r SUPABASE_URL
  CONTINUER="oui"
  case "$SUPABASE_URL" in
    *"$REF_PROD"*)
      rouge "  ⛔ C'est la référence de PRODUCTION ($REF_PROD). Non posée."
      ECHECS+=("SUPABASE_URL"); CONTINUER="non" ;;
    *"$REF_APERCU"*)
      vert "  ✓ référence d'aperçu reconnue" ;;
    "")
      rouge "  ⛔ Vide. Non posée."
      ECHECS+=("SUPABASE_URL"); CONTINUER="non" ;;
    *)
      rouge "  ⚠ Référence inconnue — ni l'aperçu, ni la production."
      printf '  Continuer quand même ? (tapez OUI) : '
      read -r reponse
      [ "$reponse" = "OUI" ] || { rouge "  ⛔ Interrompu pour ces deux variables."; ECHECS+=("SUPABASE_URL"); CONTINUER="non"; } ;;
  esac

  if [ "$CONTINUER" = "oui" ]; then
    # ⚠ NORMALISATION — saisie le 11/09/2026 avec « /rest/v1/ » à la fin.
    # `@supabase/supabase-js` compose lui-même ses chemins : une URL qui porte
    # déjà `/rest/v1/` produit `/rest/v1/rest/v1/…` et des 404 sur CHAQUE appel
    # de stockage, donc un PDF signé qui ne s'écrit jamais. On ne garde que le
    # schéma et l'hôte.
    SUPABASE_RACINE="$(printf '%s' "$SUPABASE_URL" | sed -E 's#^(https?://[^/]+).*#\1#')"
    if [ "$SUPABASE_RACINE" != "$SUPABASE_URL" ]; then
      echo "  ⓘ URL normalisée : tout ce qui suivait l'hôte a été retiré."
      echo "     → $SUPABASE_RACINE"
    fi
    pousser SUPABASE_URL "$SUPABASE_RACINE"
    printf '  SUPABASE_SERVICE_ROLE_KEY de l’aperçu (saisie masquée) : '
    read -rs SUPABASE_SERVICE_ROLE_KEY; echo
    if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
      ECHECS+=("SUPABASE_SERVICE_ROLE_KEY")
      rouge "  ✗ SUPABASE_SERVICE_ROLE_KEY — saisie vide, non posée."
    else
      pousser SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
    fi
    unset SUPABASE_SERVICE_ROLE_KEY
  fi
  unset SUPABASE_URL SUPABASE_RACINE
fi
echo

# ── 5. Bilan ────────────────────────────────────────────────────────────────

gras "5. Ce qui est en scope preview (valeurs chiffrées, jamais affichées)"
vercel env ls preview
echo

# Le compte réel, relu une dernière fois — indépendant de ce que le script
# croit avoir fait.
REELLES="$(vercel env ls preview 2>/dev/null | grep -cE 'Encrypted|Sensitive' || true)"
echo "  → $REELLES variables réellement présentes en scope preview."
echo

gras "Bilan"
echo "  ${#POUSSEES[@]} poussées · ${#IGNOREES[@]} déjà là · ${#ECHECS[@]} en échec · ${#MANQUANTES[@]} introuvables"

if [ "${#DEPUIS_PARTAGE[@]}" -gt 0 ]; then
  echo
  echo "  ⓘ Absentes de .env.local, reprises de $ENV_PARTAGE :"
  printf '      %s\n' "${DEPUIS_PARTAGE[@]}"
fi
if [ "${#MANQUANTES[@]}" -gt 0 ]; then
  echo
  rouge "  ⚠ INTROUVABLES dans les deux fichiers — à poser à la main :"
  printf '      %s\n' "${MANQUANTES[@]}"
  echo "    Pour en poser une :  printf '%s' 'la-valeur' | vercel env add NOM preview"
fi
if [ "${#ECHECS[@]}" -gt 0 ]; then
  echo
  rouge "  ⛔ EN ÉCHEC — le message de vercel est affiché plus haut, à sa ligne :"
  printf '      %s\n' "${ECHECS[@]}"
  echo
  echo "    Le script est REJOUABLE : corriger la cause puis le relancer."
  echo "    ⚠ Une relance regénère DOCUSEAL_WEBHOOK_SECRET — à recopier dans DocuSeal."
  exit 1
fi

echo
gras "Ensuite"
echo "  1. Deployment Protection → Protection Bypass for Automation → Generate Secret"
echo "  2. URL du webhook DocuSeal = alias de branche + ?x-vercel-protection-bypass=<ce secret>"
echo "     (l'alias se LIT :  vercel inspect <url-du-dernier-deploiement>)"
echo "  3. Migrations sur la base d'aperçu, puis redéploiement."
echo "  → tout est détaillé dans .planning/specs/evidence/signature-C3/RECETTE.md"

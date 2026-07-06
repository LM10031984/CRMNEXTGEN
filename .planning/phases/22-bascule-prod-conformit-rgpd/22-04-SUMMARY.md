---
phase: 22-bascule-prod-conformit-rgpd
plan: 04
subsystem: infra
tags: [vercel, env-vars, dotenv, prisma, invoice-reminders, audit-log, dry-run, bytestring]

# Dependency graph
requires:
  - phase: 21-app-vercel-filet-ci-tests
    provides: "Projet Vercel qualiof lié (50 vars posées en 21-04), fix immédiat D-18 ① post-PROD-0674"
  - phase: 20-worker-3-h-te-doc-engines
    provides: "Cron relances Railway (worker.ts croner quotidien 8h) + core neutre invoice-reminder-core.ts"
provides:
  - "apps/web/scripts/sanity-check-env.ts — scan dotenv réutilisable (runbook §1, re-poses 22-06)"
  - "22-ENV-SANITY.md — état des lieux daté : Vercel prod PROPRE (OPENROUTER_API_KEY confirmée saine), 5 commentaires inline classe PROD-0674 dans le .env racine"
  - "apps/web/scripts/pending-reminders-report.ts — réplique lecture seule de la sélection du cron + inventaire AuditLog dryRun (re-jouable avant le flip)"
  - "22-PENDING-SENDS-REPORT.md — VERDICT D-06 : 0 envoi en attente, 0 relance brûlée (Pitfall 1 NON matérialisé), 3 factures éligibles au 2026-07-20"
affects: [22-06, 22-07, runbook-bascule, mail-dry-run-flip]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sanity env : valeur BRUTE testée /[^\\x20-\\x7E]|#| +$/ — jamais de valeur affichée, seulement clé + index + codepoint"
    - "Rapport pré-flip : réplication EXACTE des filtres du worker (constante importée, pas redéclarée) + contre-vérification anti-artefact du filtre Json"

key-files:
  created:
    - apps/web/scripts/sanity-check-env.ts
    - apps/web/scripts/pending-reminders-report.ts
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-ENV-SANITY.md
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-PENDING-SENDS-REPORT.md
  modified: []

key-decisions:
  - "OF_ADDRESS_STREET (U+00E9 « é ») = faux positif métier assumé : accent d'adresse légitime, jamais dans un header HTTP — conserver telle quelle (runbook §1)"
  - ".gitignore non modifié : .env.vercel-prod déjà couvert par le catch-all .env* existant (git check-ignore exit 0)"
  - "Pitfall 1 tranché par les données : 0 relance brûlée (0 AuditLog reminder_sent TOTAL, 0 reminderCount>0) — le checkpoint 22-07 n'a PAS de reset de compteurs à arbitrer, seulement la fenêtre du flip vs éligibilité du 2026-07-20"
  - "CUT-01/CUT-02 NON marqués complets : ce plan est un outillage préparatoire Wave 1 — la preuve de bascule appartient aux plans 22-06/22-07 (précédent projet : 20-04, 21-02)"

patterns-established:
  - "Toute re-pose d'env (Vercel/Railway) = parse dotenv (valeur nettoyée) + sanity-check-env.ts post-pose — jamais de copie de ligne brute"
  - "Avant tout flip de sortie externe : re-jouer pending-reminders-report.ts le jour J (le résultat est daté, l'éligibilité avance chaque jour)"

requirements-completed: []  # CUT-01/CUT-02 volontairement NON marqués — plan préparatoire, bascule prouvée en 22-06/22-07

# Metrics
duration: 11min
completed: 2026-07-06
---

# Phase 22 Plan 04: Pré-vérification des sorties — sanity env + rapport relances Summary

**Scan env Vercel prod PROPRE (fix PROD-0674 confirmé par preuve, 5 pollutions inline restantes côté .env racine source) + verdict D-06 : 0 relance en attente et 0 relance brûlée en dry-run — 3 factures deviennent éligibles le 2026-07-20**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-06T20:23:35Z
- **Completed:** 2026-07-06T20:34:30Z
- **Tasks:** 2
- **Files modified:** 4 (2 scripts + 2 rapports)

## Accomplishments

- **Sanity check env opérationnel (D-18 ②)** : `sanity-check-env.ts` scanne un fichier dotenv avec la regex `/[^\x20-\x7E]|#| +$/` et n'affiche JAMAIS une valeur (clé + index + codepoint seulement). Scan du pull Vercel production (71 vars) : **OPENROUTER_API_KEY et les 49 autres vars 21-04 sont PROPRES** — le nettoyage D-18 ① post-PROD-0674 est confirmé par preuve de scan. Seul flag : `OF_ADDRESS_STREET` (é d'« Inférieur », accent métier légitime, hors header HTTP).
- **Source des re-poses cartographiée** : le `.env` racine porte encore **5 commentaires inline classe PROD-0674** (`SESSION_LIFETIME`, `OPENROUTER_MODEL_FAST/QUALITY/VISION`, `OPENROUTER_SITE_URL`) — correction déléguée au runbook §1 (plan 22-06), aucune mutation d'env prod en Wave 1. `.env.vercel-prod` supprimé après scan, couvert par `.gitignore` (`.env*`).
- **Rapport des envois en attente (D-06 / Pitfall 1)** : `pending-reminders-report.ts` réplique EXACTEMENT la sélection du cron Railway (`REMINDER_START_DATE` **importée** du worker, status IN, OR échéance, dedup 24 h, `reminderCount < maxLevel`) + cascade destinataire du core (`emailBilling ?? email ?? person.email`) avec **flag ⚠ APPRENANT** (règle payeur). Lecture seule stricte (100 % SELECT, vérifié dans les logs de requêtes Prisma).
- **Pitfall 1 tranché par les données : les relances brûlées N'EXISTENT PAS.** 0 AuditLog `invoices.reminder_sent` au TOTAL (tous dryRun confondus), 0 facture avec `reminderCount > 0` — contre-vérification intégrée au rapport pour prouver que le zéro n'est pas un artefact du filtre Prisma Json. Le cron dry-run tourne depuis la Phase 20 mais aucune facture n'a encore franchi le 1er seuil d'échéance (30 j).
- **Horizon D-06 pour le checkpoint 22-07** : FAC-000006 (AKORIMMO, 1 440 €), FAC-000007 (Imagimmo, 1 008 €), FAC-000008 (KING Kristin, 1 008 €) deviennent éligibles au cron **le 2026-07-20** — si le flip `MAIL_DRY_RUN=false` a lieu avant, la première relance réelle niveau 1 partira ce jour-là à 8 h.

## Task Commits

Each task was committed atomically:

1. **Task 1: Script sanity-check-env.ts + scans Vercel prod et .env racine** - `04de274` (feat)
2. **Task 2: Script pending-reminders-report.ts + rapport envois en attente / relances brûlées** - `88161f9` (feat)

## Files Created/Modified

- `apps/web/scripts/sanity-check-env.ts` - Scan dotenv : valeurs polluées (non-ASCII/#/espaces de fin), sortie clé+index+codepoint sans jamais afficher la valeur, exit 1 si pollution
- `apps/web/scripts/pending-reminders-report.ts` - Réplique lecture seule de la sélection du cron relances + inventaire AuditLog dryRun + horizon d'éligibilité, écrit le rapport markdown
- `.planning/phases/22-bascule-prod-conformit-rgpd/22-ENV-SANITY.md` - Rapport daté des 2 scans (Vercel pull + .env racine) + note Pitfall 2 (vars sensitive/absentes du pull : SMTP_*, CRON_SECRET)
- `.planning/phases/22-bascule-prod-conformit-rgpd/22-PENDING-SENDS-REPORT.md` - Verdict D-06 : tableaux A (0 envoi) + horizon (3 factures au 2026-07-20) + B (0 brûlée, contre-vérifié) + section « Décision requise » 3 options pour 22-07

## Decisions Made

- **OF_ADDRESS_STREET conservée telle quelle** : le U+00E9 est l'accent légitime de l'adresse du siège (documents Qualiopi), jamais utilisé dans un header HTTP — pas de risque ByteString.
- **.gitignore non modifié** : `git check-ignore .env.vercel-prod` exit 0 via le catch-all `.env*` déjà présent (ligne 74) — la vérification prévue au plan a montré que l'ajout était inutile.
- **CUT-01/CUT-02 non marqués complets** : plan d'outillage préparatoire (Wave 1) — précédent projet 20-04/21-02 (les requirements se prouvent à la bascule réelle, plans 22-06/22-07).
- **Le run du rapport est daté et re-jouable** : l'éligibilité avançant chaque jour, le rapport DOIT être re-généré le jour du flip (commande consignée dans le rapport).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Contre-vérification anti-artefact du filtre Json**
- **Found during:** Task 2 (résultat 0/0 inattendu vs mémoire « reminderCount brûlés »)
- **Issue:** Un résultat « 0 relance brûlée » pouvait être un faux négatif du filtre Prisma `diff: { path: ['dryRun'], equals: true }` — inacceptable pour un rapport qui conditionne un flip d'envoi de masse.
- **Fix:** Probe lecture seule indépendante (count TOTAL des AuditLog `invoices.reminder_sent` + count `reminderCount > 0`) confirmant le zéro réel, puis contre-vérification intégrée en dur dans le script/rapport.
- **Files modified:** apps/web/scripts/pending-reminders-report.ts
- **Verification:** Rapport affiche « 0 AuditLog au TOTAL, 0 facture avec reminderCount > 0 »
- **Committed in:** 88161f9 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Section « Horizon — prochaines éligibilités » ajoutée au rapport**
- **Found during:** Task 2 (tableau A vide)
- **Issue:** Un tableau A vide sans explication ne permettait pas à Laurent de « décider en connaissance » (D-06) — le zéro est temporel (aucune facture n'a encore 30 j de retard), pas structurel.
- **Fix:** Le script liste les factures ISSUED/PARTIAL/OVERDUE émises depuis REMINDER_START_DATE avec leur date d'éligibilité au cron (échéance + reminderDays[0]) — condition d'échéance appliquée en JS avec sémantique STRICTEMENT identique au OR du worker.
- **Files modified:** apps/web/scripts/pending-reminders-report.ts
- **Verification:** Rapport liste FAC-000006/007/008 éligibles au 2026-07-20
- **Committed in:** 88161f9 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Les deux ajouts renforcent la fiabilité du rapport D-06 sans changer son périmètre. Aucun scope creep, zéro mutation.

## Issues Encountered

- `pnpm tsx` inexécutable depuis la racine du monorepo (tsx non hoisté) — les commandes de vérification du plan ont été exécutées depuis `apps/web` (convention projet, cf. scripts package.json). Les usages consignés dans les rapports pointent la forme qui marche.

## Authentication Gates

None — le CLI Vercel était déjà authentifié et le projet `qualiof` lié à la racine (`.vercel/project.json`), le pull production est passé du premier coup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Runbook §1 (22-06)** : outillage sanity env prêt + liste exacte des 5 lignes du `.env` racine à nettoyer avant toute re-pose ; protocole re-pose = parse dotenv + scan post-pose.
- **Checkpoint 22-07 (flip MAIL_DRY_RUN)** : décision simplifiée — pas de reset de compteurs à arbitrer (0 brûlée) ; la seule variable est la DATE du flip vs l'éligibilité du 2026-07-20 (3 relances niveau 1, payeurs AKORIMMO / Imagimmo / KING Kristin, aucun flag APPRENANT à ce jour). **Re-jouer le rapport le jour J.**
- Aucun blocage pour les autres plans de la Wave 1.

## Self-Check: PASSED

- 4 fichiers créés vérifiés sur disque (2 scripts + 2 rapports) + SUMMARY
- Commits `04de274` et `88161f9` présents dans l'historique
- `.env.vercel-prod` absent du disque, couvert par `.gitignore`

---
*Phase: 22-bascule-prod-conformit-rgpd*
*Completed: 2026-07-06*

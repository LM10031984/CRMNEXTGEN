---
phase: 21-app-vercel-filet-ci-tests
plan: 02
subsystem: infra
tags: [supabase-storage, minio, migration, backfill, audit, tsx]

# Dependency graph
requires:
  - phase: 18-supabase-storage-migration-objets-direct-to-storage
    provides: "script idempotent migrate-storage.ts (8 champs / 2 buckets, clients dédiés, DRY/WRITE) + Supabase Storage actif (STORAGE_PROVIDER=supabase)"
  - phase: 19-base-postgres-supabase-pooler-migrations-baselin-es
    provides: "base CLOUD Supabase câblée dans .env (pooler :6543) — c'est CETTE base qui référence les 899 clés auditées"
provides:
  - "0 lien mort storage : 899/899 clés référencées en base cloud résolvent à un objet Supabase (preuve datée)"
  - "733 objets backfillés MinIO→Supabase (410 Document.pdfUrl + 322 PedagogicalAsset.pdfUrl + 1 Invoice.pdfUrl)"
  - "Rapport .planning/audit/STORAGE-BACKFILL-REPORT-2026-07-06.md (compteurs avant/WRITE/après, cause racine, MinIO NON purgé)"
  - "Prérequis D-06 satisfait : les vagues de tests staging (21-03..06) ne peuvent plus produire de faux verts storage"
affects: [21-03, 21-04, 21-05, 21-06, phase-22, bascule-prod, TEST-01, TEST-02]

# Tech tracking
tech-stack:
  added: []
  patterns: ["audit d'écart lecture seule (list Supabase paginé + HeadObject MinIO) pour classifier présent/manquant/orphelin — le DRY du script ne vérifie pas la cible"]

key-files:
  created:
    - .planning/audit/STORAGE-BACKFILL-REPORT-2026-07-06.md
  modified:
    - .planning/audit/STORAGE-MIGRATION-REPORT-2026-07-06.md

key-decisions:
  - "Écart mesuré à 733 objets manquants (pas seulement SES-0094) : la base CLOUD référence des clés d'époque jamais migrées le 07-04 (la migration avait couru contre la base LOCALE post-régénérations) — backfill intégral via le script existant, 0 modification de code"
  - "Les 28 « orphelins MinIO » du DRY (docs SES-0094 + TEST-OCR) ne sont PAS des orphelins : présents côté Supabase (upload direct post-bascule) — 0 vrai orphelin, rien à trancher en Phase 22 côté clés en base"
  - "TEST-01/TEST-02 NON marqués complets : ce plan est leur PRÉREQUIS (D-06), les tests eux-mêmes arrivent aux plans suivants"

patterns-established:
  - "Backfill storage : DRY → audit d'écart lecture seule → WRITE=1 → re-audit 0 manquant, rapport daté dans .planning/audit/"

requirements-completed: []  # TEST-01/TEST-02 = prérequis livré ici, complétés par les plans de tests 21-03..06

# Metrics
duration: 35min
completed: 2026-07-06
---

# Phase 21 Plan 02: Audit + backfill storage MinIO→Supabase Summary

**733 objets storage backfillés MinIO→Supabase via migrate-storage.ts (WRITE=1 idempotent) — 899/899 clés de la base cloud résolvent désormais côté Supabase, 0 lien mort prouvé, MinIO intact**

## Performance

- **Duration:** ~35 min (dont ~10 min de WRITE séquentiel vers l'Irlande)
- **Started:** 2026-07-06T08:15:33Z
- **Completed:** 2026-07-06T08:50:00Z
- **Tasks:** 2/2
- **Files modified:** 2 (rapports d'audit uniquement — 0 fichier de code)

## Accomplishments

- **Écart mesuré et chiffré (Task 1, zéro écriture)** : 899 clés référencées par la base CLOUD (893 `qualiof-docs` + 6 `preinscriptions`) ; **166 présentes Supabase / 733 MANQUANTES (MinIO seul) / 0 vrai orphelin / 0 clé invalide**. Le bug SES-0094 n'était que la partie visible : la base cloud (dump antérieur, Phase 19) référence des clés jamais migrées le 07-04 car la migration avait couru contre la base LOCALE (dont les packs avaient été régénérés entre-temps → autres clés).
- **Les 28 « orphelins MinIO » du DRY classifiés** : 27 docs SES-0094 + 1 clé TEST-OCR, tous créés APRÈS la bascule `STORAGE_PROVIDER=supabase` → uploadés directement dans Supabase, jamais passés par MinIO. Présence côté Supabase prouvée un par un — **0 orphelin des deux stores**.
- **Backfill WRITE (Task 2)** : `WRITE=1`, exit 0 — **871 objets copiés** (866 docs + 5 preinscriptions, upsert idempotent, strictement séquentiel), `verifyExists` sur la cible = **0 lien mort**.
- **Convergence prouvée** : re-audit lecture seule post-WRITE = **899/899 présents, 0 manquant, 0 orphelin**. Un second WRITE ne changerait rien (upsert).
- **Rapport daté** `.planning/audit/STORAGE-BACKFILL-REPORT-2026-07-06.md` : contexte SES-0094/D-06, cause racine, compteurs avant/WRITE/après, ventilation par table/champ/session, phrase de preuve littérale « 0 lien mort — chaque clé référencée en base résout à un objet Supabase », mention « MinIO NON purgé (destructif = étape séparée, Phase 22+) ».

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit DRY — mesurer l'écart MinIO/Supabase** - `2d36ac8` (chore) — rapport DRY daté généré par le script
2. **Task 2: Backfill WRITE + preuve 0 lien mort + rapport daté** - `b757031` (feat) — rapport backfill + rapport WRITE du script

## Files Created/Modified

- `.planning/audit/STORAGE-BACKFILL-REPORT-2026-07-06.md` - Rapport de backfill complet (compteurs avant/WRITE/après, preuve 0 lien mort, MinIO non purgé)
- `.planning/audit/STORAGE-MIGRATION-REPORT-2026-07-06.md` - Rapport auto-généré par migrate-storage.ts (version finale = mode WRITE, 871 migrés, 0 lien mort)

## Decisions Made

- **Compteurs « présents / manquants / orphelins » mesurés par un audit d'écart complémentaire lecture seule** : le mode DRY de `migrate-storage.ts` compte les objets lisibles depuis MinIO mais ne vérifie structurellement PAS la présence côté Supabase (les compteurs attendus par le plan n'existent pas dans sa sortie). Script temporaire `_gap-audit-21-02.ts` (réutilise `collectAllKeys` exporté, `list` Supabase paginé avec cache par préfixe + `HeadObject` MinIO, aucune écriture), exécuté AVANT et APRÈS le WRITE, puis **supprimé** (non commité). `migrate-storage.ts` lui-même : **0 modification**, comme exigé par le plan.
- **TEST-01/TEST-02 non marqués complets dans REQUIREMENTS.md** : ce plan livre leur prérequis dur (D-06), pas les tests — même logique que WORK-01/03 au plan 20-04.
- Reste : plan suivi tel qu'écrit (WRITE additif, orphelins listés sans action, MinIO jamais purgé).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Le DRY du script ne fournit pas les compteurs « présents Supabase / manquants » exigés par le plan**
- **Found during:** Task 1 (audit DRY)
- **Issue:** Le plan demande de capturer « déjà présentes côté Supabase / MANQUANTES / orphelines des deux stores », mais `migrate-storage.ts` en DRY ne vérifie que MinIO (simulés + orphelins MinIO). Impossible de mesurer l'écart réel ni de classifier les 28 « orphelins » sans interroger Supabase.
- **Fix:** Audit d'écart temporaire en lecture seule stricte (`apps/web/scripts/_gap-audit-21-02.ts`, supprimé après usage) — aucune modification du script de migration.
- **Files modified:** aucun (script temporaire non commité)
- **Verification:** avant = 166/733/0, après = 899/0/0 ; cohérent avec le RÉCAP WRITE du script (871 migrés, 0 lien mort)
- **Committed in:** n/a (sorties consignées dans le rapport commité `b757031`)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Nécessaire pour produire les compteurs exigés par le plan et prouver la convergence. Aucun code applicatif touché, aucun scope creep.

## Issues Encountered

- **Écart 40× plus large qu'attendu** : le plan anticipait « objets créés en local depuis le 2026-07-04 » (échelle SES-0094, ~30 docs) ; l'audit a révélé **733 manquants** couvrant 15+ sessions (SES-0050 : 170, SES-0043 : 103, SES-0093 : 76, SES-0010 : 66…) et des documents hors closure (conventions : 94, agefice : 34, convocations : 21…). Cause racine : désalignement base-cloud-restaurée vs migration-du-07-04-contre-base-locale. Le remède du plan (backfill WRITE idempotent) couvrait exactement ce cas → exécuté tel quel, résolu intégralement.
- Baseline 07-04 = 3109 clés (base locale) vs 899 clés (base cloud) : la base cloud est un snapshot antérieur — attendu (le dump FINAL de bascule prod arrive en fin de milestone v6), consigné dans le rapport.

## User Setup Required

None - no external service configuration required. (MinIO local démarré via `docker compose up -d minio`, Supabase atteint avec les clés `.env` posées en Phase 18.)

## Next Phase Readiness

- **D-06 verrouillée** : les vagues de tests staging (plans 21-03..06, TEST-01/TEST-02) peuvent démarrer — tout document référencé par la base cloud est réellement lisible sous `STORAGE_PROVIDER=supabase`, plus de faux verts storage possibles.
- **MinIO NON purgé** : les 3109 objets d'origine + tout l'historique restent dans MinIO local. Purge = décision destructive séparée, Phase 22+.
- ⚠ Rappel pour la bascule prod (fin v6) : au dump final, re-jouer ce même couple audit DRY → WRITE → re-audit contre la base fraîchement dumpée (les clés référencées changeront).

## Self-Check: PASSED

- FOUND: `.planning/audit/STORAGE-BACKFILL-REPORT-2026-07-06.md`
- FOUND: `.planning/audit/STORAGE-MIGRATION-REPORT-2026-07-06.md`
- FOUND: commits `2d36ac8`, `b757031`
- Script temporaire `_gap-audit-21-02.ts` supprimé, `migrate-storage.ts` intact (0 diff)

---
*Phase: 21-app-vercel-filet-ci-tests*
*Completed: 2026-07-06*

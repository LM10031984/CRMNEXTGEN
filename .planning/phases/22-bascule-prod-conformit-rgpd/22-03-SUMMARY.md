---
phase: 22-bascule-prod-conformit-rgpd
plan: 03
subsystem: database
tags: [prisma, postgres, supabase, audit, storage, data-migration, cutover]

# Dependency graph
requires:
  - phase: 19-base-postgres-supabase-pooler-migrations-baselin-es
    provides: base cloud Supabase vivante (pooler 6543 + baseline 0_init)
  - phase: 21-app-vercel-filet-ci-tests
    provides: backfill storage 21-02 (baseline 899→902 clés, méthode audit d'écart) + collectAllKeys exporté
provides:
  - "D-01 PROUVÉ et DÉCLARÉ : cloud Supabase (gntlqyscahbgjrmsbzil, eu-west-1) = UNIQUE SOURCE DE VÉRITÉ, local figé/obsolète (purge 22-10)"
  - "D-02 PROUVÉ : 0 lien mort storage sur l'état FINAL (903/903 clés résolvent Supabase), pack témoin SES-0094 sans faux verts possibles"
  - "SES-0101 (session réelle 27/07/2026, 11 inscrits) + 1414 lignes métier reportées local→cloud (dont 1349 mappings idempotence Google Calendar)"
  - "Scripts réutilisables : audit-data-gap.ts (verdict machine-checkable) + report-data-gap.ts (report sélectif DRY/WRITE insert-only)"
affects: [22-04, 22-05, 22-06, 22-07, 22-08, 22-09, 22-10, runbook-bascule, pack-temoin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Audit d'écart 2 bases : 2 PrismaClient à URL explicite (datasources.db.url) + introspection information_schema + count(*) exact — jamais reltuples"
    - "Report inter-bases insert-only : upsert par id avec update vide = no-op si existe (cloud garde raison sur l'existant), ordre FK-safe, séquentiel"
    - "Résidu assumé borné dans le temps : waiver par table + date limite — toute écriture locale plus récente refait FAIL"

key-files:
  created:
    - apps/web/scripts/audit-data-gap.ts
    - apps/web/scripts/report-data-gap.ts
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-DATA-GAP-AUDIT.md
    - .planning/audit/STORAGE-REAUDIT-FINAL.md
  modified: []

key-decisions:
  - "Décision Laurent 2026-07-07 (option 1) : report sélectif local→cloud des données métier 16/06→03/07 (1414 lignes) — PAS de re-restore, PAS d'abandon"
  - "Artefacts de génération (Document/Closure*/AIGenerationJob/PedagogicalAsset des 68 sessions) NON reportés : versions 16/06 assumées côté cloud, regénérables à la demande"
  - "Résidu assumé : artefacts SES-0093 du 04/07 + touch PreEnrollment Phase 18 — waiver borné au 2026-07-04T23:59:59Z dans audit-data-gap.ts"

patterns-established:
  - "Garde anti-inversion : LOCAL_DATABASE_URL refusé s'il contient 'supabase' ; CLOUD_DATABASE_URL exigé Supabase"
  - "Audit storage d'écart : script temporaire réutilisant collectAllKeys + list Supabase paginé + HeadObject MinIO, supprimé après (migrate-storage.ts jamais modifié)"

requirements-completed: []  # CUT-01 = gate complet de la phase (runbook + rollback + invitations + bascule) — ce plan livre son prérequis data uniquement (même logique que 21-02 pour TEST-01/02)

# Metrics
duration: 50min (actif — 8h22 wall-clock incluant l'attente du checkpoint décision Laurent)
completed: 2026-07-07
---

# Phase 22 Plan 03: Audits data pré-bascule (D-01 + D-02) Summary

**Découverte majeure (cloud = snapshot du 16/06, dump 03/07 jamais restauré) → report sélectif de 1 414 lignes métier local→cloud (SES-0101, 11 personnes, 1 349 mappings Google Calendar) → cloud déclaré UNIQUE SOURCE DE VÉRITÉ, et storage final prouvé 0 lien mort (903/903).**

## Performance

- **Duration:** ~50 min actives (8h22 wall-clock — checkpoint décision Laurent entre les deux sessions)
- **Started:** 2026-07-06T20:23:24Z
- **Completed:** 2026-07-07T04:45:01Z
- **Tasks:** 2 (+ remédiation gatée par décision utilisateur)
- **Files modified:** 4 créés

## Accomplishments

- **Audit d'écart local↔cloud lecture seule** (`audit-data-gap.ts`, 48 tables, comptages exacts + max timestamps) — verdict machine-checkable exit 0/1/2, gardes anti-inversion.
- **DÉCOUVERTE MAJEURE** : la base cloud n'était PAS issue du dump frais du 03/07 (jamais restauré) mais du snapshot staging du **16/06** — 3 semaines de données métier locales absentes du cloud, dont **SES-0101 (session réelle du 27/07/2026 avec 11 inscrits)** et les **1 349 mappings d'idempotence Google Calendar** (sans eux, tout re-backfill dupliquerait les 1 330 events réels de l'agenda).
- **Remédiation (décision Laurent, option 1)** : `report-data-gap.ts` insert-only idempotent — DRY validé puis WRITE **1 414/1 414 lignes, 0 erreur**, re-DRY = 0 manquant (idempotence prouvée). Aucune ligne cloud existante modifiée, aucune suppression, aucune écriture locale.
- **Re-run audit : VERDICT PASS (exit 0)** — toutes les tables métier à délta 0 ou positif cloud ; résidu du 04/07 (artefacts SES-0093 regénérables + 1 touch PreEnrollment) explicitement assumé et borné. **Déclaration D-01 émise** : cloud = unique source de vérité, local obsolète (purge 22-10).
- **Re-audit storage final (D-02)** : DRY + audit d'écart lecture seule (méthode 21-02) AVANT et APRÈS le report — **903/903 clés résolvent Supabase, 0 manquante, 0 orpheline, aucun WRITE storage nécessaire**. MinIO NON purgé. `migrate-storage.ts` : 0 modification.

## Task Commits

1. **Task 1: audit-data-gap script + rapport D-01 (verdict initial FAIL documenté)** - `0b930b6` (feat)
2. **Task 2: re-audit storage final D-02 (0 lien mort)** - `46c1b22` (chore)
3. **Task 1-bis: report sélectif + déclaration D-01 PASS (post-décision Laurent)** - `7e8d291` (feat)

## Files Created/Modified

- `apps/web/scripts/audit-data-gap.ts` - Audit d'écart local↔cloud lecture seule stricte, verdict exit-code, waiver résidu assumé borné
- `apps/web/scripts/report-data-gap.ts` - Report sélectif local→cloud DRY/WRITE=1, upserts insert-only par id, ordre FK-safe, séquentiel
- `.planning/phases/22-bascule-prod-conformit-rgpd/22-DATA-GAP-AUDIT.md` - Audit initial (FAIL, historique) + remédiation + déclaration finale cloud=vérité
- `.planning/audit/STORAGE-REAUDIT-FINAL.md` - Re-audit storage final : 903/903, 0 lien mort, comparaison baseline, section post-report

## Decisions Made

- **Laurent (checkpoint 2026-07-07) : option 1 — report sélectif** des données métier manquantes vers le cloud ; artefacts de génération NON reportés (versions 16/06 assumées, regénérables) ; ni re-restore ni abandon.
- Résidu assumé mécanisé dans le script (tables + borne 04/07) plutôt qu'un PASS manuel : le verdict reste machine-checkable et re-durcit automatiquement si le local bougeait.
- Insert-only (update vide sur upsert) : le cloud garde raison sur toute ligne existante — protège les corrections faites côté staging depuis le 16/06.

## Deviations from Plan

### Découverte majeure + décision utilisateur (branche FAIL du plan)

**1. [Rule 4 - Architectural/Data] La base cloud était un snapshot du 16/06, pas du dump du 03/07**
- **Found during:** Task 1 (audit d'écart)
- **Issue:** Le plan supposait cloud ≈ dump 03/07 + travail cloud. En réalité le dump frais n'a jamais été restauré (Phase 19 a baseliné la base restaurée le 16/06). Données métier 16/06→03/07 absentes du cloud : SES-0101 + 11 inscrits, 11 Person, 12 Organization, 23 LegalLink, 2 SensitiveData, 1 RevenueTarget, 1 349 SessionCalendarSync.
- **Fix:** STOP + checkpoint décision (protocole du plan) → décision Laurent option 1 → `report-data-gap.ts` (1 414 lignes, insert-only, idempotent) → re-run audit PASS → déclaration D-01 émise.
- **Files modified:** apps/web/scripts/report-data-gap.ts, apps/web/scripts/audit-data-gap.ts, 22-DATA-GAP-AUDIT.md
- **Verification:** re-DRY report = 0 manquant ; audit exit 0 ; storage post-report 903/903
- **Committed in:** 7e8d291

### Auto-fixed Issues

**2. [Rule 3 - Blocking] tsx introuvable à la racine du workspace**
- **Found during:** Task 1 (exécution du script)
- **Issue:** `pnpm tsx` échoue à la racine (tsx est une devDependency de apps/web, pas du root)
- **Fix:** Exécution depuis `apps/web/` (`pnpm tsx scripts/...`), usage documenté dans l'en-tête des scripts
- **Files modified:** aucun (convention d'exécution)
- **Verification:** runs OK
- **Committed in:** 0b930b6 (doc d'usage)

---

**Total deviations:** 1 décision utilisateur (Rule 4, prévue par la branche FAIL du plan) + 1 auto-fix (Rule 3 blocking).
**Impact on plan:** La découverte a AGRANDI la portée réelle du plan (remédiation data) mais c'est exactement le risque que ce gate devait attraper — sans lui, la prod aurait démarré sans SES-0101 et avec un risque de doublons Google Calendar.

## Authentication Gates

Aucune.

## Known Stubs

Aucun — les scripts livrés sont complets et exécutés en réel (pas de données factices, pas de placeholder).

## Issues Encountered

- Le DRY de `migrate-storage.ts` écrase le rapport daté du jour (`STORAGE-MIGRATION-REPORT-2026-07-06.md`, commité au 21-02) — restauré via `git checkout` après capture des compteurs ; les chiffres vivent dans STORAGE-REAUDIT-FINAL.md.
- `_prisma_migrations` : écart 29 vs 1 attendu (archives locales vs baseline 0_init) — marqué informatif, hors verdict.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Les 2 pré-requis data du runbook §0 sont PROUVÉS** : cloud = unique source de vérité déclarée (D-01, après remédiation) + storage final 0 lien mort (D-02). La fenêtre de bascule peut s'ouvrir côté données.
- ⚠ Pour le plan 22-10 (purge du local) : le pg_dump d'archive doit capturer le local TEL QUEL (il contient l'historique des générations 16/06→04/07 non reporté au cloud + AuditLog local).
- ⚠ Les documents cloud des 68 sessions restent en version du 16/06 (pré-corrections Kaïna de masse / Tracfin SES-0086) — regénérables à la demande côté cloud (coût OpenRouter) ; le pack témoin SES-0094 (22-05/22-06) n'est pas affecté (protocole = régénération complète).
- ⚠ Ne PAS re-backfiller Google Calendar sans vérifier les mappings : ils sont désormais dans le cloud (1 349 lignes) — l'idempotence est préservée.

---
*Phase: 22-bascule-prod-conformit-rgpd*
*Completed: 2026-07-07*

## Self-Check: PASSED

- 5/5 fichiers présents (2 scripts, 2 rapports, SUMMARY)
- 3/3 commits présents (0b930b6, 46c1b22, 7e8d291)
- Scripts temporaires supprimés, migrate-storage.ts diff vide

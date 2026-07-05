---
phase: 20-worker-3-h-te-doc-engines
plan: 02
subsystem: infra
tags: [worker, postgres, skip-locked, ocr, preinscription, prisma, vercel, serverless]

# Dependency graph
requires:
  - phase: 18-supabase-storage-migration
    provides: "confirmPreEnrollmentUpload + direct-to-storage (fire-and-forget OCR à relocaliser)"
  - phase: 04-preinscriptions-ia
    provides: "extractPreEnrollmentDocuments (pipeline OCR worker-safe, contrat D-06 EXTRACTING→EXTRACTED/SUBMITTED+aiErrorMsg)"
provides:
  - "Driver de poll SKIP LOCKED des PreEnrollment SUBMITTED (processNextPreEnrollmentOcr, module worker-safe)"
  - "Entry-point worker OCR long-vivant (preinscription-ocr-worker.ts, poll loop + SIGINT/SIGTERM + env fail-loud)"
  - "Script pnpm worker:ocr"
  - "Server action confirmPreEnrollmentUpload : OCR NON déclenché inline, laisse SUBMITTED (alimente la queue)"
affects: [20-03, 20-04, 20-05, worker-3ᵉ-hôte, poppler, pdftoppm]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Réutilisation du statut PreEnrollment.SUBMITTED comme file d'attente native (0 nouvelle table, 0 migration Prisma)"
    - "Claim atomique UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING via prisma.$queryRaw (calqué queue-postgres.ts)"
    - "Module worker-safe (0 import React/auth/next-cache) + entry-point tsx séparé (pattern closure-worker-postgres.ts)"

key-files:
  created:
    - apps/web/src/lib/preinscription-ocr-queue.ts
    - apps/web/scripts/preinscription-ocr-worker.ts
    - apps/web/src/lib/__tests__/preinscription-ocr-queue.test.ts
  modified:
    - apps/web/src/server/actions/storage-upload.ts
    - apps/web/package.json
    - apps/web/src/server/actions/__tests__/storage-upload.test.ts

key-decisions:
  - "Statut SUBMITTED réutilisé comme queue (RESEARCH Pattern 4 option 2) : pas de nouvelle table ni migration"
  - "OCR relocalisé du fire-and-forget serverless (mort sur Vercel + pas de pdftoppm) vers un worker long-vivant sur le 3ᵉ hôte poppler"
  - "Filet anti-dégradation D-06 dans le driver : tout échec repasse SUBMITTED + aiErrorMsg (jamais EXTRACTING bloqué silencieux ni EXTRACTED vide)"

patterns-established:
  - "OCR queue via statut PreEnrollment : le driver claim SUBMITTED→EXTRACTING, l'extractor gère EXTRACTED/échec, le driver a un filet de secours"
  - "Poll séquentiel (for...of) dans le driver : convention projet anti-deadlock (jamais de runs parallèles massifs)"

requirements-completed: [WORK-04]

# Metrics
duration: ~7min
completed: 2026-07-05
---

# Phase 20 Plan 02: Worker OCR pré-inscription (relocalisation du fire-and-forget serverless) Summary

**Relocalisation du déclenchement OCR pré-inscription du fire-and-forget serverless mort sur Vercel vers un worker long-vivant qui poll les PreEnrollment SUBMITTED (claim atomique FOR UPDATE SKIP LOCKED) et exécute extractPreEnrollmentDocuments sur le 3ᵉ hôte poppler — 0 nouvelle table, 0 migration.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-05T09:12Z
- **Completed:** 2026-07-05T09:19Z
- **Tasks:** 2
- **Files modified:** 6 (3 créés, 3 modifiés)

## Accomplishments
- Driver de poll `processNextPreEnrollmentOcr` — claim atomique `UPDATE ... FOR UPDATE SKIP LOCKED RETURNING` sur les PreEnrollment `SUBMITTED`, passage `EXTRACTING`, appel `extractPreEnrollmentDocuments`, filet D-06 en cas d'échec. Module worker-safe (0 import React/auth/next-cache).
- Entry-point worker `preinscription-ocr-worker.ts` (poll loop `OCR_POLL_INTERVAL_MS`/`OCR_CONCURRENCY`, SIGINT/SIGTERM drain, `import '@qualiof/shared/env'` fail-loud) + script pnpm `worker:ocr`.
- `confirmPreEnrollmentUpload` : suppression du fire-and-forget OCR (mort en serverless, pas de pdftoppm) + suppression de l'import devenu inutile ; la row reste `SUBMITTED` → alimente la queue consommée par le worker.
- Tests hermétiques `preinscription-ocr-queue.test.ts` (3/3) : claim 2 rows séquentiel, 0 row, D-06 (échec → SUBMITTED + aiErrorMsg). Test 4 de `storage-upload.test.ts` inversé (WORK-04 : OCR NON déclenché, statut SUBMITTED persisté).

## Task Commits

Chaque task committée atomiquement (`--no-verify`, parallel executor) :

1. **Task 1: driver de poll SKIP LOCKED des PreEnrollment SUBMITTED** - `554b993` (feat)
2. **Task 2: worker OCR + retrait fire-and-forget + tests** - `8e1b511` (feat)

## Files Created/Modified
- `apps/web/src/lib/preinscription-ocr-queue.ts` (créé) — driver de poll, claim atomique, filet D-06
- `apps/web/scripts/preinscription-ocr-worker.ts` (créé) — entry-point worker long-vivant
- `apps/web/src/lib/__tests__/preinscription-ocr-queue.test.ts` (créé) — 3 tests hermétiques
- `apps/web/src/server/actions/storage-upload.ts` (modifié) — retrait fire-and-forget OCR + import inutile ; laisse SUBMITTED
- `apps/web/package.json` (modifié) — script `worker:ocr`
- `apps/web/src/server/actions/__tests__/storage-upload.test.ts` (modifié) — Test 4 inversé (WORK-04)

## Decisions Made
- Statut `PreEnrollment.SUBMITTED` réutilisé comme file d'attente native (RESEARCH Pattern 4 option 2) — aucune table ni migration Prisma.
- Nom de table/colonnes en PascalCase exact (`"PreEnrollment"`, `"status"`, `"submittedAt"`) — pas de `@@map` sur ce modèle (vérifié dans schema.prisma).
- Ordonnancement `ORDER BY "submittedAt" ASC NULLS LAST` pour un traitement FIFO.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 4 de storage-upload.test.ts rendu obsolète par le retrait du fire-and-forget**
- **Found during:** Task 2 (retrait du fire-and-forget de confirmPreEnrollmentUpload)
- **Issue:** Le Test 4 existant (18-03) assertait `extractPreEnrollmentDocuments appelé exactement 1 fois` dans l'action — comportement supprimé par WORK-04. La server action ne déclenche plus l'OCR par design.
- **Fix:** Test 4 réécrit pour asserter l'INVERSE conforme à WORK-04 : `updateMock` appelé avec `status:'SUBMITTED'` (queue alimentée) ET `extractMock` **jamais** appelé. Docstring du fichier mise à jour.
- **Files modified:** apps/web/src/server/actions/__tests__/storage-upload.test.ts
- **Verification:** `vitest run storage-upload.test.ts preinscription-ocr-queue.test.ts` → 9/9 verts, `tsc --noEmit` exit 0
- **Committed in:** 8e1b511 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — test obsolété par le changement de comportement demandé)
**Impact on plan:** Le fix est la conséquence directe et voulue de WORK-04. Aucun scope creep.

## Issues Encountered
- **Pollution de test cross-file pré-existante (HORS SCOPE)** : `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts` passe en isolation (9/9) mais échoue (8 failed) sous la suite parallèle complète, à cause d'une pollution des mocks `bullmq`/`ioredis` partagés avec `closure/__tests__`. Reproduit sur l'arbre propre (git stash) → antérieur, sans lien avec le driver OCR (qui n'importe ni bullmq ni ioredis ni invoice-reminders). Loggé dans `20-worker-3-h-te-doc-engines/deferred-items.md`, non corrigé (SCOPE BOUNDARY).

## User Setup Required
None - aucune configuration de service externe requise par ce plan. Le worker `worker:ocr` sera déployé sur le 3ᵉ hôte (poppler/pdftoppm) dans les plans suivants ; variables optionnelles `OCR_POLL_INTERVAL_MS` (5000) / `OCR_CONCURRENCY` (2).

## Known Stubs
Aucun. Aucun stub introduit (pas de valeur vide hardcodée vers l'UI, pas de placeholder/TODO/FIXME).

## Next Phase Readiness
- WORK-04 (partie code) satisfait : déclenchement OCR relocalisé, aucune dégradation silencieuse possible (échec → SUBMITTED + aiErrorMsg).
- La preuve INFRA réelle (PDF scanné sans couche texte → pdftoppm sur le worker → vision OpenRouter → EXTRACTED données réelles) est déléguée au plan **20-05** (smoke gaté Laurent, exige l'image poppler déployée sur le 3ᵉ hôte).

## Self-Check: PASSED

- Files: 4/4 FOUND (driver, worker, test, SUMMARY)
- Commits: 2/2 FOUND (554b993, 8e1b511)

---
*Phase: 20-worker-3-h-te-doc-engines*
*Completed: 2026-07-05*

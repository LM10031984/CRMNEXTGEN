---
phase: 13-veille-qualiopi-integree
plan: 01
subsystem: database
tags: [prisma, postgres, xlsx, vitest, audit-log, multi-tenant]

# Dependency graph
requires:
  - phase: 11-factures
    provides: invoice-audit.ts pattern clone-target pour logRegulatoryWatchEvent (one-helper-per-entity)
  - phase: SmartOF-import
    provides: import-smartof.ts pattern clone-target pour script xlsx idempotent (fs.readFileSync + XLSX.read buffer)
provides:
  - "Prisma model RegulatoryWatch (multi-tenant) + 3 enums + 3 indexes"
  - "Relation inverse Tenant.regulatoryWatches[]"
  - "Helper parseFlexibleDate (3 formats : DD/MM/YYYY, DD-Mmm-YY, Mmm-YY)"
  - "Helper logRegulatoryWatchEvent (7e instance one-helper-per-entity, convention regulatoryWatch.* instanciée)"
  - "Script import-veille-from-xlsx.ts idempotent (~84 entrées, 5 feuilles, 2 layouts)"
  - "Vitest config minimale pour packages/db (1ère instance test dans ce package)"
  - "18 tests Wave 0 verts (8 parse + 3 idempotence + 7 mapping)"
affects:
  - 13-02 (server actions CRUD : utilisera logRegulatoryWatchEvent pour AuditLog)
  - 13-03 (UI page /app/veille : lira prisma.regulatoryWatch.findMany filtré par tenantId+theme)
  - 13-04 (export PDF audit : utilisera convention regulatoryWatch.exported avec targetWatchId='BULK')
  - 13-05 (worker BullMQ : utilisera logRegulatoryWatchEvent regulatoryWatch.auto_inserted + dédup par (tenantId, url, theme))
  - 13-06 (smoke réel : exécutera le script sur le xlsx pour avoir ~84 entrées en BDD)

# Tech tracking
tech-stack:
  added:
    - vitest 2.1.x (devDependency packages/db — 1ère config test dans ce package)
  patterns:
    - "AuditLog convention regulatoryWatch.* instanciée (8 verbes documentés)"
    - "Sheet mapping xlsx déclaratif via SHEET_THEME_MAP (5 feuilles → 4 thèmes, autorise duplication INDIC_26)"
    - "Idempotence par tuple (tenantId, theme, title, url) — D-11 autorise duplication thématique"
    - "Duplication contrôlée du helper parseFlexibleDate dans le script tsx (évite import croisé apps/web → packages/db fragile en tsx ESM)"

key-files:
  created:
    - apps/web/src/lib/veille/parse-flexible-date.ts
    - apps/web/src/lib/veille/__tests__/parse-flexible-date.test.ts
    - apps/web/src/lib/regulatoryWatch-audit.ts
    - packages/db/scripts/import-veille-from-xlsx.ts
    - packages/db/scripts/__tests__/import-veille.idempotence.test.ts
    - packages/db/scripts/__tests__/import-veille.mapping.test.ts
    - packages/db/vitest.config.ts
  modified:
    - packages/db/prisma/schema.prisma (model RegulatoryWatch + 3 enums + Tenant.regulatoryWatches[])
    - packages/db/package.json (test script + vitest devDep + import:veille script)
    - .gitignore (packages/*/tsconfig.tsbuildinfo)
    - pnpm-lock.yaml (vitest)

key-decisions:
  - "Vitest ajouté à packages/db (au lieu de déplacer les tests vers apps/web) — respect du path PLAN scripts/__tests__/."
  - "Helper parseFlexibleDate dupliqué dans le script tsx (15 LOC) au lieu d'import croisé — préempte fragilité tsx ESM."
  - "Convention regulatoryWatch.* posée avec 8 verbes documentés en JSDoc (D-Phase 13 §AuditLog convention)."

patterns-established:
  - "7e instance one-helper-per-entity (Phase 13) : logRegulatoryWatchEvent clone-strict invoice-audit.ts"
  - "Script d'import xlsx exposant 3 named exports (SHEET_THEME_MAP, processSheetRows pure, persistVeilleRow) → testable sans exécuter main()"
  - "Détection isDirectRun via process.argv[1] === __filename → permet d'importer le script dans un test sans déclencher main()"

requirements-completed: [VEILLE-01]

# Metrics
duration: 14min
completed: 2026-05-25
---

# Phase 13 Plan 01: Foundation Veille Qualiopi Summary

**Migration Prisma `RegulatoryWatch` (model + 3 enums + 3 indexes + relation Tenant) + helper parseFlexibleDate (3 formats date xlsx) + 7e instance one-helper-per-entity (`logRegulatoryWatchEvent`) + script d'import xlsx idempotent (5 feuilles → 4 thèmes, ~84 entrées) — 18 tests Wave 0 verts (8 parse + 3 idempotence + 7 mapping).**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-25T11:17:29Z
- **Completed:** 2026-05-25T11:32:00Z
- **Tasks:** 3 (Task 0 Wave 0 + Task 1 Schema/Helper + Task 2 AuditLog/Script)
- **Files created:** 7
- **Files modified:** 4

## Accomplishments

- **Migration Prisma RegulatoryWatch** appliquée localement via `prisma db push --skip-generate` + `prisma generate`. Schéma additif : 0 modification de table existante hors ajout de la relation `Tenant.regulatoryWatches[]` (alphabétique).
- **3 enums créés** : `RegulatoryWatchTheme` (INDIC_23/24/25/26), `RegulatoryWatchStatus` (DRAFT/ACTIVE/ARCHIVED), `RegulatoryWatchSource` (USER/IMPORT/AUTO).
- **3 indexes optimisés** : `[tenantId, theme, status]` (listing par thème), `[tenantId, status, suggestedBy]` (inbox suggestions auto), `[tenantId, dateLastReviewed]` (KPI "X jours depuis").
- **Helper `parseFlexibleDate`** : 65 LOC, regex 3 formats + edge cases null/whitespace/unknown → 8 tests verts.
- **Helper `logRegulatoryWatchEvent`** : 7e instance one-helper-per-entity, clone-strict de `invoice-audit.ts`. Convention `regulatoryWatch.*` documentée en JSDoc avec les 8 verbes attendus en Phase 13 (created/updated/exploitation_updated/approved/rejected/archived/auto_inserted/exported).
- **Script `import-veille-from-xlsx.ts`** : 399 LOC, clone-structure `import-smartof.ts`. Idempotent par `(tenantId, theme, title, url)`, supporte les 2 layouts (header row 0 dual-exploitation vs row 2 single), AuditLog `regulatoryWatch.created` instanciée (`actorUserId=null`, `batch=true`, `source='import-xlsx'`).
- **Test infrastructure étendue** : 1ère config vitest dans `packages/db` (lockfile + devDep + script `test`).

## Task Commits

Each task was committed atomically:

1. **Task 0 (Wave 0): Tests stubs RED** — `ab8f874` (test) — 5 fichiers : 3 tests + vitest config packages/db + package.json update.
2. **Task 1: Migration Prisma + parseFlexibleDate** — `d636909` (feat) — schema.prisma (RegulatoryWatch + 3 enums + Tenant relation) + helper TS.
3. **Task 2: Helper AuditLog + Script import** — `9bca2f0` (feat) — regulatoryWatch-audit.ts + import-veille-from-xlsx.ts.
4. **Chore: lockfile vitest devDep** — `0ff5d69` (chore) — pnpm-lock.yaml update suite à l'ajout de vitest dans packages/db.
5. **Chore: gitignore packages tsbuildinfo** — `35691fb` (chore) — exclusion artefacts tsc --noEmit hors apps/web (déjà tracké).

## Files Created/Modified

### Created
- `apps/web/src/lib/veille/parse-flexible-date.ts` — Helper pur 3 formats date xlsx.
- `apps/web/src/lib/veille/__tests__/parse-flexible-date.test.ts` — 8 tests unitaires (3 formats + 5 edge cases).
- `apps/web/src/lib/regulatoryWatch-audit.ts` — 7e instance one-helper-per-entity, 8 verbes namespacés documentés.
- `packages/db/scripts/import-veille-from-xlsx.ts` — Script d'import idempotent ~400 LOC, 3 named exports testables (SHEET_THEME_MAP, processSheetRows, persistVeilleRow).
- `packages/db/scripts/__tests__/import-veille.idempotence.test.ts` — 3 tests mock prisma (findFirst→create+AuditLog OR update no-AuditLog).
- `packages/db/scripts/__tests__/import-veille.mapping.test.ts` — 7 tests fixtures inline (5 sheets + 2 layouts + SHEET_THEME_MAP shape).
- `packages/db/vitest.config.ts` — Config vitest minimale (env: node, include scripts/__tests__/).

### Modified
- `packages/db/prisma/schema.prisma` — Ajout model RegulatoryWatch + 3 enums + Tenant.regulatoryWatches[] (en fin de fichier, section commentée "Veille Qualiopi (Phase 13 — VEILLE-01)").
- `packages/db/package.json` — Script `test`, script `import:veille`, devDep `vitest ^2.1.8`.
- `.gitignore` — Pattern `packages/*/tsconfig.tsbuildinfo` (apps/web reste tracké).
- `pnpm-lock.yaml` — Lock vitest 2.1.9 pour packages/db.

## Decisions Made

- **Vitest ajouté à packages/db** plutôt que de déplacer les tests vers apps/web. Raison : respecter le path explicitement défini dans le plan (`packages/db/scripts/__tests__/`). Coût : 1 fichier `vitest.config.ts` + 1 devDep — bénéfice : symétrie avec future expansion (autres scripts importables `import-smartof`, etc. pourront ajouter des tests sans nouvelle config).
- **Duplication contrôlée du helper parseFlexibleDate** dans le script tsx (`packages/db/scripts/import-veille-from-xlsx.ts`) au lieu d'import croisé `apps/web/src/lib/veille/parse-flexible-date.ts`. Raison : le RESEARCH.md §5.6 + le PLAN explicitement notent ce risque. 30 LOC, helper pur, 0 dépendance externe → duplication acceptable, documentée en JSDoc.
- **Convention AuditLog `regulatoryWatch.*` documentée à l'avance** dans le helper (8 verbes JSDoc), pas seulement le verbe `created` instancié dans le script. Permet aux Plans 02-05 de se référer à un contrat stable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest non installé dans packages/db**
- **Found during:** Task 0 (premier run de `pnpm --filter @qualiof/db exec vitest`)
- **Issue:** `packages/db` n'avait pas de config vitest existante. Le plan demande explicitement des tests à `packages/db/scripts/__tests__/` mais sans préciser comment les exécuter.
- **Fix:** Ajout de `vitest ^2.1.8` en `devDependencies`, création de `packages/db/vitest.config.ts` minimale (env: node, include scripts/__tests__/), ajout du script `"test": "vitest run"` dans package.json, ajout du script `"import:veille"`. `pnpm install --filter @qualiof/db` pour materialiser le bin.
- **Files modified:** packages/db/package.json, packages/db/vitest.config.ts, pnpm-lock.yaml
- **Verification:** `pnpm --filter @qualiof/db exec vitest run` retourne 10/10 verts.
- **Committed in:** `ab8f874` (vitest.config + package.json), `0ff5d69` (lockfile)

**2. [Rule 3 - Blocking] tsbuildinfo non-ignoré dans packages/**
- **Found during:** Après `pnpm tsc --noEmit -p apps/web/tsconfig.json` (verification acceptance Task 2)
- **Issue:** `packages/shared/tsconfig.tsbuildinfo` est apparu untracked. `apps/web/tsconfig.tsbuildinfo` est par contre tracké historiquement.
- **Fix:** Ajout `packages/*/tsconfig.tsbuildinfo` dans `.gitignore` (commentaire explicite que apps/web reste tracké).
- **Files modified:** .gitignore
- **Verification:** `git status --short` clean après commit.
- **Committed in:** `35691fb` (chore)

---

**Total deviations:** 2 auto-fixed (2 blocking infrastructure).
**Impact on plan:** Aucun scope creep. Les 2 fixes débloquent l'exécution sans modifier le périmètre fonctionnel.

## Issues Encountered

- **`prisma validate` exigeait DATABASE_URL** : résolu en utilisant `dotenv -e ../../.env -- prisma validate` (pattern déjà utilisé dans les scripts npm `db:*` de packages/db).
- **`prisma format` a reformatté tout le fichier schema.prisma** (réalignement colonnes Tenant + alignements indents existants). Aucun changement sémantique, seulement cosmetic. Confirmé par `pnpm --filter @qualiof/web test` (608/608 verts, 0 régression).

## Testing & Verification

- **Wave 0 tests:** 18/18 GREEN (8 parseFlexibleDate + 3 idempotence + 7 mapping).
- **Full apps/web suite:** 71 test files, **608/608 passed** (zéro régression).
- **TypeScript:** `tsc --noEmit` clean sur apps/web ET packages/db.
- **Prisma:** `prisma validate` ok, `prisma db push --skip-generate` appliqué localement, `prisma generate` ok.

## Smoke manuel à exécuter en Plan 06

```bash
pnpm --filter @qualiof/db exec tsx scripts/import-veille-from-xlsx.ts \
  "/Users/laurentmarx/Documents/CRM Next gen/C6.i23-24-25tableau veille.xlsx"
```

**Attendu :**
- 1er run : ~84 inserted, 0 updated, 0 skipped — création autant d'AuditLog `regulatoryWatch.created` qu'inserted.
- 2e run sur même fichier : 0 inserted, ~84 updated, 0 doublons — aucun nouvel AuditLog `regulatoryWatch.created`.
- Distribution par thème attendue :
  - INDIC_23 : ~27 entries (feuille "23-Veille Formation pro")
  - INDIC_24 : ~28 entries (feuille "24- secteur dactivité")
  - INDIC_25 : ~25 entries (feuille "25- Innovations péda et techno")
  - INDIC_26 : ~24 entries (cumul "26 - Veille Handicap" + "26-Veille DREETS PACA")

## Production Migration Notes

**Local sandbox (cette session) :** `prisma db push --skip-generate` + `prisma generate` (cf mémoire `feedback_prisma_db_push_sandbox.md`).

**En CI/prod (mémoire `feedback_prisma_migrate_deploy.md` — non-négociable) :**
```bash
pnpm --filter @qualiof/db exec prisma migrate dev --name phase13_regulatory_watch
pnpm --filter @qualiof/db exec prisma migrate deploy
```
Sinon : runtime "column X does not exist" lors du premier `prisma.regulatoryWatch.findFirst`.

## Risques connus restants

- **Smoke réel non exécuté** (volontaire — sera fait en Plan 06). Si le mapping `processSheetRows` n'aligne pas avec la structure réelle du xlsx (offset col 8 dans la feuille 25 par exemple — qui a 10 colonnes au lieu de 9), il faudra ajuster la matrice fixture du test #4 + le code. Les tests fixtures sont alignés sur les premières lignes inspectées en preview RESEARCH §5.2.
- **Duplication parseFlexibleDate** : si le helper évolue (ajout d'un 4e format), il faudra muter les 2 emplacements. Coût accepté vs fragilité import croisé.
- **`prisma format` a touché 1290 lignes** de cosmetic : les diffs PR Phase 13 incluront ce reformatting. À mentionner en code review.

## Self-Check: PASSED

All 7 created files exist on disk. All 5 commits exist in git log.

**Files verified:**
- ✓ `apps/web/src/lib/veille/parse-flexible-date.ts`
- ✓ `apps/web/src/lib/veille/__tests__/parse-flexible-date.test.ts`
- ✓ `apps/web/src/lib/regulatoryWatch-audit.ts`
- ✓ `packages/db/scripts/import-veille-from-xlsx.ts`
- ✓ `packages/db/scripts/__tests__/import-veille.idempotence.test.ts`
- ✓ `packages/db/scripts/__tests__/import-veille.mapping.test.ts`
- ✓ `packages/db/vitest.config.ts`

**Commits verified:**
- ✓ `ab8f874` (test : Wave 0 RED tests)
- ✓ `d636909` (feat : Migration Prisma + parseFlexibleDate)
- ✓ `9bca2f0` (feat : Helper AuditLog + Script import)
- ✓ `0ff5d69` (chore : Lockfile vitest)
- ✓ `35691fb` (chore : Gitignore packages tsbuildinfo)

## Next Phase Readiness

- ✅ `prisma.regulatoryWatch` typé end-to-end (verifié `tsc --noEmit`).
- ✅ Convention `regulatoryWatch.*` posée → Plans 02-05 peuvent réutiliser le helper.
- ✅ Script idempotent testé en unit → Plan 06 peut le lancer en confiance.
- ✅ 0 régression sur les 608 tests existants apps/web.
- 🟡 **Avant Plan 06** : exécuter le smoke réel sur le xlsx (commande ci-dessus) pour confirmer que ~84 lignes se créent bien et que le mapping fonctionne sur les feuilles réelles (notamment INDIC_25 qui a 10 colonnes vs 9 prévu dans certains row early).
- 🟡 **Avant prod** : `prisma migrate dev --name phase13_regulatory_watch` (cette session a utilisé `db push`).

---
*Phase: 13-veille-qualiopi-integree*
*Plan: 01*
*Completed: 2026-05-25*

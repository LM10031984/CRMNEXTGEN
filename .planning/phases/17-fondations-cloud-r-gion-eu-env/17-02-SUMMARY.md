---
phase: 17-fondations-cloud-r-gion-eu-env
plan: 02
subsystem: infra
tags: [env, t3-env, zod, turbo, supabase, storage, boot-safety, cloud-migration]

# Dependency graph
requires:
  - phase: 16-migration-ia-claude
    provides: "env-schemas.ts (module pur isolé) + pattern schémas Zod testables hermétiquement"
provides:
  - "5 clés cloud (DIRECT_URL, STORAGE_PROVIDER, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WEASYPRINT_URL) déclarées + validées t3-env dans env.ts"
  - "Chokepoint boot RÉEL : sharedEnv importé dans next.config.mjs (await import) + 2 workers → createEnv() s'exécute au boot (le fail-loud CLAUDE.md n'était que fictif avant)"
  - "storage.ts migré vers sharedEnv (0 process.env brut sur STORAGE_PROVIDER/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)"
  - "Alias mort DOC_ENGINE_URL retiré (env.ts + turbo.json + .env.example), remplacé fonctionnellement par WEASYPRINT_URL"
  - "turbo.json globalEnv à jour (5 clés cloud + DOC_ENGINE_TOKEN, invalidation cache)"
affects: [18-supabase-storage, 19-base-postgres, 20-worker-3e-hote, 21-app-vercel, 17-03-doc-engine-token]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chokepoint boot fail-loud : await import('@qualiof/shared/env') dans next.config.mjs APRÈS dotenv, AVANT nextConfig"
    - "Import statique '@qualiof/shared/env' en tête des scripts worker (ne passent pas par next.config.mjs)"
    - "env.ts importe ./env-schemas.ts avec extension .ts explicite (raw Node ESM du next.config exige une extension) — allowImportingTsExtensions activé côté apps/web + shared (noEmit-safe)"
    - "Tests qui importent transitivement storage.ts DOIVENT mocker @/lib/storage (createEnv au load) pour rester hermétiques"

key-files:
  created:
    - .planning/phases/17-fondations-cloud-r-gion-eu-env/deferred-items.md
  modified:
    - packages/shared/src/env-schemas.ts
    - packages/shared/src/env.ts
    - packages/shared/src/__tests__/env.test.ts
    - packages/shared/tsconfig.json
    - apps/web/tsconfig.json
    - apps/web/next.config.mjs
    - apps/web/scripts/closure-worker.ts
    - apps/web/scripts/closure-worker-postgres.ts
    - apps/web/src/lib/storage.ts
    - apps/web/src/lib/__tests__/preinscription-extractor.test.ts
    - turbo.json
    - .env.example

key-decisions:
  - "D-03/D-04 respectés : SUPABASE_* restent .optional() (throw runtime conditionnel storage.ts), STORAGE_PROVIDER enum default minio, WEASYPRINT_URL url default :5001, DIRECT_URL url requise"
  - "Chokepoint via await import dynamique dans next.config.mjs (pas import statique) : dotenv doit charger .env AVANT que createEnv lise process.env"
  - "Extension .ts explicite + allowImportingTsExtensions : seule voie pour que raw Node ESM (next.config) charge env.ts sans loader TS externe (Rule 3)"

patterns-established:
  - "Boot fail-loud RÉEL : la validation t3-env tourne effectivement au build/dev/worker (prouvé build positif vert + négatif throw)"
  - "Un module lib qui exécute createEnv() au load casse tout test qui l'importe transitivement sans le mocker"

requirements-completed: [CLOUDENV-02]

# Metrics
duration: 9min
completed: 2026-07-04
---

# Phase 17 Plan 02: Boot fail-loud 5 clés cloud + chokepoint réel Summary

**Les 5 clés cloud (DIRECT_URL/STORAGE_PROVIDER/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/WEASYPRINT_URL) sont déclarées et validées par t3-env, et le fail-loud au boot est RENDU RÉEL en important sharedEnv à un chokepoint (next.config.mjs + 2 workers) — prouvé mécaniquement par un build positif vert et un build négatif qui throw.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-04T13:38:03Z
- **Completed:** 2026-07-04T13:47:17Z
- **Tasks:** 2
- **Files modified:** 12 (1 créé)

## Accomplishments

- **DÉCOUVERTE CRITIQUE corrigée** : `sharedEnv` n'était importé NULLE PART dans `apps/web` → `createEnv()` ne tournait jamais au boot → l'affirmation CLAUDE.md « Boots fail loud at import time » était FICTIVE. Elle est désormais RÉELLE.
- **5 clés cloud déclarées** (server + runtimeEnv) avec les schémas exacts D-04, + 3 schémas Zod isolés testables (`STORAGE_PROVIDER_SCHEMA`, `WEASYPRINT_URL_SCHEMA`, `DIRECT_URL_SCHEMA`).
- **Chokepoint boot câblé** : `await import('@qualiof/shared/env')` dans `next.config.mjs` (après dotenv) + `import '@qualiof/shared/env'` en tête des 2 workers BullMQ/Postgres.
- **storage.ts migré vers sharedEnv** : 0 `process.env` brut sur les 3 clés, throw conditionnel Supabase conservé verbatim (D-03).
- **Alias mort `DOC_ENGINE_URL` retiré** (env.ts + turbo.json + .env.example), `WEASYPRINT_URL` le remplace ; `DOC_ENGINE_TOKEN` conservé (câblé en 17-03).
- **Fail-loud PROUVÉ mécaniquement** : `BUILD_VALID_OK` (env valide → exit 0) + `FAILLOUD_OK` (env cloud malformé → createEnv throw `Invalid environment variables` à `next.config.mjs:20` → `env.ts:37`).

## Task Commits

1. **Task 1: Déclarer les 5 clés cloud + retirer DOC_ENGINE_URL + étendre le test hermétique** — `0c9d960` (feat, TDD RED→GREEN prouvé : 4 tests rouges sur schémas absents → verts)
2. **Task 2: Chokepoint boot + migration storage.ts + turbo/.env.example + preuve fail-loud** — `53bb34e` (feat)

## Files Created/Modified

- `packages/shared/src/env-schemas.ts` — +3 schémas Zod isolés cloud
- `packages/shared/src/env.ts` — 5 clés cloud (server+runtimeEnv), DOC_ENGINE_URL retiré, import `./env-schemas.ts` extension explicite
- `packages/shared/src/__tests__/env.test.ts` — +7 assertions hermétiques (Test 4→10)
- `packages/shared/tsconfig.json` — `noEmit` + `allowImportingTsExtensions` (type-check only)
- `apps/web/tsconfig.json` — `allowImportingTsExtensions` (noEmit-safe)
- `apps/web/next.config.mjs` — chokepoint `await import('@qualiof/shared/env')`
- `apps/web/scripts/closure-worker.ts` + `closure-worker-postgres.ts` — import fail-loud en tête
- `apps/web/src/lib/storage.ts` — consomme `sharedEnv`, throw Supabase préservé
- `apps/web/src/lib/__tests__/preinscription-extractor.test.ts` — mock `@/lib/storage` (hermétique)
- `turbo.json` — globalEnv +5 clés +DOC_ENGINE_TOKEN, -DOC_ENGINE_URL
- `.env.example` — bloc Cloud v6 + WEASYPRINT_URL, -DOC_ENGINE_URL
- `.planning/.../deferred-items.md` — log échec pré-existant hors scope

## Decisions Made

- Voir frontmatter `key-decisions`. Résumé : SUPABASE_* restent optional (throw runtime storage.ts), chokepoint en `await import` dynamique, extension `.ts` explicite + `allowImportingTsExtensions` pour satisfaire raw Node ESM du next.config.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extension `.ts` explicite + `allowImportingTsExtensions` pour que raw Node ESM charge env.ts**
- **Found during:** Task 2 (test POSITIF de la `<verify>`, exactement le gate prévu par le plan pour attraper ce risque ESM)
- **Issue:** `await import('@qualiof/shared/env')` dans `next.config.mjs` est évalué par Node ESM BRUT (avant le bundler Next). Node exige une extension sur les imports relatifs → `env.ts` important `./env-schemas` (extensionless) throw `ERR_MODULE_NOT_FOUND`. Le build positif échouait.
- **Fix:** Ajout de l'extension `.ts` explicite sur les 2 imports `./env-schemas` dans `env.ts` (Node 20/25 résout nativement le `.ts`). TypeScript refuse alors le `.ts` sans `allowImportingTsExtensions` → activé dans `apps/web/tsconfig.json` (déjà `noEmit:true`) et `packages/shared/tsconfig.json` (ajout `noEmit:true`, type-check only via `tsc --noEmit`/vitest — jamais émis). Vitest et le bundler Next acceptent le `.ts` explicite.
- **Files modified:** packages/shared/src/env.ts, packages/shared/tsconfig.json, apps/web/tsconfig.json
- **Verification:** `pnpm --filter @qualiof/web build` → exit 0 `BUILD_VALID_OK` ; `pnpm --filter @qualiof/shared exec tsc --noEmit` → exit 0 ; suite shared 113/113
- **Committed in:** 53bb34e

**2. [Rule 1 - Bug] Mock `@/lib/storage` dans preinscription-extractor.test.ts (régression d'hermeticité introduite par la migration)**
- **Found during:** Task 2 (suite web après migration storage.ts)
- **Issue:** La migration de `storage.ts` vers `sharedEnv` fait exécuter `createEnv()` au LOAD du module. `preinscription-extractor.ts` importe statiquement `@/lib/storage` → le test `preinscription-extractor.test.ts` (qui ne charge pas `.env`) échouait à la collection (`Invalid environment variables`). Le header du test stipule pourtant « ne JAMAIS importer un module qui exécute createEnv() ».
- **Fix:** Ajout d'un `vi.mock('@/lib/storage', ...)` (downloadFile stub + PREENROLLMENT_BUCKET) — cohérent avec la politique hermétique documentée du test. `extractDocsFromBuffers` (chemin buffer) n'appelle jamais downloadFile.
- **Files modified:** apps/web/src/lib/__tests__/preinscription-extractor.test.ts
- **Verification:** test 3/3 vert ; suite web 1141/1142 (seul échec = baseline pré-existant, cf. Issues)
- **Committed in:** 53bb34e

---

**Total deviations:** 2 auto-fixed (1 blocking ESM/tsconfig, 1 bug hermeticité de test)
**Impact on plan:** Les 2 corrections étaient nécessaires pour que le plan atteigne son objectif (build vert + suite non régressée). Aucune dérive de périmètre — le test POSITIF de la `<verify>` du plan avait justement pour rôle d'attraper le cas ESM (Rule 3). Périmètre inchangé.

## Build fail-loud — résultats (demandé par l'output du plan)

- **BUILD POSITIF** (`pnpm --filter @qualiof/web build`, env local valide) → **exit 0**, marqueur `BUILD_VALID_OK`. Prouve que le `await import('@qualiof/shared/env')` ajouté n'a pas cassé le build ESM/syntaxique.
- **BUILD NÉGATIF** (`SUPABASE_URL="pas-url" STORAGE_PROVIDER=supabase DIRECT_URL="pas-url" pnpm --filter @qualiof/web build`) → **throw** `Invalid environment variables: { DIRECT_URL: ['Invalid url'], SUPABASE_URL: ['Invalid url'] }`, stack `next.config.mjs:20 → env.ts:37 (createEnv)`. Marqueur `FAILLOUD_OK`.
- **Variable malformée forçante utilisée :** `SUPABASE_URL` (clé cloud NEUVE, ABSENTE de `.env`/`.env.local` → non écrasée par le `override:true` de dotenv dans next.config.mjs). `DIRECT_URL` a aussi été passée malformée et est également remontée par createEnv → double preuve.

## Issues Encountered

- **Échec de suite PRÉ-EXISTANT (hors scope, non causé par 17-02) :** `apps/web/src/lib/closure/__tests__/shared-template.test.ts:175` attend MIME `image/jpg`, reçoit `image/jpeg`. Documenté 15-01→16-06, logué dans `deferred-items.md`. Suite web = 1141/1142 (baseline identique), suite shared = 113/113.

## User Setup Required

**⚠ ACTION LAURENT (effet voulu du fail-loud) :** après cette refonte, le boot (`next build`/`dev`, workers) ÉCHOUE FORT si une des 5 clés cloud est absente/malformée dans `.env` / `.env.local`. En particulier **`DIRECT_URL` est REQUISE** (Prisma la lit déjà). En dev local, ajouter dans `.env.local` (ou vérifier `.env`) :

```
DIRECT_URL="postgresql://qualiof:qualiof_dev@localhost:5432/qualiof?schema=public"   # = DATABASE_URL en local (no-op)
STORAGE_PROVIDER="minio"   # défaut, optionnel
WEASYPRINT_URL="http://localhost:5001"   # défaut, optionnel
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` restent optionnelles tant que `STORAGE_PROVIDER=minio` (throw runtime seulement si `=supabase`). NB : `DIRECT_URL` est déjà présente dans le `.env` actuel de Laurent (vérifié) → le boot local ne devrait pas casser, mais toute machine/CI sans `DIRECT_URL` échouera (comportement recherché).

## Next Phase Readiness

- CLOUDENV-02 satisfait. Le fail-loud est réel → Phases 18 (Supabase Storage) / 19 (Postgres) peuvent s'appuyer sur des clés cloud validées au boot.
- 17-03 câblera `DOC_ENGINE_TOKEN` en Bearer dans `pdf-render.ts` (conservé ici) + traitera `WEASYPRINT_URL` côté call site PDF.
- Pattern à retenir pour les prochains plans : tout `lib/*` qui consomme `sharedEnv` s'exécute createEnv au load → mocker dans les tests hermétiques.

## Self-Check: PASSED

- Tous les fichiers créés/modifiés présents sur disque (10/10 vérifiés `[ -f ]`).
- Commits présents : `0c9d960` (Task 1), `53bb34e` (Task 2).

---
*Phase: 17-fondations-cloud-r-gion-eu-env*
*Completed: 2026-07-04*

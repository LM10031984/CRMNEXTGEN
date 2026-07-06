---
phase: 18-supabase-storage-migration-objets-direct-to-storage
plan: 01
subsystem: infra
tags: [supabase-storage, storage-adapter, signed-upload-url, direct-to-storage, minio, vitest, tdd]

# Dependency graph
requires:
  - phase: 17-fondations-cloud-r-gion-eu-env
    provides: "sharedEnv fail-loud (STORAGE_PROVIDER / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY déclarées + validées au boot)"
provides:
  - "createSignedUploadUrl(bucket, key) → { path, token, signedUrl } — upload direct navigateur→Supabase (contourne le cap 4,5 Mo Vercel), Supabase uniquement"
  - "objectExists(bucket, key) → boolean — vérif 0 lien mort SANS télécharger l'objet (Supabase list metadata / MinIO HeadObjectCommand)"
  - "Tests hermétiques storage.test.ts (6/6) mock @supabase/supabase-js + @qualiof/shared/env — patron réutilisable plans 02/03/04"
affects: [18-02, 18-03, 18-04, storage, migration, direct-to-storage, ocr]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interface-first : les 2 primitives (contrats) sont écrites AVANT leurs consommateurs (plans 02/03/04)"
    - "objectExists = list(metadata) / HeadObjectCommand — jamais downloadFile pour tester l'existence (anti-Pitfall 6)"
    - "Test hermétique storage : mock @supabase/supabase-js (vi.hoisted) + getter sur mockEnv pour piloter STORAGE_PROVIDER ; vi.resetModules() pour tester le provider minio (PROVIDER capturé au load)"

key-files:
  created:
    - apps/web/src/lib/__tests__/storage.test.ts
  modified:
    - apps/web/src/lib/storage.ts

key-decisions:
  - "createSignedUploadUrl throw explicite sur MinIO (upload serveur, pas de direct-to-storage) — le direct-to-storage est une capacité Supabase-only par design"
  - "objectExists supporte les 2 providers (Supabase list / MinIO HeadObjectCommand) car le script de migration STOR-02 lira MinIO en source et vérifiera Supabase en cible"
  - "Aucune fonction existante touchée (ensureBucket/uploadFile/downloadFile/createSignedDownloadUrl) — interface unique préservée, ~30 call sites intacts"

patterns-established:
  - "Chokepoint unique : n'ajouter des appels @supabase/supabase-js QUE dans storage.ts (grep de vérification : 0 appel hors adaptateur+tests à ce stade)"
  - "TDD strict + test de puissance (mutation upsert:true→false → Test 1 RED → restauré) au gate, convention projet"

requirements-completed: [STOR-01]

# Metrics
duration: 3min
completed: 2026-07-04
---

# Phase 18 Plan 01: Extension adaptateur storage (createSignedUploadUrl + objectExists) Summary

**Deux primitives Supabase ajoutées à l'interface unique `storage.ts` — `createSignedUploadUrl` (upload direct navigateur→Supabase, contourne le cap 4,5 Mo Vercel) et `objectExists` (vérif 0 lien mort sans télécharger l'objet) — écrites en interface-first pour les plans 02/03/04, couvertes par 6 tests hermétiques.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-04T17:19:30Z
- **Completed:** 2026-07-04T17:22:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 créé, 1 modifié)

## Accomplishments
- `createSignedUploadUrl(bucket, key)` : appelle `supabase().storage.from(bucket).createSignedUploadUrl(key, { upsert: true })` après `ensureBucket`, retourne `{ path, token, signedUrl }` ; throw explicite « Supabase uniquement » sur MinIO. Contrat consommé par STOR-03 (upload direct-to-storage CNI/RIB).
- `objectExists(bucket, key)` : Supabase via `list(prefix, { search: name })` (métadonnées seules, jamais de download), MinIO via `HeadObjectCommand` (existe → true, 404/NotFound → false). Contrat consommé par STOR-02 (vérif 0 lien mort de la migration).
- 6 tests hermétiques (`storage.test.ts`) — mock `@supabase/supabase-js` (vi.hoisted) + `@qualiof/shared/env` (getters sur `mockEnv`) : couvrent les 2 nouvelles fonctions ET confirment les contrats existants (`ensureBucket` public:false + 50 MiB, `createSignedDownloadUrl` TTL 600s).
- Aucune fonction existante modifiée — interface unique préservée.

## Task Commits

Chaque tâche committée atomiquement (TDD RED → GREEN) :

1. **Task 1: tests hermétiques storage (RED)** - `a9d4ef3` (test)
2. **Task 2: createSignedUploadUrl + objectExists (GREEN)** - `30ebdaa` (feat)

_TDD : le RED (`a9d4ef3`) échoue proprement sur `createSignedUploadUrl/objectExists is not a function` (4 fail / 2 pass — Tests 5&6 des fonctions existantes déjà verts), le GREEN (`30ebdaa`) passe 6/6._

## Files Created/Modified
- `apps/web/src/lib/__tests__/storage.test.ts` (créé) — 6 tests hermétiques mock supabase-js + env, protocole de mutation documenté
- `apps/web/src/lib/storage.ts` (modifié) — ajout `createSignedUploadUrl` + `objectExists` (après `createSignedDownloadUrl`, avant `_internals`) + import `HeadObjectCommand`

## Decisions Made
- None — plan suivi à la lettre (signatures, throw MinIO, upsert:true, list/HeadObjectCommand exactement comme spécifié dans le plan et RESEARCH « Code Examples »).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. RED attendu obtenu du premier coup (fonctions absentes, pas d'erreur d'import), GREEN 6/6 direct, tsc clean, test de puissance concluant.

## Verification
- Suite storage : `pnpm --filter @qualiof/web exec vitest run src/lib/__tests__/storage.test.ts` → **6/6 verts**.
- tsc : `pnpm --filter @qualiof/web exec tsc --noEmit` → **exit 0**.
- Test de puissance (convention projet) : mutation `{ upsert: true }`→`{ upsert: false }` → **Test 1 ROUGE** (assertion `toHaveBeenCalledWith(..., { upsert: true })`) → **restauré** → 6/6, `git diff --stat` propre (mutation NON commitée).
- Isolation du chokepoint : `grep -rn "createSignedUploadUrl\|@supabase/supabase-js" apps/web/src --include=*.ts --include=*.tsx | grep -v "storage.ts|__tests__"` → **vide** (aucun appel supabase-js hors adaptateur ; les consommateurs viennent aux plans 02/03/04).

## Acceptance (greps)
- `export async function createSignedUploadUrl` = 1 ✓
- `export async function objectExists` = 1 ✓
- `HeadObjectCommand` = 4 (import + usage) ✓
- `Supabase uniquement` = 1 (throw MinIO) ✓
- `{ upsert: true }` = 1 ✓
- Test : `createSignedUploadUrl`=13, `objectExists`=5, `not.toHaveBeenCalled`=2 (objectExists ne télécharge pas), `52428800`=3, `@supabase/supabase-js`=2 ✓

## Next Phase Readiness
- Contrats d'interface prêts : plan 02 (script de migration `migrate-storage.ts` utilisera `objectExists` pour vérifier 0 lien mort), plan 03 (server action + composant d'upload utiliseront `createSignedUploadUrl`), plan 04 (SMOKE prod).
- ⚠ Rappel (RESEARCH « Environment Availability ») : les critères de succès infra STOR-01 (refus accès non-signé) et STOR-03 (photo 10 Mo prod, 0 x 413) exigent un **projet Supabase EU réel** (`eu-west-3`, checkpoint 18-04) — non couvert par ce plan (unit hermétique uniquement).
- Baseline suite web complète non re-runnée ici (test isolé) : seul échec pré-existant connu = `shared-template.test.ts:175` MIME jpeg/jpg (hors scope, documenté depuis 15-01).

## Self-Check: PASSED

---
*Phase: 18-supabase-storage-migration-objets-direct-to-storage*
*Completed: 2026-07-04*

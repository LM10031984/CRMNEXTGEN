---
phase: 18-supabase-storage-migration-objets-direct-to-storage
plan: 02
subsystem: infra
tags: [supabase-storage, migration, minio, dry-run, idempotent, vitest, tdd, audit-report]

# Dependency graph
requires:
  - phase: 18-supabase-storage-migration-objets-direct-to-storage
    plan: 01
    provides: "objectExists (vérif 0 lien mort sans download) + interface storage.ts (PREENROLLMENT_BUCKET / DOCS_BUCKET)"
provides:
  - "migrate-storage.ts — script idempotent MinIO→Supabase DRY→WRITE, couvre les 8 champs storage / 2 buckets, vérifie 0 lien mort, écrit un rapport daté audit"
  - "collectAllKeys(prisma) / isInvalidSupabaseKey(key) / runMigration({...}) — fonctions pures injectables, testables sans client réel"
  - "npm script storage:migrate (tsx scripts/migrate-storage.ts)"
affects: [18-04, storage, migration, cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clients dédiés source/cible : le script instancie SON PROPRE S3 (MinIO source) + supabase-js (cible) car il lit MinIO ET écrit Supabase EN MÊME TEMPS — ne peut PAS s'appuyer sur le switch PROVIDER global de storage.ts (qui sera supabase à la migration)"
    - "Dépendances I/O INJECTÉES dans runMigration (download/upload/verify) → fonctions pures testables hermétiquement, main() CLI non exécuté en test"
    - "DRY par défaut, WRITE=1 explicite : en DRY report.migrated reste VIDE (byBucket.simulated++), aucun uploadToSupabase appelé — patron calqué sur calendar-backfill.ts"
    - "Séquentiel for...of await, JAMAIS d'exécution parallèle groupée (leçon mémoire génération masse : deadlocks/pertes) ; try/catch PAR clé → orphelins listés sans action auto (D-04)"

key-files:
  created:
    - apps/web/scripts/migrate-storage.ts
    - apps/web/scripts/__tests__/migrate-storage.test.ts
  modified:
    - apps/web/package.json

key-decisions:
  - "Périmètre COMPLET 8 champs (pas les 3 du critère de succès) : Person.ribKey / SensitiveData.idDocumentUrl / Invoice.pdfUrl / Quote.pdfUrl / Document.pdfUrl / AgeficeProfile.cfpAttestationKey / PedagogicalAsset.pdfUrl (docs) + PreEnrollment.cniKey/ribKey/cfpKey (preinscriptions) — sinon liens morts sur pièces apprenants et factures après bascule (RESEARCH « CRITIQUE »)"
  - "Script NON exécuté (ni DRY ni WRITE) : l'exécution réelle est une étape humaine GATÉE Laurent (D-01/D-02, « destructif = étape séparée », exige MinIO en marche + projet Supabase réel eu-west-3 checkpoint 18-04). Ce plan LIVRE le code + tests."
  - "En WRITE seul : vérif 0 lien mort via verifyExists (list metadata sur la cible dédiée, même logique qu'objectExists 18-01) ; report.deadLinks DOIT être vide pour autoriser la bascule"

patterns-established:
  - "Mock hermétique @/lib/storage dans le test (constantes de bucket) car storage.ts exécute createEnv() au load — politique projet 3ᵉ occurrence (16-02 classify, 17-03 pdf-render)"
  - "Test de puissance au gate : casser le `if (write)` autour de migrated.push → Test 3 (DRY n'écrit pas) ROUGE → restauré"

requirements-completed: [STOR-02]

# Metrics
duration: 5min
completed: 2026-07-04
---

# Phase 18 Plan 02: Script de migration storage MinIO→Supabase Summary

**Script `migrate-storage.ts` idempotent DRY→WRITE (WRITE=1 explicite) qui collecte les 8 champs de clé storage réels du schéma sur 2 buckets, copie chaque objet de MinIO (source, client S3 dédié) vers Supabase (cible, supabase-js dédié), vérifie 0 lien mort en WRITE et écrit un rapport daté audit — couvert par 6 tests hermétiques (collecte 8 champs / DRY sans écriture / orphelins / clés invalides), script NON exécuté (étape humaine gatée Laurent).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-04T17:25:27Z
- **Completed:** 2026-07-04T17:30:04Z
- **Tasks:** 2 (TDD RED → GREEN)
- **Files:** 3 (2 créés, 1 modifié)

## Accomplishments
- `collectAllKeys(prisma)` : parcourt les 8 champs storage réels (7 tables bucket `qualiof-docs` + PreEnrollment.cniKey/ribKey/cfpKey bucket `preinscriptions`), `findMany({ select })`, filtre les valeurs non-null/non-vides → `{ bucket, table, field, id, key }`.
- `isInvalidSupabaseKey(key)` : détecte leading `/`, double `//`, `%` (encodage), non-ASCII (accents) — Pitfall 1, clés listées SANS tentative d'upload.
- `runMigration({ keys, write, downloadFromMinio, uploadToSupabase, verifyExists })` : séquentiel `for...of await`, DRY ne migre PAS (byBucket.simulated++), WRITE copie + upsert idempotent ; orphelins (objet absent MinIO) et clés invalides listés sans action auto ; vérif 0 lien mort en WRITE via `verifyExists`.
- `main()` CLI : clients dédiés (S3 MinIO source, supabase-js cible), filtre optionnel `BUCKET=docs|preinscriptions`, écrit un rapport Markdown daté `.planning/audit/STORAGE-MIGRATION-REPORT-{date}.md` (total par bucket, migrés, orphelins, clés invalides, liens morts). `import.meta.url === file://argv[1]` → n'exécute `main()` qu'en CLI direct (pas au load du test). `finally { prisma.$disconnect() }`.
- npm script `storage:migrate` ajouté à `apps/web/package.json`.

## Task Commits

Chaque tâche committée atomiquement (TDD RED → GREEN, `--no-verify` parallel executor) :

1. **Task 1: tests hermétiques migration (RED)** - `de114c1` (test)
2. **Task 2: script migrate-storage DRY→WRITE (GREEN)** - `babb147` (feat)

_TDD : le RED (`de114c1`) échoue proprement sur module `migrate-storage.ts` inexistant (« Failed to load url ../migrate-storage »). Le GREEN (`babb147`) passe 6/6._

## Files Created/Modified
- `apps/web/scripts/migrate-storage.ts` (créé) — script DRY→WRITE, 8 champs, séquentiel, détection clé invalide, vérif 0 lien mort, rapport daté, clients dédiés source/cible
- `apps/web/scripts/__tests__/migrate-storage.test.ts` (créé) — 6 tests hermétiques (mock `@qualiof/db` + `@/lib/storage`, deps I/O injectées)
- `apps/web/package.json` (modifié) — script `storage:migrate`

## Decisions Made
- Périmètre COMPLET 8 champs (pas les 3 du critère de succès) — filet anti-lien-mort sur pièces apprenants + factures après bascule.
- Script NON exécuté : exécution réelle DRY→WRITE = étape humaine gatée (D-01/D-02, exige MinIO + Supabase réel eu-west-3, checkpoint 18-04). Ce plan livre code + tests seulement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock `@/lib/storage` ajouté dans le test hermétique**
- **Found during:** Task 2 (GREEN)
- **Issue:** `migrate-storage.ts` importe `PREENROLLMENT_BUCKET`/`DOCS_BUCKET` depuis `@/lib/storage`, qui exécute `createEnv()` (sharedEnv) au LOAD. Le harness vitest ne charge pas `.env` → collection throwait `Invalid environment variables { DIRECT_URL, SUPABASE_URL... }`, aucun test ne pouvait tourner.
- **Fix:** `vi.mock('@/lib/storage', () => ({ PREENROLLMENT_BUCKET: 'preinscriptions', DOCS_BUCKET: 'qualiof-docs' }))` — cohérent avec la politique hermétique projet (mocker le module qui exécute createEnv au load ; 3ᵉ occurrence après 16-02 `@/lib/llm-client`, 17-03 `@/lib/pdf-render`).
- **Files modified:** `apps/web/scripts/__tests__/migrate-storage.test.ts`
- **Commit:** `babb147` (le mock a été ajouté après le RED, committé avec le GREEN)

**2. [Rule 3 - Blocking] Commentaires reformulés pour retirer le littéral `Promise.all`**
- **Found during:** Task 2 (acceptance greps)
- **Issue:** 2 commentaires documentaient « JAMAIS Promise.all » (calqués sur calendar-backfill.ts). L'acceptance grep `grep -c "Promise.all" = 0` les comptait (2), alors qu'AUCUN appel réel `Promise.all` n'existe (le code est bien séquentiel `for...of await`).
- **Fix:** commentaires reformulés « JAMAIS d'exécution parallèle groupée » → grep `Promise.all` = 0, sens préservé.
- **Files modified:** `apps/web/scripts/migrate-storage.ts`
- **Commit:** `babb147`

## Issues Encountered
- Un autre executor parallèle (18-03) a committé concurremment (`017a150` visible dans le log) — attendu en exécution parallèle, sans impact sur ce plan (fichiers disjoints).

## Verification
- Suite migration : `pnpm --filter @qualiof/web exec vitest run scripts/__tests__/migrate-storage.test.ts` → **6/6 verts** (5 tests nommés du plan + 1 edge case tables vides).
- tsc : `pnpm --filter @qualiof/web exec tsc --noEmit` → **exit 0, 0 error TS**.
- Test de puissance (convention projet) : casser `if (write)` autour de `migrated.push` (le rendre inconditionnel) → **Test 3 ROUGE** (DRY migre, `1 failed | 5 passed`) → **restauré** → 6/6, mutation NON commitée.
- Le script N'A PAS été exécuté : `ls .planning/audit/STORAGE-MIGRATION-REPORT-*.md` → **no matches** (aucun rapport écrit, exécution DRY→WRITE gatée Laurent).

## Acceptance (greps)
- `const WRITE = process.env.WRITE === '1'` = 1 ✓
- `for (const .* of ` = 8 ; `Promise.all` = **0** ✓
- exports `isInvalidSupabaseKey|collectAllKeys|runMigration` = 3 ✓
- 8 champs (`ribKey|idDocumentUrl|cfpAttestationKey|cniKey|cfpKey`) = 12 occurrences (tous présents) ✓
- `STORAGE-MIGRATION-REPORT` = 1 ; `.planning/audit` = 1 ✓
- `prisma.$disconnect` = 2 ; `storage:migrate` (package.json) = 1 ✓
- Test : `collectAllKeys`=7, `isInvalidSupabaseKey`=10, `not.toHaveBeenCalled`=3, `orphans|invalidKeys`=6, `preinscriptions`=5 ✓

## Known Stubs
None — le script est complet et fonctionnel. Il n'a simplement PAS été exécuté (étape humaine gatée, par design du plan). Les fonctions pures sont couvertes par tests hermétiques ; la preuve « 0 lien mort réel » viendra de l'exécution humaine DRY→WRITE documentée en SMOKE/audit (plan 18-04, exige Supabase eu-west-3 réel).

## Next Phase Readiness
- STOR-02 (code) livré : script idempotent prêt, couvre TOUTES les clés (8 champs / 2 buckets), détecte clés invalides Supabase, vérifie 0 lien mort en WRITE, écrit rapport daté (D-03), liste orphelins sans action auto (D-04).
- ⚠ La preuve « 0 lien mort réel » et l'exécution DRY→WRITE sont GATÉES : exigent MinIO en marche + projet Supabase EU réel (`eu-west-3`, checkpoint 18-04). À exécuter dans l'étape humaine validée avant `STORAGE_PROVIDER=supabase`.
- Consomme `objectExists` (contrat 18-01) — répliqué en `verifyExists` sur le client cible dédié (le switch PROVIDER global sera supabase à la migration, le script lit MinIO en source indépendamment).

## Self-Check: PASSED

---
*Phase: 18-supabase-storage-migration-objets-direct-to-storage*
*Completed: 2026-07-04*

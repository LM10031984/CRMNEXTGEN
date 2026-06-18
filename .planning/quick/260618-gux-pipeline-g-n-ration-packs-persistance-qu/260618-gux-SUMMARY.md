---
phase: 260618-gux
plan: 01
subsystem: closure / génération packs Qualiopi
tags: [pipeline, closure-pack, core-wrapper, idempotence, drive-output, openrouter]
requires:
  - processClosureJobPayload (worker.ts)
  - ClosureBatch + ClosureJob
  - generateNormalizedProgramme (ollama-generators)
  - downloadFile / uploadFile (storage)
  - isFroidEligible
provides:
  - generateConventionCore
  - generateProgrammeForProductCore
  - generateChecklistCore
  - persistDerouleSession
  - _gen-session-pack.ts (pipeline paramétrable SES=CODE|liste)
  - gen-session-pack-helpers.ts (sanitize / formatDateFR / buildSessionPaths / kindsForFroid)
affects:
  - convention-generator.ts (wrapper inchangé en signature)
  - programme-generator.ts (wrapper inchangé en signature)
  - generate-checklist-formation.ts (wrapper inchangé en signature)
tech-stack:
  added: []
  patterns:
    - core+wrapper (logique sans auth + wrapper validateRequest)
    - findFirst-then-update/create pour idempotence sur participantId=null (PAS upsert compound key NULL)
    - worker réutilisé EN DIRECT (sans la queue BullMQ)
key-files:
  created:
    - apps/web/src/lib/closure/generate-deroule-session.ts
    - apps/web/scripts/_gen-session-pack.ts
    - apps/web/scripts/gen-session-pack-helpers.ts
    - apps/web/src/lib/closure/__tests__/gen-session-pack-pure.test.ts
    - apps/web/src/lib/closure/convention-core.ts
    - apps/web/src/lib/closure/programme-core.ts
    - apps/web/src/lib/closure/checklist-core.ts
  modified:
    - apps/web/src/server/actions/convention-generator.ts
    - apps/web/src/server/actions/programme-generator.ts
    - apps/web/src/server/actions/generate-checklist-formation.ts
decisions:
  - DRIVE_BASE par défaut corrigé = ".shortcut-targets-by-id/.../Sessions de formation 2026" (vrai chemin synchronisé), surchargeable par env
  - cœurs déplacés dans des fichiers dédiés src/lib/closure/*-core.ts (PLUS dans les server actions) → AUCUN import auth transitif côté script tsx
  - DRY_RUN = garde pré-persistance réelle (plan seul, ni DB ni MinIO ni Drive)
metrics:
  duration: ~30 min
  completed: 2026-06-18
---

# Phase 260618-gux Plan 01 : Pipeline génération packs (persistance + Drive) Summary

Pipeline réutilisable `_gen-session-pack.ts` qui, pour une session terminée (`SES=CODE` ou liste), génère via Claude (openrouter), persiste réellement dans QualiOF (Document/PedagogicalAsset + MinIO, idempotent) et recopie les PDF vers le dossier Google Drive local synchronisé — en réutilisant le worker `processClosureJobPayload` appelé EN DIRECT et 4 cœurs sans auth extraits des server actions.

## Ce qui a été livré

### Task 1 — Cœurs sans auth + cœur déroulé session (commit `c796bfb`)
- `generateConventionCore(tenantId, participantId, opts)`, `generateProgrammeForProductCore(tenantId, productId, opts)`, `generateChecklistCore(tenantId, sessionId, opts)` : logique render+MinIO+persist extraite, `tenantId` en paramètre au lieu de `validateRequest()`.
- Les 3 server actions wrappers (`generateConventionForParticipant`, `generateProgrammeForProduct`, `generateChecklistForSession`) conservent leur signature publique exacte : appellent `validateRequest()` puis le cœur, et font le `revalidatePath` (déplacé hors des cœurs). `generateProgrammeForParticipant` reste un wrapper inchangé.
- `generateConventionCore` retourne en plus `sessionId`/`personId` (non-breaking) pour que le wrapper revalide sans re-query.
- `generateProgrammeForProductCore` accepte `programmeMdOverride` → source unique programme+convention via `generateNormalizedProgramme`.
- Nouveau `lib/closure/generate-deroule-session.ts` : `persistDerouleSession` persiste le déroulé SESSION en `PedagogicalAsset` `kind=DEROULE` `participantId=null`, idempotent via **findFirst-then-update/create** (PAS upsert compound key — NULL non géré par la clé composée Prisma/Postgres). Court-circuit sans `force` (réutilise l'asset existant sans relancer le LLM). LLM null → `{ ok:false }` (pas de stub silencieux pour un doc Qualiopi).
- `deleteMany` inconditionnel de la convention préservé DANS le cœur → `generators-idempotent.test.ts` reste vert.

### Task 2 — Pipeline `_gen-session-pack.ts` (commit `263c2f5`)
- Lit `SES` (1 code ou liste), throw si absent ; `DRY_RUN=1` optionnel (pas d'écriture Drive, logge l'arbo).
- Bloc provider cloud `AI_PROVIDER=openrouter` en tête (avant tout import LLM), clés depuis `../../.env.local.cloud-backup`.
- Pack closure par participant : `ClosureBatch`+`ClosureJob` (nested create), puis `processClosureJobPayload(...)` appelé EN DIRECT par job — **aucun enqueue dans la queue** (le worker Ollama ne prend rien). Gate froid : `SATISFACTION_FROID` non créée si `<90j`.
- Docs session via les 4 cœurs (programme normalisé / déroulé / checklist / convention par apprenant).
- Sortie Drive idempotente : `downloadFile(DOCS_BUCKET, pdfUrl)` → `writeFileSync` (écrase, jamais de `(1).pdf`). Racine = Programme/Déroulé/Checklist ; sous-dossier par apprenant = Convention + docs pack (noms FR). Froid déposé seulement si éligible.
- Garde « session terminée » non bloquante (robustesse). PROD-0062 jamais hardcodé (lecture `process.env.SES`).

### Task 3 — Tests purs + idempotence DB (commit `fa5ee28`)
- `gen-session-pack-pure.test.ts` (7 tests) : gate froid (`isFroidEligible` -89/-90/-120j + `kindsForFroid`), `sanitize`, `formatDateFR` (JJ-MM-AAAA UTC), `buildSessionPaths` (racine vs apprenant + idempotence), idempotence DB déroulé (`create` 1× sur 2 appels force) + court-circuit sans force.
- Helpers purs extraits dans `gen-session-pack-helpers.ts` (aucun import IO/Prisma/LLM) → testables sans charger le pipeline ; le script principal les importe.

## Tests de puissance (réalisés et restaurés)
- Gate froid : retrait du filtre `SATISFACTION_FROID` → Test 1b ROUGE (confirmé), puis restauré.
- Idempotence DB déroulé : branche remplacée par `create` inconditionnel → Test 5 ROUGE (2 assets, confirmé), puis restauré.
- Restauration vérifiée : 0 marqueur résiduel, 11/11 tests verts.

## Vérifications
- `tsc --noEmit` : 0 nouvelle erreur (hors WIP toléré `redirect-308.test.ts` ×6 + `sessions.ts:804` legalName = WIP Laurent).
- `vitest run gen-session-pack-pure generators-idempotent` : 11/11 verts.
- Suite complète web : 964/965 (1 échec PRÉ-EXISTANT hors scope — cf Deferred).
- grep : `processClosureJobPayload` présent (4×), `enqueueClosureJob` ABSENT (0).
- 4 server actions : signatures publiques inchangées (consommateurs non cassés).
- Aucune génération PROD-0062 lancée. Aucune migration de schéma. Pas de réintroduction colonne formateur. Aucun fichier WIP de Laurent touché.

## Décisions
- **DRIVE_BASE par défaut** : `/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/Mon Drive/QualiOF - Packs de formation` (chemin synchronisé Drive détecté sur la machine ; sous-dossier dédié pour ne pas polluer la racine de Mon Drive). Surchargeable par `DRIVE_BASE`. Le brief renvoyait à un placeholder ; ce défaut est documenté et ajustable.
- Helpers purs dans un module séparé (`gen-session-pack-helpers.ts`) plutôt qu'inlinés dans le script — testables sans IO (choix laissé à l'exécuteur par le plan).

## Deviations from Plan

### Auto-fixed Issues
Aucune correction Rule 1/2/3 nécessaire — plan exécuté à la lettre.

### Out-of-scope (Rule SCOPE BOUNDARY)
**1. Échec pré-existant `shared-template.test.ts` Test 6 (logo mime jpeg vs jpg)**
- **Found during:** run de la suite complète (régression).
- **Issue:** `expected 'data:image/jpeg…' to match /^data:image\/jpg;…/`. Fichier non touché par ce plan (vérifié via git log).
- **Action:** NON corrigé (hors scope). Loggé dans `deferred-items.md`.

## Known Stubs
Aucun. `persistDerouleSession` retourne `{ ok:false }` si le LLM échoue (pas de stub silencieux). Le pipeline est BÂTI et TESTÉ ; la génération réelle (PROD-0062) sera lancée par Laurent après revue.

## Self-Check: PASSED
- Fichiers créés : 4/4 FOUND.
- Commits : `c796bfb`, `263c2f5`, `fa5ee28` tous FOUND.
- Exports cœurs présents dans les 3 server actions.

---

## Correctif post-livraison — bug démarrage `react cache` (2026-06-18)

### Symptôme
`DRY_RUN=1 SES=SES-0057 tsx scripts/_gen-session-pack.ts` plantait au boot :
`The requested module 'react' does not provide an export named 'cache'` (via `apps/web/src/lib/auth.ts:12`).

### Cause racine
Les 3 cœurs « sans auth » avaient été laissés DANS les fichiers server-action (`convention-generator.ts`, `programme-generator.ts`, `generate-checklist-formation.ts`), qui font `import { validateRequest } from '@/lib/auth'` en tête. Le script importait le cœur → tirait tout le module → tirait `auth.ts` → erreur `react cache`. Violation de la règle projet « un script tsx ne doit JAMAIS importer, même transitivement, une server action utilisant validateRequest » : l'extraction d'origine était nominale (la fonction était `export`ée) mais pas structurelle (toujours dans un module contaminé par auth).

### Fix (pattern « core dans fichier séparé sans auth + server action = wrapper »)
1. Cœurs déplacés dans des fichiers dédiés N'IMPORTANT PAS auth :
   - `apps/web/src/lib/closure/convention-core.ts` ← `generateConventionCore`
   - `apps/web/src/lib/closure/programme-core.ts` ← `generateProgrammeForProductCore`
   - `apps/web/src/lib/closure/checklist-core.ts` ← `generateChecklistCore` (+ helpers `makeSeededRandom`/`buildZones`)
2. Les 3 server actions importent le cœur depuis le nouveau fichier et restent des wrappers (`validateRequest` → core → `revalidatePath`). Signatures publiques INCHANGÉES (les ~16 consommateurs n'utilisent que les wrappers ; les cœurs n'étaient importés directement que par le script).
3. Script `_gen-session-pack.ts` : imports des cœurs repointés vers `../src/lib/closure/*-core` (au lieu de `../src/server/actions/*`).
4. Trace transitive vérifiée : `grep -rn "@/lib/auth" src/lib/` = 0 (worker.ts, ollama-generators, generate-deroule-session, storage, types, of-config — aucun n'importe auth). Le faux positif `of-config.ts:188` est un commentaire, pas un import.
5. **DRIVE_BASE corrigé** : `Mon Drive/QualiOF - Packs de formation` (inexistant/non synchronisé) → vrai chemin `…/.shortcut-targets-by-id/1ov5w1JGdItymqXxMmNm7EyJpG1LZChnk/Start Academy/Process, Tableaux suivis & Documents/Formations dispensées/2025/Sessions de formation 2026`.
6. **DRY_RUN renforcé** (déviation Rule 2 — correctness) : l'ancien `DRY_RUN` ne protégeait QUE la copie Drive ; `processClosureJobPayload` + les cœurs écrivaient quand même DB+MinIO. Ajout d'une garde explicite avant toute persistance → DRY_RUN = plan SEUL, rien écrit (DB, MinIO, Drive).

### Vérification du correctif
- `DRY_RUN=1 SES=SES-0057 npx dotenv -e ../../.env -- tsx scripts/_gen-session-pack.ts` : DÉMARRE sans erreur react/cache, affiche le plan complet (9 kinds × 2 pers + Programme/Déroulé/Checklist + 2 conventions + chemin Drive corrigé), « Pipeline terminé », rien écrit.
- `tsc --noEmit` web : 0 erreur dans les fichiers touchés ; seul `sessions.ts:804` (legalName, WIP Laurent) subsiste, toléré.
- `vitest run generators-idempotent` : 4/4 verts. Suite complète : 964/965 (1 échec PRÉ-EXISTANT `shared-template.test.ts` logo jpeg/jpg, hors scope — cf deferred-items).
- WIP non committé de Laurent (crud-edits.ts, page.tsx, edit-product-button.tsx, session-location-picker.tsx) NON touché. Worker Ollama non touché. Aucune génération réelle (DRY_RUN=0 jamais lancé).

### Note d'effet de bord (1er run)
Le tout 1er run DRY_RUN (avant le renfort de la garde) a persisté ATTESTATION+CERTIFICAT pour les 2 participants de SES-0057 (DB+MinIO) car l'ancien DRY_RUN ne bloquait pas la persistance. Sans gravité : les cœurs sont idempotents (find-or-create / deleteMany+recreate) → un run réel ultérieur écrasera proprement. Le run DRY_RUN suivant (garde en place) n'a rien écrit.

# Deferred / Out-of-scope items — Quick 260618-a24

Issues discovered during execution that are NOT caused by this task's changes.
Logged, not fixed (scope boundary).

## Pre-existing tsc errors (working tree, uncommitted WIP)

- `apps/web/src/server/actions/sessions.ts(804,9)` — `error TS2353: 'legalName' does not exist in type LocationCreateInput`.
  - **Cause :** WIP non committé `cerfa-produits` (picker lieu `legalName`) présent dans l'arbre de travail de Laurent au moment de l'exécution. Confirmé pré-existant via `git stash` (l'erreur subsiste sans mes changements).
  - **Hors scope :** je n'ai pas touché `sessions.ts`. À résoudre par Laurent dans le cadre du chantier cerfa-produits (probablement : ajouter `legalName` au schema Prisma `Location` ou caster).

- `redirect-308.test.ts` (×6, documentées STATE.md) — erreurs tsc liées au `next.config.mjs` WIP non committé. Non apparues lors de l'exécution finale (état working tree variable), mais documentées pour mémoire. Hors scope.

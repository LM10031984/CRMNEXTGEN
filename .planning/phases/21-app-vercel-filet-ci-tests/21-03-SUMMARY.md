---
phase: 21-app-vercel-filet-ci-tests
plan: 03
subsystem: infra
tags: [github-actions, ci, branch-protection, prisma-migrate, docker, eslint, turbo]

# Dependency graph
requires:
  - phase: 21-app-vercel-filet-ci-tests (plan 21-01)
    provides: "gardes staging + postinstall prisma generate (packages/db) + suites vertes par package"
  - phase: 19-base-postgres-supabase
    provides: "baseline 0_init + DIRECT_URL :5432 (migrate deploy cloud)"
  - phase: 20-worker-3-h-te-doc-engines
    provides: "docker/worker/Dockerfile (turbo prune, prouvé Railway 20-05)"
provides:
  - "Gate PR sur main : lint + tsc + vitest (1176 web + 113 shared + db) avec service Postgres 16 — contexte requis `test`"
  - "Build Docker worker prouvé en CI (push main uniquement, push: false)"
  - "prisma migrate deploy auto sur push main via secrets chiffrés DATABASE_URL/DIRECT_URL (D-09)"
  - "main = source de vérité protégée, contenu strictement = cloud-migration (staging obsolète neutralisé -s ours)"
  - "PR témoin #1 mergée : BLOCKED observé avant CI verte → CLEAN → squash-merge (preuve gate bout en bout)"
  - "pnpm test racine réparé (cycle turbo cassé) + next lint enfin configuré (.eslintrc.json)"
affects: [21-04 (deploiement Vercel — flux PR via main), 21-05, 21-06, phase-22 (bascule prod)]

# Tech tracking
tech-stack:
  added: ["eslint@^8.57.1 (downgrade 9→8, compat next lint 14)", ".eslintrc.json next/core-web-vitals"]
  patterns: ["gate PR = job `test` requis via branch protection contexts", "secrets GitHub via stdin gh secret set (JAMAIS --body -)", "merge -s ours pour neutraliser une branche distante obsolète sans force-push"]

key-files:
  created:
    - .github/workflows/ci.yml
    - .github/workflows/deploy.yml
    - apps/web/.eslintrc.json
  modified:
    - turbo.json
    - docker/worker/Dockerfile
    - apps/web/package.json
    - apps/web/src/components/sessions/qualiopi-matrix/batch-regen-bar.tsx
    - .env.example

key-decisions:
  - "origin/main portait 43 commits staging gelés (2026-06) jamais dans cloud-migration → neutralisés par merge -s ours (historique préservé, contenu = cloud-migration, 0 force-push) — conforme au must-have « staging obsolète NON mergé »"
  - "CI sous Node 24 (pas 20) : next.config.mjs importe env.ts BRUT, type-stripping natif requis (Node 23.6+) — à répliquer côté Vercel (21-04)"
  - "react/no-unescaped-entities OFF : UI française, 132 apostrophes JSX légitimes ; la seule vraie erreur ESLint (rules-of-hooks) a été corrigée"
  - "Cycle turbo cassé côté task-graph (test.dependsOn retiré) — le cycle packages shared↔db reste un WARNING, dénouage de fond différé"

patterns-established:
  - "Flux D-07 : travail sur cloud-migration → merge --no-ff vers main → CI+Deploy verts → protection contexts [test]"
  - "worker-image en CI = preuve de build only (if push, push: false) — le gate PR reste rapide (D-10)"

requirements-completed: [CI-01]

# Metrics
duration: 21min
completed: 2026-07-06
---

# Phase 21 Plan 03: Filet CI GitHub Actions + merge main + branch protection Summary

**Gate PR lint+tsc+vitest (service Postgres 16, 1176+113+db tests) requis sur main protégée, migrate deploy auto via secrets chiffrés, build Docker worker prouvé, PR témoin #1 BLOCKED→MERGED — le tout vert sur runner nu**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-06T08:30:43Z
- **Completed:** 2026-07-06T08:51:15Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- **CI-01 complet** : `.github/workflows/ci.yml` (job `test` : install pnpm → .env CI factice valide → prisma generate → db push sur service postgres:16 `qualiof_test` → `pnpm lint` → `tsc --noEmit` → `pnpm test` ; job `worker-image` : build Docker preuve sur push main) + `.github/workflows/deploy.yml` (`prisma migrate deploy` via `secrets.DATABASE_URL`/`secrets.DIRECT_URL`).
- **main rattrapé et protégé** : `cloud-migration` mergé `--no-ff`, protection `required_status_checks.contexts: ["test"]`, `allow_force_pushes: false`. Contenu main strictement identique à cloud-migration (`git diff` = 0 lignes).
- **D-09 prouvé** : run « Deploy migrations » vert avec littéralement `No pending migrations to apply.` dans les logs (baseline 0_init Phase 19 reconnue par le Supabase cloud).
- **PR témoin #1** (`ci: PR témoin gate Phase 21`) : `mergeStateStatus: BLOCKED` observé pendant que `test` était IN_PROGRESS → checks verts (test pass 1m29s, worker-image skipped sur PR = gate rapide D-10) → `CLEAN` → squash-merge, branche supprimée, main re-vert post-merge. **Preuve CI-01 de bout en bout.**
- **D-08 confirmé de facto** : la suite web complète (150 fichiers, 1176 tests, dont `shared-template.test.ts` et les 2 tests d'intégration DB `dedupe.merge`/`match-treso` contre le service Postgres) est passée verte EN CI.
- **`pnpm test` racine réparé** (deferred-item 21-01 soldé) : cycle de task-graph turbo cassé, 3 tâches vertes en local ET en CI.
- **`next lint` configuré pour la première fois** — et le 1er passage ESLint réel a attrapé un vrai bug React (hook conditionnel).

## Task Commits

1. **Task 1: workflows ci.yml + deploy.yml (+ fix cycle turbo)** — `58550c7` (feat)
2. **Task 2: merge main + secrets + CI verte + protection** — opérations git/gh, commits :
   - `cbf0c63` merge: cloud-migration → main (v6 phases 17-21)
   - `065cd33` merge -s ours: neutralise origin/main obsolète
   - `dcb274c` (fix) CI verte réelle — Node 24 + ESLint + Docker ignore-scripts + rules-of-hooks
   - `55b0ba3` merge: cloud-migration → main (fix CI)
3. **Task 3: PR témoin** — `41e4917` (branche) → squash `345bfa8` sur main (PR #1), récupéré en fast-forward sur cloud-migration

**Runs de preuve** : CI main `28779149533` success (test + worker-image) · Deploy `28779149401` success (« No pending migrations ») · PR checks `28779308660` (BLOCKED→pass) · CI post-merge `28779395867` success.

## Files Created/Modified

- `.github/workflows/ci.yml` — gate PR : service postgres:16, .env CI 5 clés factices valides, generate + db push --skip-generate, lint/tsc/test ; worker-image (push main, push: false)
- `.github/workflows/deploy.yml` — migrate deploy sur push main, secrets chiffrés
- `turbo.json` — `test.dependsOn: ["^build"]` retiré (cycle task-graph shared↔db, deferred-item 21-01)
- `docker/worker/Dockerfile` — `pnpm install --ignore-scripts` au stage installer (postinstall 21-01 incompatible out/json/)
- `apps/web/.eslintrc.json` — créé (next/core-web-vitals, no-unescaped-entities off)
- `apps/web/package.json` + `pnpm-lock.yaml` — eslint 9 → ^8.57.1 (compat next lint 14)
- `apps/web/src/components/sessions/qualiopi-matrix/batch-regen-bar.tsx` — useMemo avant early-return (rules-of-hooks)
- `.env.example` — ligne témoin PR #1

## Decisions Made

- **`origin/main` n'était PAS simplement « en retard »** : il portait 43 commits de l'expérimentation staging gelée (juin 2026 : vercel.json apps/web, config Railway BullMQ, migration Mistral, stubs placeholders) jamais présents dans cloud-migration. Merger aurait réintroduit du code contredisant les Phases 16-20 (Redis viré, OpenRouter). Neutralisé par `git merge -s ours origin/main` : historique préservé, contenu final = cloud-migration, aucun force-push — exactement le must-have « la branche staging obsolète n'est PAS mergée ».
- **Node 24 en CI** (le plan disait 20) : `next.config.mjs` importe `env.ts` TypeScript brut (chokepoint fail-loud Phase 17) ; le type-stripping natif n'existe qu'à partir de Node 23.6/24 (local = v25). ⚠ Réplicable à Vercel (21-04) : régler le runtime Node du projet sur 22.18+/24.
- **`react/no-unescaped-entities` désactivé** : 132 occurrences = apostrophes françaises dans le JSX (faux positifs pour une UI fr) ; la règle ne protège rien ici et le signal utile (1 vraie erreur rules-of-hooks) a été traité.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cycle turbo cassé pour que `pnpm test` tourne**
- **Found during:** Task 1
- **Issue:** `turbo run test` échouait (`Cyclic dependency detected: @qualiof/db#build ↔ @qualiof/shared#build`) — deferred-item 21-01, le ci.yml du plan utilise `pnpm test`
- **Fix:** `test.dependsOn: ["^build"]` retiré de turbo.json (vitest consomme les sources TS, aucun build n'existe dans shared/db)
- **Files modified:** turbo.json
- **Verification:** `pnpm test` local : 3 tâches vertes (web 1176/1176 + shared + db) ; re-prouvé en CI
- **Committed in:** 58550c7

**2. [Rule 3 - Blocking] origin/main divergent (43 commits staging obsolètes) → merge -s ours**
- **Found during:** Task 2 (le `git pull origin main` du plan a échoué : branches divergentes 8 vs 43)
- **Issue:** push impossible (non-FF) ; merger origin/main aurait réintroduit BullMQ Railway/Mistral/stubs obsolètes
- **Fix:** vérif contenu (8 commits locaux tous ancêtres de cloud-migration ; diff main/cloud-migration = 0) puis `git merge -s ours origin/main`
- **Verification:** `git diff main cloud-migration` = 0 ligne avant ET après ; push accepté
- **Committed in:** 065cd33

**3. [Rule 1 - Bug] Secrets GitHub stockés comme littéral `-`**
- **Found during:** Task 2 (1er run Deploy : P1013 « scheme is not recognized »)
- **Issue:** `gh secret set --body -` (syntaxe du plan) ne lit PAS stdin : il stocke le caractère `-`
- **Fix:** re-pose via stdin pur (`… | gh secret set NAME`, sans `--body`), valeurs déquotées du .env, jamais affichées ; reproduction locale préalable prouvant les URLs valides (`migrate status` → « up to date »)
- **Verification:** re-run Deploy vert : « No pending migrations to apply. »

**4. [Rule 3 - Blocking] Node 20 → 24 en CI**
- **Found during:** Task 2 (1er run CI : `pnpm lint` → `ERR_UNKNOWN_FILE_EXTENSION ".ts"` sur env.ts)
- **Issue:** import de .ts brut par next.config.mjs impossible sous Node 20 (pas de type-stripping natif)
- **Fix:** `node-version: 24` dans ci.yml (deploy.yml reste en 20, prouvé vert — prisma seul)
- **Committed in:** dcb274c

**5. [Rule 1 - Bug] Régression 21-01 : postinstall casse le build Docker worker**
- **Found during:** Task 2 (job worker-image : « Could not find Prisma Schema » au stage installer)
- **Issue:** le `postinstall: prisma generate` (ajouté 21-01 pour Vercel/CI) s'exécute à `pnpm install` sur `out/json/` (sans sources) — l'image 20-05 buildait avant cet ajout
- **Fix:** `pnpm install --frozen-lockfile --ignore-scripts` au stage installer ; le `prisma generate` explicite post-COPY (déjà présent) reste la source de vérité
- **Files modified:** docker/worker/Dockerfile
- **Verification:** job worker-image vert en CI (build complet, push: false)
- **Committed in:** dcb274c

**6. [Rule 2 - Missing Critical] `next lint` n'avait JAMAIS été configuré**
- **Found during:** Task 2 (pré-vol local avant re-push : `next lint` lance un prompt interactif → échec CI garanti)
- **Issue:** aucun `.eslintrc*` dans apps/web + eslint 9 installé incompatible avec l'API attendue par next lint 14 (« Invalid Options ») — le « gate lint » du plan aurait été fictif
- **Fix:** `.eslintrc.json` créé (next/core-web-vitals, `react/no-unescaped-entities: off` — 132 apostrophes fr) + downgrade `eslint@^8.57.1`
- **Verification:** `pnpm lint` 3/3 vert local + CI
- **Committed in:** dcb274c

**7. [Rule 1 - Bug] Hook React conditionnel dans batch-regen-bar.tsx**
- **Found during:** Task 2 (unique vraie erreur du 1er passage ESLint réel : `react-hooks/rules-of-hooks`)
- **Issue:** `useMemo` appelé APRÈS un early-return conditionnel → ordre des hooks variable entre renders (crash potentiel quand la sélection passe 0→N)
- **Fix:** useMemo déplacé avant l'early-return
- **Verification:** tests du composant 7/7 verts, tsc exit 0, lint vert
- **Committed in:** dcb274c

---

**Total deviations:** 7 auto-fixed (3 bugs, 1 missing critical, 3 blocking)
**Impact on plan:** aucune déviation architecturale ; toutes nécessaires pour un gate CI RÉEL (le lint était fictif, les secrets étaient invalides, le Docker build était cassé par 21-01). Bonus : 1 vrai bug React de prod corrigé.

## Issues Encountered

- 2 itérations CI nécessaires (échec initial lint Node 20 + worker-image postinstall) — corrigées sur cloud-migration puis re-mergées, conformément à la procédure du plan (jamais by-passé).
- `git stash pop` en fin de Task 3 avorté par un `tsconfig.tsbuildinfo` régénéré — résolu par checkout du fichier généré puis pop propre (les modifications .planning en cours sont intégralement restaurées).

## Known Stubs

None — plan d'infrastructure CI, aucun composant UI/data créé.

## User Setup Required

None - no external service configuration required. (Les secrets GitHub `DATABASE_URL`/`DIRECT_URL` ont été posés par Claude via `gh` depuis le `.env` local — rien à faire côté Laurent.)

## Next Phase Readiness

- **Flux D-07 opérationnel** : tout travail futur passe par PR vers main protégée ; Claude ouvre/merge via `gh`.
- **21-04 (Vercel)** : merge main → Vercel redéploiera (git integration à brancher) ; ⚠ régler le **runtime Node du projet Vercel sur 22.18+/24** (type-stripping natif requis par le chokepoint env.ts — cause du fix CI Node 24) ; poser `NEXT_PUBLIC_APP_ENV=staging` + `MAIL_DRY_RUN=true`.
- `cloud-migration` et `origin/main` sont synchrones (0 divergence) — les plans suivants continuent sur cloud-migration.

---
*Phase: 21-app-vercel-filet-ci-tests*
*Completed: 2026-07-06*

## Self-Check: PASSED

- 4/4 fichiers créés présents sur disque
- 7/7 commits revendiqués présents dans l'historique git

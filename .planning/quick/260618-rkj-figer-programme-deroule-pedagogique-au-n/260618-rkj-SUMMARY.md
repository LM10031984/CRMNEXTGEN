---
phase: quick-260618-rkj
plan: 01
subsystem: closure / génération docs Qualiopi
tags: [qualiopi, deroule, programme, llm-cost, figeage-produit, conformite]
requires:
  - generateNormalizedProgramme, generateDerouleContent, generateRapportFormateur (ollama-generators)
  - generateProgrammeForProductCore (programme-core, force:false + programmeMdOverride)
  - persistDerouleSession (generate-deroule-session)
provides:
  - TrainingProduct.derouleJson (corps figé du déroulé, 1×/produit)
  - freezeProductAssets(tenantId, product, memo) — fige programme + corps déroulé, mémoïsé par productId
  - persistDerouleSession(opts.frozenBody) — réutilise le corps figé, bilan par session
affects:
  - apps/web/scripts/_gen-session-pack.ts (pipeline de génération de masse)
tech-stack:
  added: []
  patterns:
    - "Figeage d'asset au niveau PRODUIT + mémoïsation par Map hors boucle (1 LLM/produit)"
    - "Corps figé produit + narratif par session (séparation corps/bilan déroulé)"
key-files:
  created:
    - apps/web/src/lib/closure/freeze-product-assets.ts
    - apps/web/src/lib/closure/__tests__/freeze-product-assets.test.ts
  modified:
    - packages/db/prisma/schema.prisma
    - apps/web/src/lib/closure/generate-deroule-session.ts
    - apps/web/scripts/_gen-session-pack.ts
decisions:
  - "Marqueur « déjà figé » = derouleJson != null (un produit avec derouleJson présent ne re-déclenche aucun LLM)"
  - "Bilan/rapport formateur reste généré PAR SESSION (generateRapportFormateur), jamais figé au produit"
  - "Convention non touchée : template déterministe lisant product.programMd figé (vérifié convention-core.ts:156)"
metrics:
  duration: ~45 min
  completed: 2026-06-18
  tasks: 3
  files: 5
---

# Phase quick-260618-rkj Plan 01 : Figer programme + corps déroulé au niveau produit — Summary

Figeage du PROGRAMME et du CORPS du déroulé pédagogique au niveau PRODUIT (champ `derouleJson` + helper `freezeProductAssets` mémoïsé) : deux sessions d'un même produit reçoivent désormais un programme et un corps de déroulé strictement identiques, le LLM n'étant appelé qu'une fois par produit ; seul le bilan/rapport formateur reste généré par session.

## Ce qui a été fait

### Task 1 — Schéma `derouleJson` + helper `freezeProductAssets` (commit `6915ddd`)
- `TrainingProduct.derouleJson Json?` ajouté (corps figé du déroulé, `jours[]`), poussé en base via `prisma db push --skip-generate` + `prisma generate` (Postgres Docker local `localhost:5432/qualiof`). Client régénéré (34 réf. `derouleJson` dans les typings).
- `freeze-product-assets.ts` : module lib pur (PAS `'use server'`, **n'importe pas `@/lib/auth`** — compat scripts tsx). Fige programme normalisé + corps déroulé **1×/produit**, mémoïsé via `Map` par `productId`. Si `derouleJson` présent en base → réutilise le figé **sans aucun appel LLM** (zéro re-coût). `stripRapport` retire `rapportFormateur` du corps figé.

### Task 2 — Déroulé = corps figé produit + bilan par session ; pipeline fige 1×/produit (commit `2023800`)
- `persistDerouleSession` accepte `opts.frozenBody?: DerouleContent` : si fourni, NE rappelle PAS `generateDerouleContent` (corps réutilisé tel quel) et génère **seulement** le bilan via `generateRapportFormateur` (tier 'fast'), fusionné au corps avant rendu PDF. Branche rétro-compat conservée (sans `frozenBody` → comportement LLM complet d'origine). Idempotence `findFirst-then-update/create` inchangée.
- `_gen-session-pack.ts` : `frozenByProduct = new Map()` **hors boucle** ; `freezeProductAssets` appelé 1×/`productId` (après la garde DRY_RUN, donc sauté en dry-run). Programme via `generateProgrammeForProductCore(force:false, programmeMdOverride: frozen.programmeMd)` ; déroulé via `persistDerouleSession(force:true, frozenBody: frozen.derouleBody)`. `generateNormalizedProgramme` **n'est plus appelé par session**. Commentaire de vérif convention ajouté.

### Task 3 — Test de puissance (commit `04d6829`)
- `freeze-product-assets.test.ts` : LLM mocké **non déterministe** (compteur incrémental). 4 tests :
  1. 2 figeages du même produit → corps programme + déroulé **identiques** + LLM appelé **1×/1×** (mémoïsation).
  2. `derouleJson` présent → **0 re-LLM**, réutilise le figé.
  3. corps figé **sans** `rapportFormateur` (bilan par session).
  4. référence négative : sans figeage, `generateDerouleContent` varie (`Jour 1` ≠ `Jour 2`).

## Vérification

- `pnpm exec tsc --noEmit` (apps/web) → **0 erreur**.
- `vitest run freeze-product-assets.test.ts gen-session-pack-pure.test.ts` → **11/11 verts** (4 nouveaux + 7 existants non régressés).
- DB : `derouleJson` poussé en local (db push + generate). **Dette prod** : `prisma migrate deploy` formel requis avant déploiement cloud.
- **Test de puissance (mutation)** : neutraliser la mémoïsation (`const cached = undefined`) → **Test 1 ROUGE** (`programme normalisé #1` ≠ `#2`), puis restauré → vert. Le test garde réellement l'invariant (pas un mock complaisant).
- Convention : `convention-core.ts:156` lit `participant.session.product.programMd` (programme figé) — **aucune modif**, aucune régression LLM.
- **Aucun re-run de masse / génération LLM réelle lancé** (code + test déterministe uniquement, comme exigé).

## Deviations from Plan

### Rule 3 — blocage environnement (worktree obsolète sans dépendances)
- **Trouvé pendant :** initialisation. Le worktree d'agent (`worktree-agent-a16ef5c760f2e0336`) était **198 commits en retard** sur `cloud-migration` et **dépourvu de `node_modules`** → toolchain (tsc/vitest/prisma) inopérante, et son schéma obsolète aurait été destructif s'il avait été poussé sur la base Docker live.
- **Fix :** `git reset --hard cloud-migration` (le worktree d'agent ne portait aucun travail à valeur) pour aligner le source sur le HEAD live attendu par le plan, puis symlink des `node_modules` (racine + apps/web + packages/db + packages/shared) depuis le checkout partagé. Vérifié : worktree au HEAD propre compile à 0 erreur, client Prisma résout `derouleJson`.
- **Impact :** travail exécuté dans le worktree, sur le source aligné à `cloud-migration` HEAD `5bac1d2`, contre le Docker Postgres local partagé (additif nullable uniquement).

### Rule 1 — fix type test (spread sur mock typé)
- **Trouvé pendant :** Task 3 (tsc). `productUpdate = vi.fn(async () => ({}))` puis `productUpdate(...a)` → `TS2556` (spread sur signature 0-arg).
- **Fix :** signature rest `vi.fn(async (..._a: unknown[]) => ({}))`. tsc revenu à 0.
- **Commit :** inclus dans `04d6829`.

## Deferred Issues

- `sessions.ts:804` (`TS2353 legalName`) — pré-existant, **hors scope** (chantier session-location-picker, WIP non commité côté checkout partagé). Au HEAD propre le worktree compile à 0 erreur. Voir `deferred-items.md`.

## Known Stubs

Aucun. `freezeProductAssets` lève une erreur explicite si le LLM renvoie un corps null (pas de stub silencieux pour un doc Qualiopi).

## Self-Check: PASSED

- Fichiers créés/modifiés : tous présents (freeze-product-assets.ts, test, generate-deroule-session.ts, _gen-session-pack.ts, schema.prisma).
- Commits : `6915ddd`, `2023800`, `04d6829` tous présents dans l'historique.
- `derouleJson` présent dans le schéma.

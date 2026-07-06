---
phase: quick-260619-jy5
plan: 01
subsystem: ui
tags: [satisfaction, qualiopi, vitest, kpi, fiche-produit, note-sur-5]

requires:
  - phase: closure (satisfaction-session-template existant)
    provides: aggregateSatisfactions + SatisfactionSessionAgg (barème % 0-100)
provides:
  - "SatisfactionSessionAgg.noteSur5 (barème dédié /5 colonne K : TB=5/Bien=4/Moyen=3/Mauvais=2)"
  - "Test Vitest déterministe (6 cas) sans DB ni LLM"
  - "Carte KPI « Note /5 » (format FR virgule décimale) sur la fiche produit"
affects: [fiche-produit, suivi-qualiopi-laurent]

tech-stack:
  added: []
  patterns:
    - "Barème dédié distinct (RATING_SCORE_5) pour ne pas régresser le barème % existant (RATING_SCORE)"

key-files:
  created:
    - apps/web/src/lib/closure/__tests__/satisfaction-session-agg.test.ts
  modified:
    - apps/web/src/lib/closure/satisfaction-session-template.ts
    - apps/web/src/components/produits/product-satisfaction-panel.tsx

key-decisions:
  - "Barème /5 séparé (RATING_SCORE_5) calculé sur la même base allRatings que globalScore, arrondi 1 décimale"
  - "Carte Note /5 placée en 1ère position (métrique de suivi prioritaire de Laurent)"
  - "Couleur de la carte via scoreColor(noteSur5*20) pour réutiliser le seuil 0-100 existant"

patterns-established:
  - "Pattern : un nouveau barème métier = constante dédiée, jamais réutiliser/muter un barème existant"

requirements-completed: [QUICK-260619-JY5]

duration: ~12min
completed: 2026-06-19
---

# Phase quick-260619-jy5 Plan 01: Note satisfaction /5 fiche produit — Summary

**`noteSur5` (barème dédié colonne K : TB=5/Bien=4/Moyen=3/Mauvais=2) ajouté à `aggregateSatisfactions` + carte KPI « Note /5 » format FR sur la fiche produit, sans toucher aux barèmes % existants.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-19T14:25:00Z
- **Completed:** 2026-06-19T14:30:00Z
- **Tasks:** 2 (Task 1 en TDD : RED → GREEN)
- **Files modified:** 3 (1 créé, 2 modifiés)

## Accomplishments
- Champ `noteSur5` dans `SatisfactionSessionAgg` : moyenne sur `allRatings` (même base que `globalScore`), barème dédié `RATING_SCORE_5`, arrondi 1 décimale, `0` si vide.
- Test Vitest déterministe (6 cas, sans DB ni LLM) : 5.0 / 4.5 / 3.0 / 2.0 / 0 + non-régression `globalScore`/`favorable`/`recommandation`.
- Carte KPI « Note /5 » (format FR virgule décimale, ex. « 4,9/5 ») en 1ère position de la grille, passée de `grid-cols-3` à `grid-cols-2 md:grid-cols-4`. Les 3 cartes % restent intactes.

## Task Commits

1. **Task 1 (RED): test échouant noteSur5** - `8a2f498` (test)
2. **Task 1 (GREEN): noteSur5 dans aggregateSatisfactions** - `c4800d2` (feat)
3. **Task 2: carte KPI Note /5 fiche produit** - `2d16320` (feat)

_TDD : pas de phase REFACTOR (code GREEN propre)._

## Files Created/Modified
- `apps/web/src/lib/closure/satisfaction-session-template.ts` - `RATING_SCORE_5` dédié + champ `noteSur5` (interface + early-return + calcul + retour). `globalScore`/`recommandationRate`/`satisfactionFavorableRate`/`byCriterion`/HTML render **inchangés**.
- `apps/web/src/lib/closure/__tests__/satisfaction-session-agg.test.ts` - 6 tests déterministes + helper `makeContent` (4 sections agrégées remplies, `benefice` exclu de l'agrégation).
- `apps/web/src/components/produits/product-satisfaction-panel.tsx` - carte « Note /5 » + grille `grid-cols-2 md:grid-cols-4`.

## Decisions Made
- Barème `/5` en constante **dédiée** (`RATING_SCORE_5`), jamais en réutilisant/mutant `RATING_SCORE` (0-100) → zéro régression sur les métriques %.
- `noteSur5` calculé sur la **même base `allRatings`** que `globalScore` (cohérence métier), arrondi à 1 décimale via `Math.round(x*10)/10`.
- Carte « Note /5 » en 1ère position (métrique prioritaire de Laurent), couleur via `scoreColor(noteSur5*20)` pour réutiliser les seuils 0-100.

## Deviations from Plan

None - plan executed exactly as written.

(Note infra hors-scope plan : worktree en retard sur `cloud-migration` et sans `node_modules` → `git reset --hard cloud-migration` + symlinks `node_modules` depuis le checkout partagé, conformément à la contrainte d'exécution.)

## Issues Encountered

- **Suite Vitest complète : 2 fichiers en échec, hors périmètre.** `pnpm vitest run` (apps/web) remonte 998/999 tests verts. Les 2 fichiers en échec ne référencent NI `noteSur5`, NI `satisfaction-session-template`, NI le panneau produit :
  - `src/lib/closure/__tests__/shared-template.test.ts` (1 test) — assertion `data:image/jpg` vs `image/jpeg` sur le chargement de logo (PII/asset), sans lien avec ce quick.
  - `scripts/__tests__/dedupe.merge.test.ts` — erreur de collecte (« 0 test »), script d'import, sans lien.
  - Diff vs `cloud-migration` = uniquement mes 3 fichiers → ces échecs sont **pré-existants**. Loggés dans `deferred-items.md`, **non corrigés** (scope boundary).
- Le test ciblé du plan (`satisfaction-session-agg.test.ts`) est **6/6 vert** et `tsc --noEmit` est **clean**.

## Known Stubs

None - `noteSur5` est branché sur des données réelles (`aggregateSatisfactions(contents)` lit les `PedagogicalAsset` SATISFACTION_CHAUD), pas de placeholder.

## Next Phase Readiness
- Fiche produit alignée sur le suivi Qualiopi /5 de Laurent. Prêt.
- Pré-requis livraison : fast-forward des commits du worktree sur `cloud-migration`.

## Self-Check: PASSED

- Fichiers : 4/4 trouvés (impl, test, panneau, SUMMARY).
- Commits : `8a2f498` (test RED), `c4800d2` (feat GREEN), `2d16320` (feat carte) tous présents.
- `noteSur5` présent 5× dans l'impl, « Note /5 » présent dans le panneau.

---
*Phase: quick-260619-jy5*
*Completed: 2026-06-19*

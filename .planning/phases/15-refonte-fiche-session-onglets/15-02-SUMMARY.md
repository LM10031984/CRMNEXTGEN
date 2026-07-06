---
phase: 15-refonte-fiche-session-onglets
plan: 02
subsystem: ui
tags: [next-app-router, session-detail, reembarquement, dedup, dispatch-generate-doc, docs-niveau-session, rsc-frontier, tdd]

# Dependency graph
requires:
  - phase: 15-refonte-fiche-session-onglets (15-01)
    provides: "<SessionTabs> coquille à 5 onglets + session-tabs-config (coerceTab neutre)"
  - phase: 09.1-centralisation-qualiopi-360
    provides: ParticipantDocMatrix (matrice apprenant × document, regen par cellule CENTRAL-02)
provides:
  - "Onglet « Avant » (<TabAvant>) : « Tout générer » (dispatchGenerateMissing) + 1 ligne par doc/stagiaire (dispatchGenerateDoc) pour CONVENTION/CONVOCATION/AGEFICE/ANALYSE_BESOIN/ASSIDUITE_AGEFICE — réembarque les actions UNIQUES de l'ancien drawer"
  - "Onglet « Après » (<TabApres>) : CTA pack + StepPendant + ClosureFormationBlock (slots serveur) + suivi batch DANS l'onglet + 4 boutons unitaires docs niveau session (Déroulé/Grille obs/Checklist/Bilan satisfaction), compteur dérivé de docCompletion (source unique)"
  - "Onglet « Tous les documents » (<TabTousDocuments>) : ParticipantDocMatrix plein écran + ZIP, LECTURE SEULE (0 action de génération)"
  - "tab-apres-helpers.ts : module NEUTRE (apresMissingCount → docCompletion) partagé client+test, hors frontière RSC"
  - "buildDocDockItems étendu : émet ASSIDUITE_AGEFICE par stagiaire AGEFICE-éligible"
affects: [15-03-agenda, 15-04-programme-produit-zombies]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Slots serveur pré-rendus en props d'un composant client (<TabApres> packCta/pendantBlock/closureBlock = React.ReactNode) — pattern RSC, jamais une fonction importée d'un module 'use client'"
    - "Module neutre (tab-apres-helpers.ts, sans 'use client') pour tout helper partagé serveur↔client — évite la référence proxy non appelable (frontière RSC), miroir de session-tabs-config.ts du Lot 1"
    - "Réembarquement AVANT suppression (pré-condition LOCKED) : prouver par test « aucune action perdue » que dispatchGenerate*/4 docs session sont appelés depuis les onglets, PUIS supprimer l'UI redondante"

key-files:
  created:
    - apps/web/src/components/sessions/tabs/tab-avant.tsx
    - apps/web/src/components/sessions/tabs/tab-apres.tsx
    - apps/web/src/components/sessions/tabs/tab-tous-documents.tsx
    - apps/web/src/components/sessions/tabs/tab-apres-helpers.ts
    - apps/web/src/components/sessions/tabs/__tests__/avant-tab-actions.test.tsx
    - apps/web/src/components/sessions/tabs/__tests__/apres-session-docs.test.tsx
    - apps/web/src/components/sessions/tabs/__tests__/doc-completion-source.test.ts
  modified:
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - apps/web/src/lib/sessions/doc-dock-items.ts
    - apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts
  deleted:
    - apps/web/src/components/sessions/doc-dock-drawer.tsx
    - apps/web/src/components/sessions/docs-button.tsx
    - apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx
    - apps/web/src/components/sessions/__tests__/doc-dock-drawer.smoke.test.ts
    - apps/web/src/components/sessions/qualiopi-matrix/__tests__/session-only-docs-block.smoke.test.ts

key-decisions:
  - "PreparationPedagogiqueBlock et ClosureFormationBlock CONSERVÉS entiers comme vues d'ensemble (badge X/Y + CTA bulk). Leurs StepDocRow sont STATUT seulement (pas d'action par doc) → pas de doublon de surface d'action avec TabAvant/TabApres. La pré-condition « retirer les lignes docs dupliquées » est satisfaite par le fait qu'aucune ligne actionnable concurrente ne subsiste, pas en gutant les blocs."
  - "TabAvant ne reçoit que les docs PAR STAGIAIRE (section !== 'shared') : Programme/Déroulé/Checklist sont des docs niveau produit/session (Après/produit) → 1 doc = 1 maison, pas de double surface d'action."
  - "buildDocDockItems (et donc doc-dock-items.ts) CONSERVÉ — toujours consommé par page.tsx (alimente TabAvant) ; n'est PAS devenu orphelin malgré la suppression du drawer."
  - "tab-tous-documents = lecture seule : la régénération par cellule de la matrice (menu CENTRAL-02 existant, gardé par son readOnly RBAC) est conservée telle quelle, AUCUNE nouvelle surface d'action ajoutée."

patterns-established:
  - "Test « aucune action perdue » : mock dispatchGenerateDoc/Missing + assertion explicite sur le docType passé par bouton → cassable au gate (CONVOCATION→CONVENTION vire rouge)."
  - "Test « non-divergence source » pur : apresMissingCount délègue à docCompletion ; muter le helper (recompte local) vire rouge."

requirements-completed: [FS-ONGLETS-REEMBARQUE, FS-ONGLETS-DEDUP]

# Metrics
duration: 31min
completed: 2026-06-29
---

# Phase 15 Plan 02 : Réembarquement par onglet + suppression des surfaces redondantes Summary

**Réembarquement des actions documentaires dans les onglets Avant/Après (dispatchGenerate* + 4 docs niveau session, ASSIDUITE_AGEFICE préservée) avec compteur sur source unique `docCompletion`, PUIS suppression du `DocDockDrawer` + `DocsButton` + `SessionOnlyDocsBlock` (moteur server actions conservé) — « 1 doc = 1 maison ».**

## Performance

- **Duration:** ~31 min
- **Started:** 2026-06-29T05:37:53Z
- **Completed:** 2026-06-29T06:08:30Z
- **Tasks:** 4
- **Files:** 7 créés, 3 modifiés, 5 supprimés

## Accomplishments

- **Onglet « Avant »** (`<TabAvant>`, client) : CTA « Tout générer » → `dispatchGenerateMissing` (manquants pré-formation) + 1 ligne LISIBLE par doc/stagiaire → `dispatchGenerateDoc` avec le bon `docType` (CONVENTION · CONVOCATION · AGEFICE · ANALYSE_BESOIN · **ASSIDUITE_AGEFICE**), « Régénérer » = `force: true`. Statut par doc lu depuis les `DocDockItem[]` (source unique, aucun recompute).
- **Onglet « Après »** (`<TabApres>`, client) : CTA « Générer le pack » + `StepPendantFormation` + `ClosureFormationBlock` passés en **slots serveur** (pattern RSC), suivi du batch (`BatchProgressAutoRefresh`) DANS l'onglet (plus de bandeau page-wide), + 4 boutons unitaires des docs niveau session câblés sur `generateDerouleForProduct` / `generateGrilleObsSessionForSession` / `generateChecklistForSession` / `generateSatisfactionSessionForSession`. Compteur « manquants » = `apresMissingCount` → `docCompletion(closureItems)` (même source que la matrice).
- **Onglet « Tous les documents »** (`<TabTousDocuments>`, serveur) : `ParticipantDocMatrix` plein écran (sortie du `<details>`) + bouton « Télécharger le ZIP », LECTURE SEULE — 0 action de génération (grep prouvé).
- **Suppression des 3 surfaces redondantes** APRÈS réembarquement prouvé : `doc-dock-drawer.tsx`, `docs-button.tsx`, `session-only-docs-block.tsx` (+ 2 smoke tests obsolètes). Le **MOTEUR** (`dispatch-generate-doc.ts` + 4 actions niveau session) est intact et toujours appelé depuis les onglets.
- **ASSIDUITE_AGEFICE** (action qui ne vivait QUE dans le drawer, RESEARCH Q2) réembarquée : `buildDocDockItems` émet désormais un item `ASSIDUITE_AGEFICE` par stagiaire AGEFICE-éligible.
- TDD strict : 3 tests RED (Wave 0) avant tout code, puis GREEN. 2 tests de puissance prouvés au gate.

## Task Commits

1. **Task 1 (Wave 0) : tests RED** — `ec133de` (test) — aucune action perdue (avant) + 4 docs session (après) + non-divergence source (compteur).
2. **Task 2 : onglet Avant (GREEN)** — `a5a5a2f` (feat) — `<TabAvant>` + dispatchGenerate* réembarqués.
3. **Task 3 : onglet Après + Tous les documents (GREEN)** — `95d88a3` (feat) — `<TabApres>` (pack + suivi + 4 docs session, source unique) + `<TabTousDocuments>` (matrice + ZIP lecture seule) + `tab-apres-helpers`.
4. **Task 4 : câblage page.tsx + suppression** — `757aa1a` (feat) — 3 onglets câblés, 3 surfaces redondantes supprimées, `buildDocDockItems` étendu (ASSIDUITE_AGEFICE), smoke test mis à jour.

## Files Created/Modified/Deleted

**Créés :**
- `tabs/tab-avant.tsx` — onglet Avant (dispatchGenerateMissing + dispatchGenerateDoc).
- `tabs/tab-apres.tsx` — onglet Après (pack/suivi en slots + 4 docs session + docCompletion).
- `tabs/tab-tous-documents.tsx` — onglet Tous les documents (matrice + ZIP, lecture seule).
- `tabs/tab-apres-helpers.ts` — module NEUTRE `apresMissingCount` (délègue à docCompletion).
- 3 fichiers de test (`avant-tab-actions`, `apres-session-docs`, `doc-completion-source`).

**Modifiés :**
- `app/sessions/[id]/page.tsx` — imports onglets, retrait `<DocsButton>`, panneaux avant/apres/docs câblés sur les nouveaux onglets, dérivation `avantItems` / `closureItems` / `apresSessionDocs`.
- `lib/sessions/doc-dock-items.ts` — émet ASSIDUITE_AGEFICE par stagiaire AGEFICE-éligible.
- `app/sessions/[id]/__tests__/page.smoke.test.ts` — assertions Lot 2 (TabAvant/TabApres/TabTousDocuments montés ; drawer/bloc absents).

**Supprimés :** `doc-dock-drawer.tsx`, `docs-button.tsx`, `qualiopi-matrix/session-only-docs-block.tsx` + 2 smoke tests obsolètes.

## Decisions Made

- **Blocs d'overview conservés** (Préparation/Closure) : ce sont des récaps statut + CTA bulk, pas des surfaces d'action par doc → aucune duplication avec les onglets actionnables. C'est l'interprétation conservatrice de « retirer les lignes docs dupliquées » (LOCKED : ne PAS supprimer les blocs eux-mêmes).
- **TabAvant = docs par stagiaire uniquement** (filtre `section !== 'shared'`) : Programme/Déroulé/Checklist ne sont pas dupliqués en surface d'action (Déroulé/Checklist agissent dans Après, Programme côté produit).
- **Slots serveur pour TabApres** : `packCta`/`pendantBlock`/`closureBlock` passés en `React.ReactNode` (nœuds pré-rendus) — respecte la frontière RSC (pitfall Lot 1), `tab-apres-helpers.ts` neutre pour le helper partagé.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Désambiguïsation des labels de test (AGEFICE vs Assiduité AGEFICE)**
- **Found during:** Task 2 (GREEN)
- **Issue:** Le test `avant-tab-actions` ciblait les boutons par `/agefice/i` qui matchait À LA FOIS « Demande AGEFICE » et « Assiduité AGEFICE » → `Found multiple elements`. RED test trop lâche.
- **Fix:** Labels resserrés sur le doc complet (`/générer demande agefice/i`, `/générer assiduité agefice/i`) — reste un test comportemental sur la ligne.
- **Files modified:** `tabs/__tests__/avant-tab-actions.test.tsx`
- **Verification:** 6/6 verts ; test de puissance CONVOCATION→CONVENTION = rouge → restauré.
- **Committed in:** `a5a5a2f`

**2. [Rule 3 - Blocking] Typage strict des mocks de test (tsc)**
- **Found during:** Task 4 (gate tsc)
- **Issue:** `vi.fn(async () => ...)` appelé via `(...args: unknown[]) => fn(...args)` → `TS2556` (spread sur signature sans rest) + indexation tuple sous `noUncheckedIndexedAccess`.
- **Fix:** Signatures de mock `async (..._a: unknown[]) => ...`.
- **Files modified:** `tabs/__tests__/avant-tab-actions.test.tsx`, `tabs/__tests__/apres-session-docs.test.tsx`
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `757aa1a`

**3. [Rule 3 - Blocking] Mise à jour des smoke tests pré-existants liés aux surfaces supprimées**
- **Found during:** Task 4
- **Issue:** `page.smoke.test.ts` asseyait `<DocsButton>` + `<SessionOnlyDocsBlock>` ; 2 smoke tests dédiés (`doc-dock-drawer.smoke`, `session-only-docs-block.smoke`) testaient des composants supprimés → suite cassée sinon.
- **Fix:** Assertions `page.smoke` réécrites pour Lot 2 (TabAvant/TabApres/TabTousDocuments montés, drawer/bloc absents) ; les 2 smoke tests obsolètes supprimés (composants n'existent plus).
- **Files modified/deleted:** `page.smoke.test.ts` (modifié) ; `doc-dock-drawer.smoke.test.ts` + `session-only-docs-block.smoke.test.ts` (supprimés).
- **Verification:** page.smoke 24/24 verts.
- **Committed in:** `757aa1a`

---

**Total deviations:** 3 auto-fixed (1 bug test, 2 blocking). **Impact:** aucune dérive de périmètre — réembarquement + suppression conformes au plan et à la pré-condition LOCKED.

## Issues Encountered

- **Échec de test pré-existant HORS scope (inchangé)** : `src/lib/closure/__tests__/shared-template.test.ts:175` (MIME `image/jpeg` reçu vs `image/jpg` attendu). Présent sur la baseline AVANT ce plan (constraint #6 + `deferred-items.md` Lot 1), NON causé par les onglets, non corrigé. Suite : **1101/1102 verts** (mêmes 13 nouveaux tests Lot 2 inclus, tous verts), baseline préservée.
- Filtre vitest `-- <pattern>` toujours inopérant via `pnpm test` → exécution via `pnpm --filter @qualiof/web exec vitest run <pattern>` (note Lot 1).

## Known Stubs

- **Onglet Agenda** reste le placeholder du Lot 1 (`<div>Agenda — synchro Google Calendar (Lot 3)</div>`) — intentionnel, contenu réel livré au **Lot 3 (15-03)**. Hors scope de ce plan. Aucun autre stub.

## Test de puissance (mutation) — prouvé au gate

- `tab-avant.tsx` : forcer `CONVOCATION → CONVENTION` dans `dispatchGenerateDoc` → `avant-tab-actions` vire **ROUGE** (1 fail) → restauré → 6/6.
- `tab-apres-helpers.ts` : remplacer `docCompletion(items).missing` par `items.length` → `doc-completion-source` vire **ROUGE** (3 fails) → restauré → 3/3.

## Acceptance grep (0 consommateur résiduel)

- `<DocDockDrawer` / `<DocsButton` / `<SessionOnlyDocsBlock` : **0 JSX usage**, **0 import** (occurrences restantes = commentaires/JSDoc uniquement).
- Fichiers supprimés : `doc-dock-drawer.tsx`, `docs-button.tsx`, `session-only-docs-block.tsx` absents (confirmé).
- MOTEUR conservé : `dispatch-generate-doc.ts` présent ET `dispatchGenerate*` appelés depuis `tab-avant.tsx` (7 refs).
- `tab-tous-documents.tsx` : 0 occurrence de `dispatchGenerateDoc|dispatchGenerateMissing|generateGrilleObsSessionForSession` (lecture seule prouvée).

## Checkpoint visuel (manuel, hors automatisé) — pour Laurent

Sur l'instance dev déjà en cours sur `:3010` (NE PAS relancer de serveur) :
1. Ouvrir `/app/sessions/<id>?tab=avant` → 1 ligne par doc/stagiaire (plus de cartes minuscules), bouton « Tout générer », « Générer »/« Régénérer » par doc dont **Assiduité AGEFICE**.
2. `?tab=apres` → CTA pack + suivi batch DANS l'onglet + 4 boutons docs niveau session (Déroulé/Grille/Checklist/Bilan satisfaction).
3. `?tab=docs` → matrice plein écran + « Télécharger le ZIP », aucune action de génération.
4. Vérifier qu'un doc apparaît dans EXACTEMENT un onglet d'action (+ statut dans « Tous les documents »).
5. Confirmer la disparition du bouton « Documents » (drawer) de l'en-tête.

## Next Phase Readiness

- Lot 2 livré : onglets remplis, doublons supprimés, moteur conservé, tsc + suite (hors baseline pré-existante) verts.
- Lot 3 (15-03) peut remplir l'onglet Agenda ; Lot 4 (15-04) déplace la validation IA au produit + nettoie les batches zombies + correctifs visuels.
- Checkpoint visuel Laurent sur `:3010` à valider avant `/gsd:verify-work`.

## Self-Check: PASSED

(voir section ci-dessous)

---
*Phase: 15-refonte-fiche-session-onglets*
*Completed: 2026-06-29*

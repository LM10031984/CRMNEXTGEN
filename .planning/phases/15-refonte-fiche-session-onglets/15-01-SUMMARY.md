---
phase: 15-refonte-fiche-session-onglets
plan: 01
subsystem: ui
tags: [next-app-router, tabs, useSearchParams, pushState, rsc, session-detail, deep-link]

# Dependency graph
requires:
  - phase: 09.1-centralisation-qualiopi-360
    provides: ProductTabs (?tab= + role=tablist) — pattern d'onglets de référence cloné/adapté
provides:
  - "Conteneur client <SessionTabs> : coquille à 5 onglets ?tab= (session|avant|apres|docs|agenda) lue via useSearchParams, navigation window.history.pushState (0 round-trip), panneaux pré-rendus en props montés/hidden, a11y role=tablist/tab/aria-selected"
  - "coerceTab(raw) : fonction pure exportée (fallback 'session')"
  - "page.tsx fiche session enveloppant ses blocs métier EXISTANTS dans les 5 onglets + deep-link serveur via coerceTab(sp.tab)"
affects: [15-02-reembarquement, 15-03-agenda, 15-04-programme-produit-zombies]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Onglets approche C (15-RESEARCH) : conteneur CLIENT recevant les sections RSC pré-rendues en props, pushState pour switch instantané sans refetch, defaultTab serveur pour deep-link initial + survie router.refresh()"
    - "Panneaux montés mais hidden (pas {active && ...}) pour switch instantané (anti-pattern démontage évité)"

key-files:
  created:
    - apps/web/src/components/sessions/tabs/session-tabs.tsx
    - apps/web/src/components/sessions/tabs/__tests__/session-tabs.test.tsx
  modified:
    - apps/web/src/app/app/sessions/[id]/page.tsx

key-decisions:
  - "SessionWorkflowTimeline (barre conformité Qualiopi 9 indic. + StepCreation + ParticipantsList) conservé tel quel DANS l'onglet Session — Lot 1 = enveloppement, sa décomposition fine = Lot 2"
  - "SessionEvaluationBlock + StepFacturation laissés HORS onglets (déféré CONTEXT), conservés en bas de page"
  - "ParticipantDocMatrix promue en onglet Tous les documents (sortie de son <details>), contenu inchangé"

patterns-established:
  - "SessionTabs : navigation par window.history.pushState (jamais <Link>) pour ne PAS re-exécuter le RSC lourd (~10 requêtes Prisma)"
  - "Test de puissance : defaultTab VOLONTAIREMENT divergent de l'URL dans le test routage → vire rouge si le composant ignore ?tab="

requirements-completed: [FS-ONGLETS-COQUILLE]

# Metrics
duration: 6min
completed: 2026-06-29
---

# Phase 15 Plan 01 : Coquille à onglets fiche session Summary

**Conteneur client `<SessionTabs>` à 5 onglets `?tab=` (deep-link + survie au `router.refresh()`, navigation `pushState` sans refetch) enveloppant les blocs métier EXISTANTS de la fiche session — fondation structurelle purement additive pour les Lots 2-4.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-29T04:55:44Z
- **Completed:** 2026-06-29T05:01:30Z
- **Tasks:** 3
- **Files modified:** 3 (2 créés, 1 modifié)

## Accomplishments

- `<SessionTabs>` : 5 onglets (Session · Avant la formation · Après la formation · Tous les documents · Agenda), onglet actif lu dans l'URL via `useSearchParams().get('tab')`, défaut = Session, tab inconnu coercé vers Session.
- Navigation par `window.history.pushState` → 0 round-trip serveur, 0 refetch ; panneaux montés mais `hidden` (switch instantané) ; pas de `<Link>` (qui re-rendrait le RSC lourd).
- A11y reprise de ProductTabs : `role="tablist"` + 5 `role="tab"` + `aria-selected` cohérent + `aria-controls`/`aria-labelledby`.
- Deep-link serveur : la page RSC lit `searchParams.tab` et passe `coerceTab(sp.tab)` en `defaultTab` (rendu initial de l'onglet correct sans JS).
- Les blocs métier existants sont ENVELOPPÉS sans modification : en-tête persistant (RecordRecentVisit/SessionHeaderBar/NextActionHero) au-dessus des onglets ; SessionEvaluationBlock + StepFacturation hors onglets (déféré). 11 composants métier toujours rendus exactement une fois (vérifié).
- TDD : test RED écrit avant le composant, GREEN, mutation/puissance prouvée au gate.

## Task Commits

1. **Task 1 (Wave 0) : test de routage d'onglet (RED)** - `06f024a` (test)
2. **Task 2 : implémenter le conteneur SessionTabs (GREEN)** - `601da67` (feat)
3. **Task 3 : câbler SessionTabs dans page.tsx + searchParams** - `403250b` (feat)

_Note : Task 2 (TDD) regroupe composant + durcissement du test (cleanup + defaultTab divergent) en un commit GREEN ; pas de refactor séparé nécessaire._

## Files Created/Modified

- `apps/web/src/components/sessions/tabs/session-tabs.tsx` (créé) — conteneur client `'use client'` : `SESSION_TABS`, `SessionTabId`, `coerceTab`, composant `SessionTabs` (pushState, role=tablist, 5 panneaux montés/hidden).
- `apps/web/src/components/sessions/tabs/__tests__/session-tabs.test.tsx` (créé) — 10 tests jsdom : coerce (3), routage ?tab= (3), a11y tablist/tab/aria-selected (2), pushState avec/sans tab= (2). Mock `next/navigation`.
- `apps/web/src/app/app/sessions/[id]/page.tsx` (modifié) — signature étendue `searchParams`, import `{ SessionTabs, coerceTab }`, 5 panneaux enveloppant les blocs existants, deferred blocks hors onglets, retrait import `ChevronRight` orphelin.

## Decisions Made

- **Approche C (conteneur client + props pré-rendues + pushState)** retenue dès le Lot 1 (recommandation 15-RESEARCH) plutôt que B (clone direct ProductTabs `<Link>`) : la fiche session fait ~10 requêtes Prisma, un refetch à chaque clic d'onglet serait visible. C donne le switch instantané et survit au `router.refresh()`.
- **SessionWorkflowTimeline conservé entier dans l'onglet Session** (porte la barre conformité Qualiopi 9 indicateurs + StepCreation + liste des inscrits). Le décomposer = Lot 2 ; ici on enveloppe sans casser.
- **Onglet Agenda = placeholder** ("Agenda — synchro Google Calendar (Lot 3)") : contenu réel branché au Lot 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] cleanup() entre tests + durcissement du test de puissance**
- **Found during:** Task 2 (GREEN)
- **Issue:** Vitest `environment: 'node'` par défaut → pas d'auto-cleanup `@testing-library/react` entre tests : le DOM s'accumulait ("Found multiple elements / multiple tablist"), 6 tests échouaient à tort. De plus, le test routage `?tab=apres` passait `defaultTab="apres"` (= URL), donc la mutation « renvoyer defaultTab » ne pouvait pas être détectée — test faible.
- **Fix:** Ajout de `cleanup()` en `beforeEach`. Test routage + aria durcis avec `defaultTab="session"` VOLONTAIREMENT divergent de `?tab=apres` → seul un composant qui LIT réellement l'URL affiche Après. Mutation prouvée : ces 2 tests virent ROUGE quand `active = coerceTab(defaultTab)`, verts une fois restauré.
- **Files modified:** apps/web/src/components/sessions/tabs/__tests__/session-tabs.test.tsx
- **Verification:** 10/10 verts ; mutation appliquée → 2 rouges → restaurée → 10/10.
- **Committed in:** `601da67` (Task 2 commit)

**2. [Rule 3 - Blocking] Retrait import `ChevronRight` orphelin**
- **Found during:** Task 3
- **Issue:** La matrice `ParticipantDocMatrix` quitte son `<details>` (promue en onglet plein écran) → le `ChevronRight` du summary n'est plus utilisé. Import mort.
- **Fix:** Retiré `ChevronRight` de l'import `lucide-react` de page.tsx.
- **Files modified:** apps/web/src/app/app/sessions/[id]/page.tsx
- **Verification:** tsc --noEmit clean ; aucune autre occurrence.
- **Committed in:** `403250b` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Les deux corrections sont nécessaires (harnais de test correct + code mort retiré). Aucune dérive de périmètre — le Lot 1 reste purement structurel/additif.

## Issues Encountered

- **Filtre vitest `-- session-tabs` inopérant** via `pnpm --filter ... test -- session-tabs` : le `--` propage l'argument comme pattern de fichier mais la commande `test` du package re-lançait toute la suite. Contourné en exécutant `pnpm --filter @qualiof/web exec vitest run session-tabs`.
- **Échec de test pré-existant HORS scope** : `src/lib/closure/__tests__/shared-template.test.ts:175` attend `data:image/jpg;base64,` mais reçoit `data:image/jpeg;base64,` (MIME jpeg vs jpg dans le loader logo closure). Présent sur la baseline AVANT ce plan, non causé par les onglets. Logué dans `deferred-items.md`, non corrigé. Suite : 1101/1102 verts (mes +10 tests session-tabs inclus).

## Known Stubs

- **Onglet Agenda = placeholder intentionnel** (`<div>Agenda — synchro Google Calendar (Lot 3)</div>`). Intentionnel et documenté : le contenu réel (synchro Google Calendar Phase 14 + créneaux lecture) est livré au **Lot 3 (15-03)**. Ne bloque pas l'objectif du Lot 1 (coquille structurelle). Aucun autre stub.

## User Setup Required

None - no external service configuration required.

## Checkpoint visuel (manuel, hors automatisé) — pour Laurent

Sur l'instance dev déjà en cours sur `:3010` :
1. Ouvrir `/app/sessions/<id>` → vérifier les **5 onglets** en haut sous l'en-tête.
2. Cliquer chaque onglet → switch instantané, pas de rechargement/spinner.
3. Ouvrir `/app/sessions/<id>?tab=apres` → l'onglet **Après** est actif au chargement.
4. Déclencher une génération de doc (qui fait `router.refresh()`) → l'onglet actif est **préservé**.

## Next Phase Readiness

- Coquille à onglets opérationnelle : Lot 2 (15-02) peut réembarquer le contenu proprement et supprimer les doublons (drawer, cartes), Lot 3 (15-03) remplit l'onglet Agenda, Lot 4 (15-04) déplace la validation IA au produit + nettoie les batches zombies.
- Aucun blocage. Le checkpoint visuel Laurent reste à valider sur `:3010` avant `/gsd:verify-work`.

## Self-Check: PASSED

- FOUND: apps/web/src/components/sessions/tabs/session-tabs.tsx
- FOUND: apps/web/src/components/sessions/tabs/__tests__/session-tabs.test.tsx
- FOUND: .planning/phases/15-refonte-fiche-session-onglets/15-01-SUMMARY.md
- FOUND commits: 06f024a (test), 601da67 (feat), 403250b (feat)

---
*Phase: 15-refonte-fiche-session-onglets*
*Completed: 2026-06-29*

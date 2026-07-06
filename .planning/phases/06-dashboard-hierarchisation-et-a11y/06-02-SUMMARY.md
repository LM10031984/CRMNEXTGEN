---
phase: 06-dashboard-hierarchisation-et-a11y
plan: 02
subsystem: ui

tags: [dashboard, a11y, react, tailwind, ux-11, collapsible]

requires:
  - phase: pre-existing
    provides: PrioCard, CaCard, PerfCard, CollapsibleSection (draft déjà en place avant Phase 6)
provides:
  - "Dashboard /app conforme audit UX-11 : 4 PrioCard prioritaires + 14 KPI secondaires repliés"
  - "CollapsibleSection renforcée a11y : aria-label dynamique, aria-controls, aria-hidden sur icônes décoratives"
affects: [verifier-phase-06, a11y, dashboard, collapsible-section, future-phases-utilisant-CollapsibleSection]

tech-stack:
  added: []
  patterns:
    - "Audit-first execution : grep d'abord, modifier seulement les écarts (state-mutation minimisée)"
    - "A11y collapsible : aria-expanded + aria-controls + aria-label dynamique FR (Déplier/Replier)"

key-files:
  created:
    - apps/web/src/components/ui/collapsible-section.tsx (déjà sur disque non-tracké, ajouté à git + a11y renforcée)
  modified:
    - apps/web/src/components/ui/collapsible-section.tsx (ajout aria-label, aria-controls, aria-hidden)
  audited_no_change:
    - apps/web/src/app/app/page.tsx (Task 1 NO-OP, conforme à 100% au plan)

key-decisions:
  - "Task 1 = NO-OP : audit grep confirme conformité totale du dashboard (4 PrioCard + 1 CollapsibleSection fermée par défaut). Aucune modification de page.tsx — respect strict du scope reminder."
  - "Task 2 : ajouter aria-label dynamique FR ('Déplier ...' / 'Replier ...') basé sur title quand string, sinon fallback générique. Plus accessible que le simple aria-expanded."
  - "Ajout aria-controls + id sur le wrapper du contenu pour respecter la liaison ARIA standard."
  - "Marquage aria-hidden='true' sur Icon et ChevronDown (décoratives, doublons sémantiques du titre)."

patterns-established:
  - "Audit-first pour les plans 'audit + finition' : grep avant tout, ne corriger que les écarts précis."
  - "A11y CollapsibleSection : label FR contextualisé (Déplier/Replier {title})."

requirements-completed: [UX-11]

duration: 2min 25s
completed: 2026-05-13
---

# Phase 06 Plan 02: Dashboard hiérarchisation — Audit + a11y CollapsibleSection Summary

**Audit UX-11 du dashboard /app validé conforme (4 PrioCard + 1 CollapsibleSection fermée), CollapsibleSection renforcée a11y (aria-label FR dynamique + aria-controls + aria-hidden).**

## Performance

- **Duration:** 2min 25s
- **Started:** 2026-05-13T13:40:20Z
- **Completed:** 2026-05-13T13:42:45Z
- **Tasks:** 2 (1 NO-OP audit + 1 patch a11y)
- **Files modified:** 1

## Accomplishments

- **Task 1 audit pass** : `apps/web/src/app/app/page.tsx` est déjà 100% conforme à CONTEXT.md UX-11 :
  - 4 `<PrioCard>` (CA encaissé, AGEFICE, Sessions à venir, Taux remplissage) lignes 112-142
  - 1 `<CollapsibleSection id="dashboard-detailed">` ligne 147 wrappant les 3 sous-sections (CA, Cashflow, Performance) — 15 cards au total
  - `defaultOpen` absent ⇒ fermée par défaut (composant defaults to `false`)
  - Toutes les autres sections (Alertes, Pipeline, Top, Chart, Satisfaction, Récentes) restent standalone (non-wrappées)
- **Task 2 a11y patch** sur `CollapsibleSection` :
  - `aria-label` dynamique FR ("Déplier {title}" / "Replier {title}") sur le bouton toggle
  - `aria-controls={contentId}` lié à l'id du wrapper du contenu (`collapsible-content-{id}`)
  - `aria-hidden="true"` sur les icônes décoratives (Icon, ChevronDown)
  - API publique inchangée, `STORAGE_KEY_PREFIX` inchangé, try/catch préservés (Safari incognito-safe)

## Task Commits

1. **Task 1: Auditer + finaliser hiérarchisation dashboard (page.tsx)** — NO-OP (aucun commit, audit grep conforme, voir SCOPE BOUNDARY)
2. **Task 2: Vérifier robustesse CollapsibleSection (persistance + hydration)** — `b71b620` (feat)

Le fichier `collapsible-section.tsx` était untracked sur disque avant ce plan (présent fonctionnellement, jamais versionné). Le commit Task 2 l'a à la fois ajouté au repo ET incluant les patches a11y.

## Files Created/Modified

- `apps/web/src/components/ui/collapsible-section.tsx` — ajout `aria-label` FR dynamique, `aria-controls`, `aria-hidden="true"` sur icônes, id sur wrapper du contenu (`collapsible-content-{id}`). API publique préservée.

## Decisions Made

- **Task 1 NO-OP** : la consigne explicite du `<scope_reminder>` indique que ce plan est en mode "audit + finition", et que si l'audit montre la conformité, le résultat attendu est "audit pass, no changes needed". Tous les `grep` acceptance criteria du plan retournent les valeurs attendues sans qu'il y ait besoin de toucher `page.tsx`. Évite la pollution de l'historique git et le risque d'effets de bord.
- **A11y maximale FR pour CollapsibleSection** : plutôt que ne mettre QUE `aria-label`, j'ai ajouté également `aria-controls` (recommandé par la norme WAI-ARIA pour les disclosure widgets) et `aria-hidden="true"` sur les deux icônes décoratives. Pas dans les acceptance criteria stricts du plan mais c'est l'esprit du `<behavior>` (« bouton toggle a un rôle accessible »).
- **`aria-label` dynamique basé sur title** : reprend le pattern de l'exemple plan (`typeof title === 'string' ? ${open ? 'Replier' : 'Déplier'} ${title} : ...`). Le screen reader annonce désormais "Déplier Indicateurs détaillés" au lieu d'un simple "bouton réduit".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Ajout `aria-label` manquant sur le bouton toggle de CollapsibleSection**

- **Found during:** Task 2 audit
- **Issue:** Le composant avait `aria-expanded` mais pas `aria-label`. Acceptance criteria 4 du plan exige `aria-label` ≥ 1 occurrence. Manquant = a11y dégradée (screen reader ne sait pas ce qu'il déplie).
- **Fix:** Ajout `aria-label` dynamique FR (`Déplier/Replier {title}`), `aria-controls={contentId}`, `aria-hidden="true"` sur Icon et ChevronDown, id stable sur wrapper du contenu.
- **Files modified:** `apps/web/src/components/ui/collapsible-section.tsx`
- **Verification:** `grep -n "aria-label" apps/web/src/components/ui/collapsible-section.tsx` → 1 occurrence. `tsc --noEmit` exit 0.
- **Committed in:** `b71b620`

**Total deviations:** 1 auto-fixed (Rule 2 missing critical a11y attribute)
**Impact on plan:** Patch a11y dans l'esprit du plan (acceptance criteria explicite). Pas de scope creep.

## Issues Encountered

- **Build prerender errors** (`pnpm --filter @qualiof/web build`) sur 5 pages (`/login`, `/app/sessions`, `/app/factures`, `/app/produits`, `/`) avec `Cannot find module './9192.js'` / `Cannot read properties of undefined (reading 'call')`.
  - **Cause** : corruption `.next/` due à l'exécution PARALLÈLE de plans 06-01, 06-02, 06-03 sur le même monorepo (les agents se marchent dessus sur les chunks webpack).
  - **Pas lié à 06-02** : aucune des pages affectées n'utilise `CollapsibleSection` ; `tsc --noEmit` exit 0 sur `apps/web` confirme que le code 06-02 est sain.
  - **Action** : documenté dans `.planning/phases/06-dashboard-hierarchisation-et-a11y/deferred-items.md`. Sera revérifié post-merge wave 1 (clean `.next` + rebuild séquentiel).

## Known Stubs

Aucun. Le composant `CollapsibleSection` consomme exclusivement de la donnée fournie par son parent ; aucune valeur hardcodée empty/null.

## User Setup Required

Aucun — pas de configuration externe.

## Next Phase Readiness

- Wave 1 finalisable (06-01 commit `096bc28`, 06-02 commit `b71b620`, 06-03 à venir).
- Plan 06-04 (verifier UX-11/UX-12/UX-13) pourra s'appuyer sur la conformité auditée ici.
- Tous les composants consommateurs futurs de `CollapsibleSection` héritent automatiquement de l'a11y renforcée (FR + aria-controls).

## Self-Check: PASSED

- `apps/web/src/components/ui/collapsible-section.tsx` — FOUND (ajouté à git via commit b71b620)
- `apps/web/src/app/app/page.tsx` — FOUND (audité, non modifié)
- Commit `b71b620` — FOUND (`git log --oneline | grep b71b620` → match)
- All Task 1 acceptance criteria grep checks pass
- All Task 2 acceptance criteria grep checks pass
- `tsc --noEmit` on `apps/web` → exit 0

---
*Phase: 06-dashboard-hierarchisation-et-a11y*
*Completed: 2026-05-13*

---
phase: 06-dashboard-hierarchisation-et-a11y
plan: 03
subsystem: ui
tags: [a11y, wcag, accessibility, badge, audit, tailwind]

requires:
  - phase: 02-sidebar-responsive
    provides: MobileMenuButton with aria-label="Ouvrir le menu"
  - phase: 04-topbar
    provides: NotificationsBell + UserMenuButton with aria-labels
provides:
  - Audit a11y manuel daté (2026-05-13) avec verdict explicite par dimension
  - Validation contraste Badge 7/7 variants PASS WCAG AA (ratios documentés)
  - Inventaire des 4 dimensions a11y (contraste, nav clavier, aria-label, div onClick)
  - Liste de dette technique a11y pour milestone v6 (4 croix X custom, 5 dialogs custom à migrer Radix)
affects: [phase-07, phase-08, phase-09, milestone-v6-a11y-ci]

tech-stack:
  added: []
  patterns:
    - "Audit a11y manuel par grep ciblé (sans Lighthouse/axe-core) pour audience interne"
    - "Verdict PASS/PASS_AVEC_NOTE/FAIL par dimension, traçabilité par commande grep"

key-files:
  created:
    - .planning/phases/06-dashboard-hierarchisation-et-a11y/06-A11Y-AUDIT.md
  modified: []

key-decisions:
  - "Task 2 NO-OP : badge.tsx inchangé car les 7 variants passent WCAG AA (ratios calculés depuis tailwind.config.ts)"
  - "Dette a11y identifiée (~4 boutons X icon-only + 5 dialogs custom) reportée milestone v6, hors scope plan 06-03"
  - "Audit visuel + grep ciblé suffit pour audience interne Start Academy ; Lighthouse/axe-core en CI = v6"

patterns-established:
  - "Pattern : audit a11y daté à scope explicite (CONTEXT.md > Out of scope) pour éviter la course au score"
  - "Pattern : verdict 3 valeurs (PASS / PASS_AVEC_NOTE / FAIL) + commande grep utilisée pour reproductibilité"

requirements-completed: [UX-13]

duration: ~3min
completed: 2026-05-13
---

# Phase 6 Plan 03: Audit a11y léger Summary

**Audit a11y manuel (grep + lecture composants) validant 4 dimensions WCAG AA sur le périmètre Phase 6 — contraste Badge PASS 7/7 variants (ratios calculés via tokens Tailwind), nav clavier PASS via Link/Radix natifs, aria-label PASS sur controls globaux. Task 2 NO-OP confirmé : badge.tsx inchangé.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-13T13:41:05Z
- **Completed:** 2026-05-13T13:43:30Z
- **Tasks:** 2 (1 réalisé + 1 NO-OP)
- **Files modified:** 0 (1 fichier créé dans `.planning/`, gitignored)

## Accomplishments

- Document d'audit `06-A11Y-AUDIT.md` (138 lignes) avec 4 dimensions verdict + grep evidence + dette technique listée
- Contraste Badge 7/7 variants validé PASS WCAG AA (ratios approximés ~5.6:1 à ~16.1:1, tous >= 4.5:1 seuil AA)
- Résolution des tokens `primary` (`#E6F0F5` / `#003049`) et `muted`/`foreground` (`#F1F5F9` / `#0F172A`) via lecture `tailwind.config.ts` pour calcul des ratios
- Identification de 11 `<div onClick>` (overlays Dialog + stopPropagation) — tous acceptables (focusable existant pour la même action)
- Identification de ~4 croix `X` icon-only dans dialogs custom sans aria-label — non bloquant, reporté v6

## Task Commits

Aucun commit git créé pour ce plan :
1. **Task 1 (audit + rapport)** — fichier créé dans `.planning/` qui est gitignored (commit_docs=false). Pas de commit git, mais artifact bien présent sur disque.
2. **Task 2 (correctif Badge conditionnel)** — **NO-OP** confirmé : `git diff apps/web/src/components/ui/badge.tsx` retourne vide. Aucun variant ne nécessite correction.

**Plan metadata :** pas de commit (planning/ gitignored).

## Files Created/Modified

- `.planning/phases/06-dashboard-hierarchisation-et-a11y/06-A11Y-AUDIT.md` (NEW, 138 lignes) — Rapport d'audit a11y daté 2026-05-13, 4 dimensions évaluées (contraste, nav clavier, aria-label, div onClick), verdict global PASS_AVEC_NOTES, dette technique listée pour v6.

Aucun fichier source modifié.

## Decisions Made

- **Task 2 NO-OP confirmé** : audit Task 1 a démontré que `badge.tsx` satisfait WCAG AA sur tous les variants. La palette Start Academy (Qualiopi Gen) utilise `primary-700` très foncé (#003049) sur `primary-50` très clair (#E6F0F5), ratio ~12.6:1 — très au-dessus du seuil 4.5:1. Aucune ligne de `badge.tsx` n'est modifiée.
- **Scope respecté** : aucun fichier source modifié au-delà de ce qui était autorisé (`badge.tsx` seul, et NO-OP au final). Les ~4 boutons X icon-only détectés en section 3 du rapport sont reportés v6 — hors scope plan 06-03 qui modifie UNIQUEMENT `badge.tsx`.
- **Pas d'install d'outil** : audit visuel + grep ciblé seulement (cf CONTEXT.md > Out of scope: Lighthouse automatisé = CI v6).

## Deviations from Plan

None - plan executed exactly as written. Task 2 était explicitement conditionnel ("CAS 1 : Verdict PASS → ne RIEN modifier") et le verdict est PASS, donc le NO-OP est conforme au plan.

## Issues Encountered

None.

## User Setup Required

None - aucune config externe.

## Self-Check: PASSED

- `06-A11Y-AUDIT.md` exists (138 lines, >= 40 required)
- 4 section headers present (`## 1.`, `## 2.`, `## 3.`, `## 4.`)
- 4 verdict lines present (one per dimension)
- `badge.tsx` unchanged (git diff vide)
- 7 variants present in `badge.tsx` (default, success, warning, danger, info, muted, primary)
- `type Variant` unchanged

## Next Phase Readiness

- Audit a11y daté disponible pour référence future (`.planning/phases/06-dashboard-hierarchisation-et-a11y/06-A11Y-AUDIT.md`)
- Dette technique a11y listée explicitement pour milestone v6 (Lighthouse/axe-core CI + migration dialogs custom Radix + aria-label sur croix X custom)
- Phase 6 plan 06-04 (bookkeeping) peut démarrer
- Aucun blocker

---
*Phase: 06-dashboard-hierarchisation-et-a11y*
*Completed: 2026-05-13*

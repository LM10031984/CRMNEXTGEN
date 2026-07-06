---
phase: quick-260618-eyc
plan: 01
subsystem: ui
tags: [convention, qualiopi, business-days, satisfaction-froid, format-location, pdf-templates]

# Dependency graph
requires:
  - phase: codebase
    provides: subtractBusinessDaysISO (lib/business-days.ts), ConventionData / renderConventionHtml, _gen-temoin-cloud script, grille-observation-template
provides:
  - "formatLocation helper partagé (anti-duplication ville + titlecase léger)"
  - "isFroidEligible helper (garde >=90j calendaires pour satisfaction à froid ind.31)"
  - "ConventionData.conventionDate câblé J-15 jours ouvrés chez les 2 fournisseurs"
  - "Nettoyage puces orphelines du programme dans la convention"
  - "Titre interne grille harmonisé sur GRILLE D'OBSERVATION"
affects: [génération de masse documents Qualiopi, témoin SES-0087, packs fin de formation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helper pur partagé formatLocation réutilisable convention/programme/checklist"
    - "Date convention DÉRIVÉE de sessionStartDate via subtractBusinessDaysISO (jamais hardcodée)"
    - "Gate déterministe d'éligibilité doc (isFroidEligible) filtrant la liste de kinds générés"

key-files:
  created:
    - apps/web/src/lib/format-location.ts
    - apps/web/src/lib/__tests__/format-location.test.ts
    - apps/web/src/lib/closure/satisfaction-froid-eligibility.ts
    - apps/web/src/lib/closure/__tests__/satisfaction-froid-eligibility.test.ts
    - apps/web/src/lib/__tests__/convention-conventiondate.test.ts
  modified:
    - apps/web/src/lib/convention-template.ts
    - apps/web/src/lib/closure/grille-observation-template.ts
    - apps/web/src/server/actions/convention-generator.ts
    - apps/web/scripts/_gen-temoin-cloud.ts

key-decisions:
  - "conventionDate = J-15 jours OUVRÉS avant sessionStartDate (règle Laurent « signée >=15j avant »), dérivée via subtractBusinessDaysISO — jamais new Date() au rendu"
  - "isFroidEligible = >=90 jours calendaires (Math.floor((now-end)/86400000) >= 90), now injecté pour tests reproductibles"
  - "formatLocation : ne préfixe le name QUE s'il ne contient pas déjà la ville (comparaison insensible casse+accents), titlecase léger sur la rue uniquement (CP numérique + ville en base intacts)"

patterns-established:
  - "Helper formatLocation partagé : forme unique propre, anti-duplication ville, titlecase léger"
  - "cleanProgrammeBullets calqué sur normalizeMd (programme-template) appliqué avant marked.parse dans convention"

requirements-completed: [COR-1, COR-2, COR-3, COR-4, COR-5, COR-6]

# Metrics
duration: 14min
completed: 2026-06-18
---

# Quick 260618-eyc : Corrections audit témoin (date convention, lieu, froid) Summary

**Six défauts systémiques du témoin SES-0087 corrigés avant la génération de masse : convention datée J-15 jours ouvrés (au lieu du jour de génération), satisfaction à froid gardée >=90j, lieu sans duplication de ville + capitalisé, puces orphelines nettoyées, titre grille harmonisé.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 3 (2 en TDD)
- **Files modified:** 9 (5 créés, 4 modifiés)

## Accomplishments

- **COR-1 (GRAVE) :** la convention n'est plus datée du jour de génération (postérieure à la session, ce qui cassait l'antériorité ind.9 + rétractation Art.6 + solde la veille Art.7). `ConventionData.conventionDate` est désormais dérivée à J-15 jours ouvrés avant le début de session via `subtractBusinessDaysISO`, câblée chez les 2 fournisseurs (server action + script témoin). SES-0087 (début 2026-05-11) → 16/04/2026.
- **COR-2 (GRAVE) :** la satisfaction à froid (ind.31, recueil 3-6 mois) n'est plus générée pour une session terminée depuis moins de 90 jours. Helper `isFroidEligible` + filtre des kinds dans le témoin (SES-0087 fin 11/05 → froid sauté aujourd'hui).
- **COR-3 + COR-6 :** helper `formatLocation` partagé — anti-duplication ville (plus de « Vitrolles — Nestenn — Vitrolles ») + titlecase léger de la rue sans toucher au CP ni à la ville.
- **COR-4 :** `cleanProgrammeBullets` (calqué sur `normalizeMd`) retire les puces orphelines du programme avant `marked.parse` dans la convention.
- **COR-5 :** titre interne de la grille harmonisé en « GRILLE D'OBSERVATION » (cohérent avec le nom de fichier et le title du wrapper).

## Task Commits

1. **Task 1: Helpers partagés (formatLocation COR-3+6, isFroidEligible COR-2)** — `bebd15f` (feat, TDD RED→GREEN)
2. **Task 2: conventionDate COR-1 + puces COR-4 + titre grille COR-5** — `6f8981c` (feat, TDD RED→GREEN)
3. **Task 3: Câblage des 2 fournisseurs (convention-generator + témoin)** — `b79b9e6` (feat)

_TDD : tests écrits d'abord (RED confirmé : modules absents / new Date() au rendu), puis implémentation (GREEN)._

## Files Created/Modified

- `apps/web/src/lib/format-location.ts` — helper pur formatLocation (anti-dup ville + titlecase léger)
- `apps/web/src/lib/__tests__/format-location.test.ts` — 5 cas (anti-dup SES-0087, titlecase, name sans ville, address null, location null)
- `apps/web/src/lib/closure/satisfaction-froid-eligibility.ts` — helper isFroidEligible >=90j
- `apps/web/src/lib/closure/__tests__/satisfaction-froid-eligibility.test.ts` — 2 cas (limite 90j stricte 89/90/91, SES-0087 froid=false)
- `apps/web/src/lib/__tests__/convention-conventiondate.test.ts` — 3 cas (J-15 ouvrés, rendu date convention, zéro puce orpheline)
- `apps/web/src/lib/convention-template.ts` — champ conventionDate + cleanProgrammeBullets + rendu « Fait à … le » sans new Date()
- `apps/web/src/lib/closure/grille-observation-template.ts` — titre « GRILLE D'OBSERVATION »
- `apps/web/src/server/actions/convention-generator.ts` — conventionDate = subtractBusinessDaysISO(start, 15)
- `apps/web/scripts/_gen-temoin-cloud.ts` — lieu via formatLocation, conventionDate câblé, gate froid (filtre SATISFACTION_FROID si < 90j)

## Decisions Made

- conventionDate dérivée à J-15 jours ouvrés via `subtractBusinessDaysISO` chez les DEUX fournisseurs — jamais hardcodée, jamais `new Date()` au rendu (cohérence Art.6/Art.7).
- isFroidEligible : >=90 jours calendaires, `now` injecté en paramètre pour tests déterministes.
- formatLocation : titlecase via `\p{L}` (Unicode property escape), comparaison ville insensible casse+accents via `normalize('NFD')` + `\p{Diacritic}`.

## Deviations from Plan

None — plan exécuté tel qu'écrit. Une seule correction technique interne pendant Task 3 : ordre de déclaration dans `_gen-temoin-cloud.ts` (le bloc COR-1/COR-2 utilise `log`, un `const` arrow non-hoisté ; les déclarations `ok/ko/stub` + `log` ont été remontées avant l'usage pour éviter une ReferenceError en temporal dead zone). Sans impact fonctionnel.

## Issues Encountered

- Le helper `gsd-tools commit` est configuré `commit_docs:false` et refuse les fichiers code (`skipped_commit_docs_false`) ; les 3 commits de tâche ont donc été faits via `git commit` direct en stageant uniquement les fichiers concernés (jamais `git add .`). La WIP non committée de Laurent (ROADMAP, STATE hors ligne quick-task, produits/[id]/page.tsx, edit-product-button, session-location-picker, crud-edits, tsbuildinfo) n'a pas été touchée.

## Test de puissance (mutation) — au gate

Trois mutations déterministes, chacune a viré le test au ROUGE puis a été restaurée :
- conventionDate : `subtractBusinessDaysISO('2026-05-11', 15)` → `, 0)` → test RED → restauré.
- froid : `isFroidEligible(..., 2026-04-01)).toBe(true)` (90j) → `toBe(false)` → test RED → restauré.
- formatLocation : `const nameContainsCity = false` (désactivation anti-dup dans l'impl) → test RED → restauré.

État final : 10/10 tests verts. `tsc --noEmit` : 1 seule erreur, préexistante et autorisée (sessions.ts:804 legalName, WIP Laurent).

## Next Phase Readiness

- Corrections systémiques prêtes pour la génération de masse des packs Qualiopi.
- Contrôle visuel recommandé (hors scope auto) : `SES=SES-0087 pnpm --filter @qualiof/web exec tsx scripts/_gen-temoin-cloud.ts` puis vérifier convention 16/04/2026, pas de « Satisfaction à froid.pdf », lieu propre, pas de puce orpheline, titre grille « GRILLE D'OBSERVATION ».
- Hors scope (deferred, non touché) : déroulé multi-jours, Ollama worker, PedagogicalAsset upsert.

## Self-Check: PASSED

- 10/10 fichiers créés/modifiés présents sur disque.
- 3 commits de tâche présents (bebd15f, 6f8981c, b79b9e6).

---
*Phase: quick-260618-eyc*
*Completed: 2026-06-18*

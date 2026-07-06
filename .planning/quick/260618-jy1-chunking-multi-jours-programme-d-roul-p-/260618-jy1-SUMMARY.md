---
phase: quick-260618-jy1
plan: 01
subsystem: closure / génération packs Qualiopi
tags: [deroule, programme, multi-jours, scaffold-horaire, ollama, qualiopi]
requires:
  - apps/web/src/lib/programme-normalize.ts (buildHoraireScaffold/renderHoraireScaffoldMd)
  - apps/web/src/lib/closure/deroule-template.ts (DerouleContent — pagination N jours + rapport unique)
provides:
  - buildHoraireScaffold multi-jours déterministe (N=ceil(h/8), reliquat figé)
  - renderHoraireScaffoldMd N jours (### Jour K)
  - generateNormalizedProgramme prompt multi-jours (répartition N jours)
  - generateDerouleContent chunké par jour (1 appel LLM/jour) + assembleDeroule pur
affects:
  - chaîne grille horaire → programme normalisé → déroulé pédagogique (formations longues)
tech-stack:
  added: []
  patterns:
    - "Chunking LLM par jour + réassemblage pur (flatMap) pour éviter timeout/troncature"
    - "Horaires métier 100% hardcodés (pas de smart calc) — reliquat = h − 8·(nbJours−1)"
    - "Échec d'un chunk → null global + console.error (jamais de PDF partiel trompeur)"
key-files:
  created: []
  modified:
    - apps/web/src/lib/programme-normalize.ts
    - apps/web/src/lib/__tests__/programme-normalize.test.ts
    - apps/web/src/lib/closure/ollama-generators.ts
    - apps/web/src/lib/closure/qualiopi-prompts.ts
decisions:
  - "Programme normalisé : 1 SEUL appel LLM (markdown plat, cohérence transversale) — chunking réservé au déroulé (lourd en tokens)"
  - "Jour partiel ≤4h : matin seul, PAS de déjeuner (cohérent getDayStartEnd : pause déjeuner si journée ≥5h)"
  - "Jour partiel >4h : matin complet + après-midi partiel + déjeuner conservé"
  - "Multiple de 8 → dernier jour PLEIN (reliquat===8)"
  - "multiDayDeferred retiré (forcé false, champ gardé pour compat type)"
metrics:
  duration: ~25 min
  tasks: 3
  files: 4
  completed: 2026-06-18
---

# Phase quick-260618-jy1 Plan 01: Chunking multi-jours programme/déroulé pédagogique Summary

Lève le différé multi-jours sur la chaîne grille horaire → programme normalisé → déroulé : `buildHoraireScaffold` rend désormais N=ceil(h/8) journées déterministes (reliquat figé), et `generateDerouleContent` génère le déroulé JOUR PAR JOUR (1 appel LLM/jour) puis réassemble via une fonction pure `assembleDeroule` en 1 seul PDF — sans timeout ni troncature sur formations longues (PROD-0042 9j, jusqu'à 14j).

## What Was Built

### Task 1 — Grille horaire scaffold multi-jours déterministe (commit d6bfedc)
- `buildHoraireScaffold(h)` : N=ceil(h/8) jours, (N-1) pleins + dernier jour reliquat = `h − 8·(nbJours−1)`.
- Helpers purs `buildJourPlein()` (8h figé factorisé) et `buildJourPartiel(reliquatHeures)` :
  - reliquat ≥8 → jour plein.
  - reliquat ≤4h → matin seul `9h00→(9h+reliquat)`, pas d'après-midi, pas de déjeuner.
  - 4h<reliquat<8h → matin complet + déjeuner + après-midi partiel `14h00→(14h+reliquat−4)`.
- Horaires HARDCODÉS par concaténation sur l'entier d'heures (aucun smart calc sur minutes). Garde-fou `Math.round` si non entier.
- `HoraireBloc` étendu : `label=''` + `travailMin=0` pour un bloc absent ; `dejeuner.durationMin=0` si omis.
- `renderHoraireScaffoldMd` réécrit : itère `scaffold.jours`, `### Jour K — Organisation de la journée` + créneaux + total/jour, omet les blocs absents. Garde le mot-clé « recopier » et les horaires figés.
- `multiDayDeferred` retiré (forcé `false`, champ conservé pour compat type, documenté `@deprecated`).

### Task 2 — Programme normalisé réparti sur N jours (commit 256e0df)
- `SYSTEM_PROMPT_NORMALIZE_PROGRAMME` : règle horaires réécrite pour « N journées (certaines partielles), répartir le contenu source » ; FORMAT DE RENDU ajoute « structure par JOUR (### Jour K) en multi-jours, plat en 1 jour ». 3 RÈGLES ABSOLUES conservées.
- `generateNormalizedProgramme` : userPrompt injecte `scaffold.nbJours` + consigne de répartition. Signature inchangée. `enforceProgrammeFidelity` conservé tel quel.
- Décision documentée dans la fonction : mapping en 1 SEUL appel LLM (markdown plat, cohérence transversale) — le chunking est réservé au déroulé.

### Task 3 — Déroulé chunké par jour + assembleDeroule pur (commit fc2300c)
- `export function assembleDeroule(partiels: DerouleContent[]): DerouleContent` = `{ jours: partiels.flatMap(p => p.jours) }`. PURE : ordre préservé, gère 0/1/N partiels + partiel multi-jours.
- `generateDerouleContent` refondu, signature IDENTIQUE `(formation, refTable, refId, tenantId)` :
  - `nbJours===1` → comportement HISTORIQUE strictement inchangé (prompt et appel d'origine).
  - `nbJours>1` → boucle k=1..N : grille figée du jour k (via `renderHoraireScaffoldMd` sur 1 jour), prompt par jour (`buildDerouleJourPrompt` : accueil J1 seul, QCM Kahoot dernier jour seul, réutilise `SYSTEM_PROMPT_DEROULE` + `DerouleSchema`), `runOllamaJson` tier 'quality' MODEL_DEROULE → partiel.
  - Échec d'un jour → `console.error` + `return null` GLOBAL (pas de troncature silencieuse).
  - Concat via `assembleDeroule` → 1 DerouleContent → 1 PDF.
- `deroule-template.ts` NON modifié : `renderDerouleHtml` pagine déjà les N jours (`renderDerouleDays` itère `content.jours`) et `renderBilanFormateur` est rendu UNE fois après la boucle (vérifié) — RAS.

## Tests / Verification

- `programme-normalize.test.ts` : 26 tests verts (scaffold 8/16/40/72/105h + reliquat ≤4h/>4h + assembleDeroule 0/1/N + dégénéré).
- `gen-session-pack-pure.test.ts` : 7 tests verts (non-régression callers/mock signature préservée).
- 2 tests de puissance prouvés rouge-quand-cassé puis restaurés :
  - `// test de puissance reliquat` (formule `8*(nbJours-1)` → `8*nbJours` → rouge).
  - `// test de puissance ordre réassemblage` (`flatMap` → `reverse().flatMap` → rouge).
- `tsc --noEmit` : 0 nouvelle erreur (3 préexistants tolérés : redirect-308.test ×6, sessions.ts(804) legalName, shared-template.test Test6 mime jpeg).

## Deviations from Plan

None — plan exécuté tel qu'écrit. Choix d'exécuteur retenus (tous prévus comme options dans le plan) :
- Jour partiel ≤4h sans déjeuner (cohérent `getDayStartEnd` ≥5h) — documenté.
- Programme normalisé en 1 appel LLM (option non-chunkée du plan) — documenté.
- Bloc absent exprimé par `label=''` + `travailMin=0` (au lieu de bloc optionnel) — documenté dans le type.

## Known Stubs

Aucun. Les parties LLM (qualité du mapping réparti, génération d'un jour de déroulé) sont DÉTERMINISTES côté scaffold/réassemblage (testées) et seront validées au TÉMOIN RUNTIME par Laurent (PROD-0042 9j) — ce n'est pas un stub mais une vérification runtime explicitement hors-scope de ce plan (pas de génération réelle lancée ici).

## Commits

- d6bfedc — feat(quick-260618-jy1): grille horaire scaffold multi-jours déterministe + reliquat figé
- 256e0df — feat(quick-260618-jy1): programme normalisé réparti sur N jours (prompt multi-jours)
- fc2300c — feat(quick-260618-jy1): déroulé chunké par jour + assembleDeroule pur

## Self-Check: PASSED
- FOUND: apps/web/src/lib/programme-normalize.ts
- FOUND: apps/web/src/lib/__tests__/programme-normalize.test.ts
- FOUND: apps/web/src/lib/closure/ollama-generators.ts
- FOUND: apps/web/src/lib/closure/qualiopi-prompts.ts
- FOUND commit: d6bfedc, 256e0df, fc2300c

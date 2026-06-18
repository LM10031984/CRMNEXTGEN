---
phase: 260618-pno
plan: 01
subsystem: closure / déroulé pédagogique
tags: [qualiopi, llm, deroule, rapport-formateur, ancrage-programme]
requires:
  - generateDerouleContent (existant)
  - renderDerouleHtml / renderBilanFormateur (existant)
  - runOllamaJson (helper LLM)
provides:
  - generateRapportFormateur (tier fast/Haiku)
  - SYSTEM_PROMPT_RAPPORT_FORMATEUR (ancrage strict programme)
  - DerouleContent.rapportFormateur (optionnel)
  - renderBilanFormateur narratif > pool (fallback)
affects:
  - apps/web/src/lib/closure/ollama-generators.ts
  - apps/web/src/lib/closure/qualiopi-prompts.ts
  - apps/web/src/lib/closure/deroule-template.ts
tech-stack:
  added: []
  patterns:
    - "Narratif LLM ancré au programme > pool générique, avec fallback non-régressif"
    - "1 appel LLM rapport formateur par déroulé (pas par jour), après assemblage"
key-files:
  created:
    - apps/web/src/lib/closure/__tests__/rapport-formateur-narratif.test.ts
  modified:
    - apps/web/src/lib/closure/qualiopi-prompts.ts
    - apps/web/src/lib/closure/ollama-generators.ts
    - apps/web/src/lib/closure/deroule-template.ts
decisions:
  - "Le rapport formateur (adaptations/remarques/bilan) est désormais généré par LLM, ancré au programme réel, pour ne plus faire fuiter des thèmes hors programme (ex. « prompts/IA » sur une formation Tracfin)."
  - "Pools génériques PRÉSERVÉS comme filet de sécurité (fallback si LLM échoue)."
  - "tier 'fast' (Haiku en cloud) car texte court — pas 'quality'."
  - "Échec du rapport → champ absent, le déroulé n'est PAS avorté."
metrics:
  duration: ~25 min
  completed: 2026-06-18
  tasks: 3
  files: 4
  commits: 3
---

# Phase 260618-pno Plan 01 : Rapport formateur du déroulé — narratifs LLM ancrés au programme Summary

Le « Rapport formateur » du déroulé pédagogique (adaptations/observations, remarques sur le groupe, bilan) est maintenant généré par LLM (`generateRapportFormateur`, tier fast/Haiku) et ancré au programme réel de la formation, remplaçant les pools génériques codés en dur qui faisaient fuiter des thèmes hors programme ; les pools restent en place comme fallback non-régressif et les 7 critères de ratings demeurent déterministes.

## What Was Built

- **Task 1 — `generateRapportFormateur` + prompt ancré** (`5c95b3c`)
  - `SYSTEM_PROMPT_RAPPORT_FORMATEUR` dans `qualiopi-prompts.ts` : voix formateur 1ère personne + ancrage strict (« si une phrase pourrait appartenir à une autre formation, elle est INTERDITE », ex. Tracfin → ne jamais mentionner prompts/IA), 1-2 phrases/champ, JSON strict.
  - `RapportFormateurSchema` (Zod) : `{ adaptations, remarquesGroupe, bilan }`, chaque champ `min(10)`.
  - `generateRapportFormateur(formation, refTable, refId, tenantId)` exporté, async, tier `'fast'` via `runOllamaJson`, retourne `{adaptations, remarquesGroupe, bilan} | null`.

- **Task 2 — `DerouleContent.rapportFormateur` peuplé une fois** (`57e6051`)
  - Interface `DerouleContent` étendue avec `rapportFormateur?` optionnel.
  - `generateDerouleContent` peuple le champ via UN SEUL appel `generateRapportFormateur` dans les deux branches (mono-jour ET multi-jours après `assembleDeroule`).
  - Échec rapport (null) → spread sans la clé → déroulé non avorté.
  - Signatures publiques `generateDerouleContent` (4 appelants) et `renderDerouleHtml` inchangées.

- **Task 3 — `renderBilanFormateur` narratif > pool + tests** (`69780f5`)
  - `renderBilanFormateur` accepte `opts.rapport` : `opts.rapport?.X ?? pick(POOL, ...)` pour les 3 champs. Pools `ADAPTATIONS_POOL`/`REMARQUES_GROUPE_POOL`/`BILAN_POOL` et `pick` préservés. Les 7 critères (`CRITERES_FORMATEUR` + `noteBySeed`) inchangés.
  - `renderDerouleHtml` passe `rapport: content.rapportFormateur ?? null`. `renderProductDerouleHtml` inchangé (fallback pool actif, pas de rapport LLM côté produit).
  - Nouveau test `rapport-formateur-narratif.test.ts` (3 tests, via `renderDerouleHtml` car `renderBilanFormateur` est privé).

## Verification

- `pnpm --filter @qualiof/web exec tsc --noEmit` : clean sur les fichiers touchés (préexistants ignorés : redirect-308 ×6, sessions.ts:804, shared-template Test6 jpeg).
- `pnpm --filter @qualiof/web exec vitest run rapport-formateur-narratif` : 3/3 verts.
- Test de puissance (mutation) : remplacement de `opts.rapport?.adaptations ?? pick(...)` par `pick(...)` seul → le pool « prompts » réapparaît → tests (a) et (b) virent RED (seed `'Lutte anti-blanchiment Tracfin'` tombe sur l'entrée pool n°1 « usage des prompts ») → mutation restaurée → vert. Preuve que le test garde un comportement réel.
- Non-régression : `gen-session-pack-pure.test.ts` (mock `renderDerouleHtml`) 7/7 verts ; `parse-programme-to-deroule.test.ts` 7/7 verts.
- Aucune génération LLM réelle lancée (contrainte projet : câblage LLM vérifié au runtime témoin post-build).

## Deviations from Plan

Aucune déviation Rule 1/2/3/4. Plan exécuté à la lettre. Ajustement mineur de test (non-déviation) : le `ctx` minimal castable du test a dû inclure `sessionStartDate`/`sessionEndDate` (objets `Date`) car `renderInfoBox` les lit via `.toDateString()` — découvert au premier run, complété sans changer le périmètre.

## Known Stubs

Aucun. Les pools restent volontairement présents comme fallback documenté (non un stub : filet de sécurité si le LLM échoue).

## Self-Check: PASSED

- Commits trouvés : `5c95b3c`, `57e6051`, `69780f5`.
- Fichiers présents : qualiopi-prompts.ts, ollama-generators.ts, deroule-template.ts, __tests__/rapport-formateur-narratif.test.ts.
- WIP de Laurent (produits/[id], edit-product-button, session-location-picker, crud-edits, ROADMAP, tsbuildinfo) non staged, non touché.

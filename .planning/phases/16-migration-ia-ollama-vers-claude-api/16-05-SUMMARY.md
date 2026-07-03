---
phase: 16-migration-ia-ollama-vers-claude-api
plan: 05
subsystem: ai
tags: [claude, openrouter, prompts, qualiopi, closure, llm, prompt-version]

# Dependency graph
requires:
  - phase: 16-migration-ia-ollama-vers-claude-api (16-04)
    provides: tiers D-01a par générateur closure alignés (fast=Haiku / quality=Sonnet) routés via callLlm
provides:
  - "5+ system prompts Qualiopi re-tunés pour Claude (allègement des rappels format défensifs mistral, garde-fous métier conservés verbatim)"
  - "PROMPT_VERSION bumpé 'qualiopi-gen-v9-2026-06-18' -> 'claude-v10-2026-07' — trace mistral vs Claude dans AIGenerationJob.promptVersion"
affects: [16-06, pack-témoin, closure-generators, qualiopi-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-tune prompt = changement OBSERVABLE tracé par PROMPT_VERSION (leçon audit : re-gen a posteriori possible seulement si version tracée)"
    - "Séparation stricte garde-fous MÉTIER (conservés) vs rappels format défensifs mistral (allégés)"

key-files:
  created:
    - .planning/phases/16-migration-ia-ollama-vers-claude-api/16-05-SUMMARY.md
  modified:
    - apps/web/src/lib/closure/qualiopi-prompts.ts

key-decisions:
  - "Re-tune conservateur : seule la redondance intra-prompt réelle (double rappel JSON de NORMALIZE_PROGRAMME) et les CAPS d'insistance du bloc FORMAT de rendu du déroulé ont été allégées ; aucun autre prompt touché car chacun n'avait déjà qu'UNE instruction format."
  - "Garde-fous métier Qualiopi conservés MOT POUR MOT (valeur d'audit, PAS anti-dérape mistral) — cf. critical_notes du plan."
  - "PROMPT_VERSION = 'claude-v10-2026-07' pour distinguer mistral (v9 figé) vs Claude dans AIGenerationJob."

patterns-established:
  - "Coexistence mistral/Claude tracée par PROMPT_VERSION : les produits figés (TrainingProduct.derouleJson, prompt v9) gardent leur contenu ; re-run des produits figés = hors scope (dette documentée)."

requirements-completed: [REQ-16-05]

# Metrics
duration: 3min
completed: 2026-07-03
---

# Phase 16 Plan 05: Re-tuning des prompts Qualiopi pour Claude Summary

**Re-tune Claude des system prompts closure : `PROMPT_VERSION` bumpé `claude-v10-2026-07`, rappels format défensifs mistral allégés (double JSON NORMALIZE_PROGRAMME consolidé + CAPS d'insistance du déroulé normalisées), garde-fous métier Qualiopi conservés verbatim, schémas Zod aval intacts, tsc clean + suite verte (1141/1142, seul échec pré-existant hors scope).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-03T14:13:22Z
- **Completed:** 2026-07-03T14:16:05Z
- **Tasks:** 1
- **Files modified:** 1 (code) + 1 (SUMMARY)

## Accomplishments
- `PROMPT_VERSION` : `'qualiopi-gen-v9-2026-06-18'` → **`'claude-v10-2026-07'`** — distingue mistral vs Claude dans `AIGenerationJob.promptVersion` (traçabilité re-gen a posteriori, leçon audit).
- Header daté ajouté en tête de `qualiopi-prompts.ts` : politique de re-tune Claude (allègement format, conservation des garde-fous métier, coexistence tracée, re-run produits figés hors scope).
- **Allègement défensif mistral** (là où c'était réellement redondant) :
  - `SYSTEM_PROMPT_NORMALIZE_PROGRAMME` avait DEUX rappels JSON (« Réponds en JSON { programmeMd } » mid-body + « Réponds UNIQUEMENT en JSON, sans texte autour. » en fin) → le mid-body devient descriptif (« Le résultat est un objet JSON { "programmeMd": "..." } … ») ; UNE seule instruction format subsiste en fin.
  - `SYSTEM_PROMPT_DEROULE` bloc « FORMAT DE RENDU — TABLEAU 6 COLONNES, SOIS CONCIS » : CAPS d'insistance (SOIS CONCIS / QUELQUES LIGNES MAXIMUM / INTERDIT / PRÉCISION) ramenées en formulation normale, **règle de concision intégralement conservée** (6 colonnes, pas de paragraphes numérotés, précision > longueur).
- **Garde-fous MÉTIER Qualiopi CONSERVÉS verbatim** : voix 1re/3e personne (satisfaction chaud/froid, rapport formateur, analyse besoin), ancrage individuel anti-jumelage (analyse besoin), ancrage strict au thème, distribution A/B des niveaux (grille, positionnement), verbes de Bloom (normalize programme, analyse besoin), cohérence horaire 9h00–13h00 / 14h00–18h00 = 8h pile (déroulé), seuils QCM (>90%, 12 questions / 9-12) et satisfaction (≥90% « Très bien »/« Bien », jamais « Mauvais »).
- Schémas Zod en aval **INCHANGÉS** — chaîne prompt→LLM→Zod→null→stub intacte.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-tuner les system prompts pour Claude + bump PROMPT_VERSION** - `9958000` (feat)

**Plan metadata:** (final docs commit — SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `apps/web/src/lib/closure/qualiopi-prompts.ts` - PROMPT_VERSION bumpé claude-v10 + header politique re-tune + consolidation double JSON NORMALIZE_PROGRAMME + normalisation CAPS du bloc format déroulé. 22 insertions / 4 suppressions.
- `.planning/phases/16-migration-ia-ollama-vers-claude-api/16-05-SUMMARY.md` - ce document.

## Decisions Made
- **Re-tune volontairement conservateur.** L'audit du fichier a montré que chaque prompt n'avait déjà qu'UNE instruction format (une occurrence de « Réponds UNIQUEMENT en JSON… » par prompt) : la seule redondance intra-prompt réelle était le double rappel de `NORMALIZE_PROGRAMME`, corrigé. Le reste des CAPS marque des RÈGLES MÉTIER (voix, ancrage, distribution, seuils) = valeur d'audit → non touché (cf. critical_notes : « KEEP ALL Qualiopi BUSINESS guardrails verbatim »). Seul le bloc format-shape du déroulé (SOIS CONCIS…) est une insistance mistral output-shape → normalisée sans perte de règle.
- **Aucune modification de la forme de sortie** attendue par les générateurs : les Zod schemas (`QcmRawSchema`, `AnalyseBesoinSchema`, `DerouleSchema`, `NormalizedProgrammeSchema`, etc.) parsent toujours le même JSON.

## Deviations from Plan

None - plan executed exactly as written. (Ajustement de commande de vérification uniquement : `pnpm --filter @qualiof/web tsc/test` n'expose pas de script `tsc`/`test` → exécuté via `pnpm --filter @qualiof/web exec tsc --noEmit` et `exec vitest run`. Aucune modification de code liée.)

## Issues Encountered
- **Verify (non bloquant) :** `pnpm --filter @qualiof/web tsc --noEmit` échoue avec `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` (pas de script npm `tsc`). Résolu en invoquant le binaire via `exec` : `pnpm --filter @qualiof/web exec tsc --noEmit` → **exit 0**. Idem pour la suite : `pnpm --filter @qualiof/web exec vitest run`.

## Verification Results
- **tsc `--noEmit` :** exit **0** (apps/web).
- **Suite complète :** **1141 passed / 1 failed (1142)**. L'unique échec = `src/lib/closure/__tests__/shared-template.test.ts:175` (MIME `image/jpeg` vs attendu `image/jpg`) — **PRÉ-EXISTANT hors scope**, documenté 15-01→16-04, non touché par ce plan. **Aucune nouvelle régression** (les prompts ne sont pas assertés littéralement dans les tests mockés). Baseline identique à 16-04.
- **Acceptance grep OK :** `PROMPT_VERSION = 'claude-v10-2026-07'`=1 ; `claude`=5 ; `Bloom`=2 ; « première/1re/PREMIÈRE PERSONNE »=6 ; « horaire/9h/09:00 »=14 ; « TROISIÈME PERSONNE/3e personne »=7 ; anti-jumelage=2 ; distribution majoritaire=3.

## Known Stubs
None. Ce plan ne touche que le texte des consignes des prompts — pas de composant/UI, pas de valeur hardcodée vide, pas de placeholder introduit. Le mécanisme de fallback stub existant (`stub-content.ts`, retour null générateur → stub) est INCHANGÉ.

## Documented Debt (out of scope)
- **Prompt figé au produit :** re-tuner les prompts ne re-génère PAS les produits déjà figés (`TrainingProduct.derouleJson`, générés sous prompt v9 mistral). Ces produits gardent leur contenu mistral jusqu'à un éventuel re-run. Coexistence mistral/Claude tracée par `PROMPT_VERSION` dans `AIGenerationJob`. **Re-run des produits figés = HORS scope** (dette documentée, cf. 16-RESEARCH §Prompt re-tuning).
- **Qualité réelle du contenu Claude :** non entièrement vérifiable ici (les prompts ne sont pas assertés au contenu). Validée sur le **pack témoin en 16-06** (D-04c : changement observable).

## User Setup Required
None - aucune configuration de service externe requise pour ce plan (le re-tune est purement textuel côté prompts).

## Next Phase Readiness
- Prompts Claude prêts pour la validation qualité sur pack témoin (Plan 16-06).
- ⚠ Rappel D-02b (hors ce plan) : la migration vision PII cloud reste gatée par le checkpoint DPA du Plan 16-06 — sans impact ici (docs closure = texte).
- Prochain : Plan 16-06 (pack témoin + validation qualité Claude).

## Self-Check: PASSED
- FOUND: `.planning/phases/16-migration-ia-ollama-vers-claude-api/16-05-SUMMARY.md`
- FOUND: `apps/web/src/lib/closure/qualiopi-prompts.ts`
- FOUND: commit `9958000`
- FOUND: `PROMPT_VERSION = 'claude-v10-2026-07'` in source

---
*Phase: 16-migration-ia-ollama-vers-claude-api*
*Completed: 2026-07-03*

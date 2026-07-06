---
phase: 16-migration-ia-ollama-vers-claude-api
plan: 02
subsystem: api
tags: [llm, ollama, openrouter, claude, veille, callLlm, tdd, worker-safe]

# Dependency graph
requires:
  - phase: 16-migration-ia-ollama-vers-claude-api (Plan 16-01)
    provides: "env boot-safe OpenRouter (AI_PROVIDER=openrouter accepté, 7 clés OPENROUTER_* validées, llm-client.ts backend switch)"
provides:
  - "Call site veille (classifyItem) routé via callLlm({ tier: 'fast' }) — plus de callOllama direct"
  - "Tracing AIGenerationJob dynamique (r.provider/r.model), plus 'ollama'/'mistral-small:24b' codés en dur"
  - "Patron de migration call-site le plus simple (isolé, worker-safe, mutation-safe) — modèle pour Waves 3 (vision/closure/pack témoin)"
affects: [16-03, 16-04, 16-05, 16-06, veille-worker, closure-generators]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Call site LLM route via callLlm(tier) — jamais de nom de modèle codé au call site (le backend/modèle est choisi par AI_PROVIDER dans llm-client.ts)"
    - "Tracing AIGenerationJob lit provider/model DYNAMIQUEMENT depuis LlmResult (r.provider/r.model)"
    - "Repli de tracing dans le catch (throw avant réponse) : provider dérivé de AI_PROVIDER, model='unknown'"
    - "Test hermétique : mock @/lib/llm-client (callLlm) directement, ne jamais importer un module qui exécute createEnv() au load"

key-files:
  created: []
  modified:
    - "apps/web/src/lib/veille/classify.ts"
    - "apps/web/src/lib/veille/__tests__/classify.test.ts"

key-decisions:
  - "D-04 LOCKED respecté : callLlm (gateway OpenRouter), pas de @anthropic-ai/sdk"
  - "Catch (callLlm throw avant réponse) : r indéfini → provider de repli dérivé de AI_PROVIDER, model='unknown' ; les branches success/Zod-fail utilisent r.provider/r.model"
  - "Prompt veille NON re-tuné (PROMPT_VERSION_VEILLE inchangé) — seul le backend change dans ce plan"

patterns-established:
  - "Migration call-site Ollama→Claude : remplacer callOllama({model}) par callLlm({tier}) + tracing dynamique + test mocke @/lib/llm-client + assertion mutation-safe sur le tier"

requirements-completed: [REQ-16-03]

# Metrics
duration: 12min
completed: 2026-07-03
---

# Phase 16 Plan 02: Migration veille classify Ollama→callLlm Summary

**`classifyItem` (veille RSS→thème Qualiopi) bascule de `callOllama` direct vers `callLlm({ tier: 'fast' })` (Claude Haiku via OpenRouter selon AI_PROVIDER), avec tracing AIGenerationJob provider/model dynamique et test migré mutation-safe.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-03T15:51:00Z
- **Completed:** 2026-07-03T15:54:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `classify.ts` : `import { callOllama } from '@/lib/ai-ollama'` → `import { callLlm } from '@/lib/llm-client'` ; appel `callLlm({ tier: 'fast', ... })` ; suppression de `OLLAMA_MODEL_VEILLE` (plus de modèle codé au call site).
- Tracing rendu dynamique : les 2 branches de succès (ok / Zod-fail) écrivent `provider: r.provider` + `model: r.model` dans `AIGenerationJob` au lieu de `'ollama'` / `'mistral-small:24b'` figés.
- Branche `catch` (le throw précède la réponse → `r` indéfini) : repli explicite `provider = AI_PROVIDER==='openrouter' ? 'openrouter' : 'ollama'`, `model: 'unknown'`.
- Test migré : mock `@/lib/ai-ollama` → `@/lib/llm-client` (`callLlmMock`), mocks enrichis de `provider:'openrouter'` + `model:'anthropic/claude-haiku-4.5'`, assertion de routage `expect.objectContaining({ tier: 'fast' })` (mutation-safe). 4 scénarios (ok / malformé / OTHER / throw) verts.
- Worker-safety préservée : `callLlm` est un fetch pur, aucun import React/rbac/validateRequest introduit (grep = 0).

## Task Commits

1. **Task 1: Router classify.ts via callLlm + tracing dynamique + migration test** - `22800c6` (feat)

_TDD : le test a d'abord été migré (RED — le mock `@/lib/llm-client` n'était pas consommé tant que classify.ts importait `@/lib/ai-ollama`, la vraie voie Ollama traçait encore `provider:'ollama'`), puis classify.ts migré (GREEN). Commit unique atomique couvrant test + source._

## Files Created/Modified
- `apps/web/src/lib/veille/classify.ts` - Call site veille routé via `callLlm({ tier: 'fast' })`, tracing AIGenerationJob dynamique (r.provider/r.model), repli catch dérivé de AI_PROVIDER.
- `apps/web/src/lib/veille/__tests__/classify.test.ts` - Mock migré `@/lib/ai-ollama`→`@/lib/llm-client`, mocks avec provider/model OpenRouter, assertion mutation-safe `tier: 'fast'`, protocole de mutation documenté en commentaire.

## Decisions Made
- **Catch = repli statique** : `callLlm` peut throw avant d'avoir résolu un résultat, donc `r` n'existe pas dans le `catch`. Choix (per plan) : provider de repli dérivé de `process.env.AI_PROVIDER`, `model: 'unknown'`. Le test 4 (throw) n'assertit donc PAS le provider (non figé), seulement `status:'error'` + `errorMsg` contenant le message.
- **Prompt inchangé** : `PROMPT_VERSION_VEILLE` conservé — ce plan ne re-tune pas le prompt veille (écrit pour mistral-small), il ne change que le backend. Re-tune éventuel = plan ultérieur avec bump de version.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **Faux "échec" de suite au run complet :** `pnpm --filter @qualiof/web test -- classify` exécute toute la suite web et rapporte 1 échec — `shared-template.test.ts:175` (MIME `image/jpeg` vs `image/jpg`). Ce n'est PAS lié à ce plan : c'est le seul échec de suite documenté comme PRÉ-EXISTANT dans STATE.md sur les Plans 15-01→15-04 et 16-01 (veille non touchée). Isolé, les 4 tests `classify.test.ts` passent (`pnpm exec vitest run src/lib/veille/__tests__/classify.test.ts` → 4/4). Logué dans `deferred-items.md`.
- **tsc non fiable dans cet environnement** : le drift de symlink pnpm (`packages/shared/node_modules/vitest`) documenté au 16-01 fait échouer `tsc --noEmit` sur les fichiers de test PRÉ-EXISTANTS. La compilation esbuild de vitest (type-strip) sur les fichiers modifiés est verte, gage de cohérence de types au niveau syntaxique. Déjà logué `deferred-items.md`.

## User Setup Required
None - no external service configuration required. (Bascule effective sur Claude cloud = poser `AI_PROVIDER=openrouter` + `OPENROUTER_API_KEY` dans `.env` — infra livrée au 16-01, hors périmètre code de ce plan.)

## Next Phase Readiness
- Patron de migration call-site prouvé (le plus simple : isolé + worker-safe + mutation-safe). Sert de modèle pour les Waves suivantes (Plans 16-03→16-06 : vision OCR, closure generators, pack témoin).
- REQ-16-03 satisfait : veille migrée, provider/model dynamiques, test mutation-safe.
- Pré-requis Wave 1 (16-01 env boot-safe) confirmé consommé (llm-client.ts backend switch opérationnel).

## Self-Check: PASSED

- FOUND (modified): `apps/web/src/lib/veille/classify.ts` — imports `callLlm`, 0 `callOllama`, `r.provider` ×3.
- FOUND (modified): `apps/web/src/lib/veille/__tests__/classify.test.ts` — mocks `@/lib/llm-client`, `tier: 'fast'`.
- FOUND (commit): `22800c6` present in git log on `cloud-migration`.
- Test: 4/4 `classify.test.ts` green in isolation.

---
*Phase: 16-migration-ia-ollama-vers-claude-api*
*Completed: 2026-07-03*

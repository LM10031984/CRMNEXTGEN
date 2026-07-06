---
phase: 16-migration-ia-ollama-vers-claude-api
plan: 04
subsystem: testing
tags: [llm, openrouter, claude, closure, tier, haiku, sonnet, vitest, ollama-generators]

# Dependency graph
requires:
  - phase: 16-01
    provides: "env boot-safe OpenRouter (AI_PROVIDER=openrouter accepté + clés OPENROUTER_* validées)"
  - phase: 16-02
    provides: "patron de migration call-site callOllama→callLlm (routage tier mutation-safe)"
provides:
  - "Tiers des 9 générateurs closure alignés sur D-01a (déroulé+rapport=quality/Sonnet, reste=fast/Haiku, programme=quality figé)"
  - "Test de routage hermétique generators-routing.test.ts (tier par générateur + retry→null, mutation-safe)"
affects: [16-05, 16-06, pack-temoin, closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tier D-01a par générateur : fast=Haiku (docs volume/structurés), quality=Sonnet (rédactionnel critique audit)"
    - "Test de routage hermétique : mock @/lib/llm-client (callLlm) + @qualiof/db + @/lib/ai-ollama, tenantId=null, AI_PROVIDER=openrouter forcé avant import"

key-files:
  created:
    - apps/web/src/lib/closure/__tests__/generators-routing.test.ts
  modified:
    - apps/web/src/lib/closure/ollama-generators.ts

key-decisions:
  - "6 tiers corrigés (D-01a) : rapport-formateur fast→quality ; qcm/analyse-besoin/grille/positionnement/grille-obs-session quality→fast. Déroulé + programme inchangés (quality). Satisfaction chaud/froid = défaut fast (inchangé)."
  - "AUCUN fallback Ollama ajouté (D-03b) : le switch cloud env-piloté (tryOnce) est la seule voie. Retry MAX_ATTEMPTS puis null→stub inchangé."
  - "Test 2 cible generateAnalyseBesoinContent (fast plus simple à satisfaire que QCM post-process attachQcmScoring) pour prouver tier:'fast'."

patterns-established:
  - "Routage tier prouvé par générateur via expect.objectContaining({ tier }) sur le mock callLlm"
  - "Mutation-of-power : inverser un tier → test tier ROUGE ; forcer MAX_ATTEMPTS=1 → test retry ROUGE"

requirements-completed: [REQ-16-04, REQ-16-06]

# Metrics
duration: 4min
completed: 2026-07-03
---

# Phase 16 Plan 04: Alignement des tiers générateurs closure sur D-01a Summary

**Les 9 générateurs closure passent désormais le tier CONFORME à D-01a (déroulé + rapport formateur = quality/Sonnet, QCM/analyse-besoin/grille/positionnement/grille-obs-session/satisfaction = fast/Haiku, programme figé = quality), prouvé par un test de routage hermétique + retry→null mutation-safe.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-03T14:05:33Z
- **Completed:** 2026-07-03T14:09:34Z
- **Tasks:** 2
- **Files modified:** 2 (1 modifié, 1 créé)

## Accomplishments
- 6 tiers corrigés dans `ollama-generators.ts` : le routage `cloud ? callLlm({ tier }) : callOllama` existait déjà (tous les générateurs y passent via `tryOnce`/`runOllamaJson`) — le travail réel était de corriger les `tier` positionnels INVERSÉS par l'audit "routage 17/06" (qui avait tout mis en quality). Rapport formateur remonte en quality (rédactionnel critique audit) ; QCM, analyse besoin, grille, positionnement, grille obs session redescendent en fast (docs volume/structurés → Haiku, coût).
- Commentaires "audit routage 17/06" (×5) remplacés par une référence explicite "D-01a Phase 16".
- Déroulé pédagogique (L874/L917), programme normalisé (L1010) : quality inchangé (rédactionnel figé au produit). Satisfaction chaud/froid : défaut fast inchangé.
- Test hermétique `generators-routing.test.ts` (3 tests) : Test 1 rapport→callLlm tier quality ; Test 2 analyse-besoin→callLlm tier fast ; Test 3 parsedJson null → retry MAX_ATTEMPTS(2) puis null (→ le worker sert le stub), `callLlm` appelé exactement 2 fois, AUCUN fallback Ollama.

## Task Commits

1. **Task 1: Corriger les tiers des générateurs closure selon D-01a** - `1ad035e` (fix)
2. **Task 2: Test routage tier + retry→null(stub), mutation-safe** - `4b006e1` (test)

_Note TDD : la source Task 1 étant déjà correcte au moment d'écrire le test (tiers corrigés en amont), le RED de Task 2 est prouvé par le PROTOCOLE DE MUTATION (voir ci-dessous) plutôt que par un test rouge transitoire — le test garde réellement le comportement._

## Files Created/Modified
- `apps/web/src/lib/closure/ollama-generators.ts` - 6 arguments positionnels `tier` corrigés (D-01a) + 5 commentaires "audit routage 17/06" → "D-01a Phase 16". tryOnce/runOllamaJson (routage + retry) NON touchés.
- `apps/web/src/lib/closure/__tests__/generators-routing.test.ts` - Test de routage tier par générateur + retry→null, hermétique (mock `@/lib/llm-client`), mutation-safe documenté.

## Decisions Made
- **Test 2 sur analyse-besoin, pas QCM :** construire un `parsedJson` Zod-valide pour QCM impose ≥10 questions + post-process `attachQcmScoring` ; analyse-besoin (arrays min 2, strings min 10) satisfait le schéma avec un JSON minimal et prouve tout aussi bien `tier:'fast'` (plan l'autorise explicitement).
- **RapportFormateurSchema : champ réel `remarquesGroupe`** (le hint du plan disait `groupe`) — le fixture Test 1 utilise le vrai nom de champ.
- **Pas de fallback Ollama (D-03b)** : tryOnce/runOllamaJson intacts, seul le `tier` change ; le stub reste servi par le worker sur retour null.

## Deviations from Plan

None - plan executed exactly as written. (Une seule micro-adaptation technique sans impact scope : le mock `callLlm` a dû être déclaré via `vi.hoisted` — et non un `const` de top-level — car les factories `vi.mock` sont hoistées au-dessus des déclarations ; corrigé au premier run, comportement identique à celui décrit par le plan.)

## Issues Encountered
- **Mock hoisting (vitest) :** le premier run a échoué (`Cannot access 'callLlmMock' before initialization`) car `vi.mock('@/lib/llm-client', () => ({ callLlm: callLlmMock }))` est hoisté au-dessus du `const callLlmMock`. Résolu en déclarant `callLlmMock` dans le bloc `vi.hoisted(...)` avec les vars d'env. 3/3 verts ensuite.

## Mutation-of-Power (feedback_test_de_puissance_mutation)
Prouvé le 2026-07-03, jamais commité :
- **(a)** rapport-formateur `'quality'`→`'fast'` → **Test 1 ROUGE** (`expected "tier":"quality", got "fast"`). Restauré.
- **(c)** `MAX_ATTEMPTS=1` (retrait du retry) → **Test 3 ROUGE** (`expected 2 calls, got 1`). Restauré.
- Après restauration : `git diff --stat` vide (source identique au commit `1ad035e`), 3/3 verts.

## Verification
- `pnpm exec vitest run src/lib/closure/__tests__/generators-routing.test.ts` → **3/3 verts**, hermétique (LLM à 0ms = mock consommé, 0 réseau ; stdout confirme `model=cloud:quality` / `model=cloud:fast`).
- `pnpm exec vitest run src/lib/closure/__tests__/deroule-jour-partiel.test.ts` → **6/6 verts** (non-régressé).
- Suite complète `apps/web` → **1141 passed, 1 failed** — le seul échec est `shared-template.test.ts:175` (MIME `image/jpeg` vs `image/jpg`) **PRÉ-EXISTANT hors scope** (documenté 15-01→16-03, non touché).
- `pnpm exec tsc --noEmit` (apps/web) → **exit 0** (node_modules réparé au root, dette symlink 16-01/16-02 résorbée).
- Acceptance greps OK : `audit routage 17/06`=0 ; rapport-formateur tier `quality` ; qcm/analyse-besoin/grille/positionnement/grille-obs-session `fast` ; test contient `tier: 'quality'` + `tier: 'fast'` + `toHaveBeenCalledTimes` + `@/lib/llm-client`.

## Known Stubs
None - ce plan ne modifie que des chaînes de tier + ajoute un test. Aucune donnée UI stubbée introduite. La chaîne null→stub-content.ts (fallback closure) reste le comportement voulu D-03a (pas un stub à résoudre).

## Next Phase Readiness
- REQ-16-04 (retry→stub prouvé, pas de fallback Ollama) et REQ-16-06 (tiers conformes D-01a par générateur) satisfaits.
- Vagues suivantes 16-05 (re-tuning prompts Claude) / 16-06 (pack témoin + checkpoint DPA RGPD) débloquées : le routage tier est désormais correct et testé, le pack témoin s'appuiera sur ces tiers.
- ⚠ Rappel D-02b : la migration vision PII (OCR CNI/RIB, Plan 16-03) reste gatée hors code par le checkpoint DPA du Plan 16-06 — sans impact sur ce plan (docs closure = texte, pas PII vision).

## Self-Check: PASSED
- FOUND: apps/web/src/lib/closure/__tests__/generators-routing.test.ts
- FOUND: apps/web/src/lib/closure/ollama-generators.ts
- FOUND: .planning/phases/16-migration-ia-ollama-vers-claude-api/16-04-SUMMARY.md
- FOUND commit: 1ad035e (Task 1 fix)
- FOUND commit: 4b006e1 (Task 2 test)

---
*Phase: 16-migration-ia-ollama-vers-claude-api*
*Completed: 2026-07-03*

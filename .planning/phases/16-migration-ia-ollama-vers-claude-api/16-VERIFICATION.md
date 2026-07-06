---
phase: 16-migration-ia-ollama-vers-claude-api
verified: 2026-07-04T09:02:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 16: Migration IA Ollama vers Claude API — Verification Report

**Phase Goal:** Sortir Ollama (mistral-small:24b local) au profit de l'API Claude (via passerelle OpenRouter, callLlm) pour la génération des docs Qualiopi + OCR vision + veille. Objectifs : fiabilité (0 stub), qualité (contenu varié), cap cloud (milestone v6).
**Verified:** 2026-07-04T09:02:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Boot accepte AI_PROVIDER=openrouter (enum étendu) | VERIFIED | `AI_PROVIDER_SCHEMA` dans `env-schemas.ts` L14-15 contient `'openrouter'`; env.test.ts Test 1 + Test 2 verts (106/106 shared suite) |
| 2 | Les 7 clés OPENROUTER_* + OLLAMA_MODEL_VISION déclarées dans env.ts (single source of truth) | VERIFIED | `env.ts` : 16× OPENROUTER_ (7 server + 7 runtimeEnv + 2 import/export); 2× OLLAMA_MODEL_VISION (server + runtimeEnv); turbo.json 7× OPENROUTER_; .env.example 8× OPENROUTER_ + commentaire bascule |
| 3 | 0 callOllama/callOllamaVision résiduel dans veille/classify.ts, preinscription-extractor.ts, pdf-extract.ts | VERIFIED | `grep -rn "callOllama" ...` retourne vide sur les 3 fichiers. closure/ollama-generators.ts conserve son branch dev-local callOllama (ATTENDU — switch env-piloté) |
| 4 | Tiers closure conformes D-01a : déroulé + rapport formateur = quality (Sonnet), le reste = fast (Haiku) | VERIFIED | `ollama-generators.ts` : generateRapportFormateur L442='quality', generateQcm L469='fast', generateAnalyseBesoin L562='fast', generateGrille L614='fast', generatePositionnement L726='fast', generateGrilleObsSession L1147='fast', generateDeroule L874/L917='quality', generateProgramme L1010='quality'. 0 occurrence "audit routage 17/06" |
| 5 | PROMPT_VERSION='claude-v10-2026-07' bumpé et tracé dans AIGenerationJob | VERIFIED | `qualiopi-prompts.ts` L28 : `export const PROMPT_VERSION = 'claude-v10-2026-07'`. Garde-fous métier Qualiopi conservés : Bloom, 1re personne, horaire 9h/14h |
| 6 | Pack témoin SES-0093 : 0 stub, 16/16 docs, tiers D-01a conformes, variété inter-stagiaires | VERIFIED | `16-WITNESS.md` Task 2 : ClosureBatch COMPLETED 14/14 + 2/2, errorDocs=0, usedStub=0, 7 AIGenerationJob done/openrouter/claude-v10-2026-07, 6x cloud:fast + 1x cloud:quality, hashes PedagogicalAsset tous distincts. APPROUVE par Laurent 2026-07-04 |
| 7 | Gate RGPD vision tranché — GO opérationnel, dette DPA consignée | VERIFIED | `16-WITNESS.md` Task 3 : décision GO (Laurent 2026-07-04), dette de conformité documentée (DPA OpenRouter+Anthropic à inscrire au registre des traitements) |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/env.ts` | AI_PROVIDER enum openrouter + 7 OPENROUTER_* + OLLAMA_MODEL_VISION | VERIFIED | 16× OPENROUTER_ (7+7+2 reexport), 2× OLLAMA_MODEL_VISION, enum délégué à env-schemas.ts |
| `packages/shared/src/env-schemas.ts` | AI_PROVIDER_SCHEMA avec 'openrouter', OPENROUTER_MODEL_FAST_SCHEMA | VERIFIED | Exports confirmés; hermétique (importable sans DATABASE_URL) |
| `packages/shared/src/__tests__/env.test.ts` | 4 tests enum + défaut Haiku | VERIFIED | 4 tests verts dont Test 2 (provider invalide rejeté), 106/106 suite shared |
| `turbo.json` | 7 OPENROUTER_* dans globalEnv | VERIFIED | 7 clés OPENROUTER_* + OLLAMA_MODEL_VISION présentes L20-29 |
| `.env.example` | OpenRouter bloc documenté + bascule AI_PROVIDER | VERIFIED | 8× OPENROUTER_, commentaire "openrouter pour basculer sur Claude cloud" présent |
| `apps/web/src/lib/veille/classify.ts` | callLlm tier fast, tracing dynamique r.provider/r.model | VERIFIED | import callLlm L25, appel tier:'fast' L64-70, r.provider/r.model L77-78/L95-96, 0 callOllama |
| `apps/web/src/lib/veille/__tests__/classify.test.ts` | Mock @/lib/llm-client, 4 scénarios, mutation-safe | VERIFIED | vi.mock('@/lib/llm-client'), tier:'fast' assertion L77, 4 tests verts |
| `apps/web/src/lib/pdf-extract.ts` | callLlm({imageBuffer}), message erreur cloud-compatible | VERIFIED | import callLlm L9, callLlm({ imageBuffer }) L94, "ollama pull qwen2.5vl" absent (confirmé grep) |
| `apps/web/src/lib/__tests__/pdf-extract.test.ts` | 3 tests: imageBuffer, raw vide, throw→null | VERIFIED | 3 tests verts, vi.mock('@/lib/llm-client'), expect.objectContaining({ imageBuffer }) |
| `apps/web/src/lib/preinscription-extractor.ts` | callLlm tier fast, resolveModel('fast'), 0 qwen3/OLLAMA_MODEL_FAST | VERIFIED | callLlm+resolveModel importés L18, tier:'fast' L147-153, resolveModel('fast') L223, qwen3:30b-a3b=0, OLLAMA_MODEL_FAST=0 |
| `apps/web/src/lib/__tests__/preinscription-extractor.test.ts` | 3 tests: tier fast, pas de chemin Ollama, null→null | VERIFIED | 3 tests verts, vi.mock('@/lib/llm-client'), expect.objectContaining({ tier:'fast', jsonOutput:true }) |
| `apps/web/src/lib/closure/ollama-generators.ts` | Tiers D-01a corrigés (6 corrections), callLlm dans tryOnce | VERIFIED | Tous les tiers conformes D-01a (voir colonne Truth 4), callLlm importé L16, tryOnce L636-652 |
| `apps/web/src/lib/closure/__tests__/generators-routing.test.ts` | quality+fast assertions, retry toHaveBeenCalledTimes(2) | VERIFIED | tier:'quality' L104, tier:'fast' L111, toHaveBeenCalledTimes(2) L120, 3 tests verts |
| `apps/web/src/lib/closure/qualiopi-prompts.ts` | PROMPT_VERSION='claude-v10-2026-07', garde-fous métier intacts | VERIFIED | L28 PROMPT_VERSION correct, Bloom/1re personne/horaire confirmés grep |
| `.planning/phases/16-migration-ia-ollama-vers-claude-api/16-WITNESS.md` | Trace témoin + décisions gate | VERIFIED | Pré-checks, métriques SES-0093, hashes, décision RGPD consignés |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `env.ts` | `AI_PROVIDER` enum | `z.enum(['ollama','openrouter',...]`) in env-schemas.ts | WIRED | Pattern confirmé grep; env-schemas.ts exporté et réimporté dans env.ts |
| `veille/classify.ts` | `@/lib/llm-client` | `import callLlm` + appel `tier:'fast'` | WIRED | 0 callOllama résiduel; r.provider/r.model tracés dynamiquement |
| `pdf-extract.ts` | `@/lib/llm-client` | `callLlm({ imageBuffer })` | WIRED | imageBuffer force tier vision côté llm-client |
| `preinscription-extractor.ts` | `@/lib/llm-client` | `callLlm({ tier:'fast' })` + `resolveModel('fast')` | WIRED | aiModel dynamique (plus qwen3:30b-a3b figé) |
| `ollama-generators.ts` tryOnce | `callLlm` (cloud=openrouter) | `cloud ? callLlm({ tier, ... }) : callOllama` | WIRED | Switch env-piloté; dev-local branch callOllama conservé (attendu) |
| `qualiopi-prompts.ts PROMPT_VERSION` | `AIGenerationJob.promptVersion` | `runOllamaJson` persiste `PROMPT_VERSION` | WIRED | PROMPT_VERSION='claude-v10-2026-07'; tracé dans 7 AIGenerationJob SES-0093 (witness) |
| `AI_PROVIDER=openrouter` | pack closure réel 0 stub | Worker BullMQ via `_gen-session-pack.ts` | WIRED | SES-0093: 16/16 docs, 0 stub, ClosureBatch COMPLETED (16-WITNESS.md) |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `classify.ts` | `r` (LlmResult) | `callLlm({ tier:'fast' })` → OpenRouter API | Oui — réponse LLM réelle (provider=openrouter en prod) | FLOWING |
| `pdf-extract.ts` | `r.raw` (texte OCR) | `callLlm({ imageBuffer })` → vision Claude | Oui — OCR réelle sur buffer image | FLOWING |
| `preinscription-extractor.ts` | `r.parsedJson` | `callLlm({ tier:'fast' })` → OpenRouter | Oui — extraction structurée LLM | FLOWING |
| `ollama-generators.ts` | résultats générateurs | `tryOnce` → `callLlm` → runOllamaJson | Oui — prouvé SES-0093 0 stub 7 AIGenerationJob done | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite shared 106/106 hermétique | `pnpm --filter @qualiof/shared exec vitest run` | 106 passed (9 fichiers) | PASS |
| Suite web 1141/1141 pertinents verts | `pnpm --filter @qualiof/web exec vitest run` | 1141 passed, 1 failed (shared-template MIME pré-existant hors scope, documenté) | PASS |
| tsc web exit 0 | `pnpm --filter @qualiof/web exec tsc --noEmit` | EXIT_CODE: 0 (0 erreur) | PASS |
| classify.test.ts (4 tests) | vitest run classify | 4/4 verts | PASS |
| pdf-extract.test.ts (3 tests) | vitest run pdf-extract | 3/3 verts | PASS |
| preinscription-extractor.test.ts (3 tests) | vitest run preinscription-extractor | 3/3 verts | PASS |
| generators-routing.test.ts (3 tests) | vitest run generators-routing | 3/3 verts | PASS |
| 0 callOllama résiduel veille/vision/preinscription | `grep -rn "callOllama" classify.ts preinscription-extractor.ts pdf-extract.ts` | Vide (exit 1) | PASS |
| @anthropic-ai/sdk absent de tous les package.json | `grep -rn "@anthropic-ai/sdk" --include="package.json"` | 0 occurrence | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| REQ-16-01 | 16-01 | env openrouter — AI_PROVIDER enum + 7 OPENROUTER_* + OLLAMA_MODEL_VISION dans env.ts | SATISFIED | env.ts 16× OPENROUTER_, 2× OLLAMA_MODEL_VISION, env-schemas.ts export, env.test.ts 4 tests verts |
| REQ-16-02 | 16-03 | vision→callLlm — pdf-extract.ts + preinscription-extractor.ts migrés | SATISFIED | callLlm({imageBuffer}) + callLlm({tier:'fast'}), 0 callOllamaVision/callOllama résiduel, tests verts |
| REQ-16-03 | 16-02 | veille→callLlm — classify.ts migré, tracing dynamique | SATISFIED | callLlm tier fast, r.provider/r.model, 0 callOllama, classify.test.ts 4 tests verts |
| REQ-16-04 | 16-04 | retry+stub — MAX_ATTEMPTS retry puis null→stub intacts, PAS de fallback Ollama | SATISFIED | generators-routing.test.ts Test 3: callLlm toHaveBeenCalledTimes(2) puis null; D-03b confirmé |
| REQ-16-05 | 16-05, 16-06 | re-tuning prompts — PROMPT_VERSION='claude-v10-2026-07', garde-fous métier conservés | SATISFIED | qualiopi-prompts.ts L28, Bloom/1re personne/horaire présents; qualité validée sur SES-0093 (Laurent) |
| REQ-16-06 | 16-04 | tiers Haiku/Sonnet — D-01a par générateur (quality=Sonnet rédactionnel critique, fast=Haiku volume) | SATISFIED | Tiers corrects dans ollama-generators.ts (6 corrections appliquées), generators-routing.test.ts quality+fast |
| REQ-16-07 | 16-06 | tests migration + pack témoin — suite verte + SES-0093 0-stub approuvé | SATISFIED | 1141+106 tests verts (1 pré-existant hors scope), tsc exit 0, SES-0093 APPROUVE Laurent 2026-07-04, gate RGPD GO |

**Tous les REQ-16-XX satisfaits.**

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `closure/__tests__/shared-template.test.ts` | 175 | MIME `data:image/jpeg` vs attendu `data:image/jpg` | Info | Pré-existant depuis Phase 15, hors scope Phase 16, documenté dans deferred-items.md. Aucun lien avec la migration IA. |

Aucun anti-pattern bloquant introduit par Phase 16.

---

### Human Verification Required

Les 2 checkpoints humains du plan 16-06 sont DEJA approuvés par Laurent (2026-07-04) — aucune re-demande requise.

- **Pack témoin SES-0093** : APPROUVE par Laurent (2026-07-04) — 0 stub, qualité conforme, tiers D-01a.
- **Gate RGPD vision** : GO (Laurent 2026-07-04) — vision cloud autorisée en prod; dette de conformité consignée (DPA OpenRouter+Anthropic à documenter au registre des traitements).

---

### Gaps Summary

Aucun gap. Tous les 7 must-haves sont vérifiés, tous les REQ-16-XX sont satisfaits, tsc exit 0, suites verts (unique échec pré-existant hors scope documenté), pack témoin 0-stub approuvé, gate RGPD tranché.

---

_Verified: 2026-07-04T09:02:00Z_
_Verifier: Claude (gsd-verifier)_

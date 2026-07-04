---
phase: 16
slug: migration-ia-ollama-vers-claude-api
status: planned
nyquist_compliant: true
wave_0_complete: false  # scaffolds created in-plan (env.test.ts, generators-routing.test.ts, pdf-extract.test.ts, preinscription-extractor.test.ts)
created: 2026-07-03
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 16-RESEARCH.md "## Validation Architecture". The planner fills the Per-Task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (apps/web) |
| **Config file** | apps/web (vitest via package.json; no separate playwright) |
| **Quick run command** | `pnpm --filter @qualiof/web test -- <pattern>` |
| **Full suite command** | `pnpm --filter @qualiof/web test` |
| **Estimated runtime** | ~30-60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the relevant `test -- <pattern>` (e.g. `classify`, `deroule`, `env`)
- **After every plan wave:** Run `pnpm --filter @qualiof/web test` (full suite)
- **Before `/gsd:verify-work`:** Full suite green + `pnpm --filter @qualiof/web tsc --noEmit` clean
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Filled from the plans. Each code-producing task has an automated verify; Wave 0 scaffolds are created inside the same plan (tdd="true").*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | REQ-16-01 env openrouter enum + OPENROUTER_* + OLLAMA_MODEL_VISION | unit | `pnpm --filter @qualiof/shared test -- env` | ❌→created in 01 (`packages/shared/src/__tests__/env.test.ts`) | ⬜ pending |
| 16-01-02 | 01 | 1 | REQ-16-01 turbo globalEnv + .env.example | grep | `grep -q OPENROUTER_API_KEY turbo.json && grep -q OPENROUTER_API_KEY .env.example` | n/a | ⬜ pending |
| 16-02-01 | 02 | 2 | REQ-16-03 veille callLlm tier fast + tracing dynamique | unit (mock callLlm) | `pnpm --filter @qualiof/web test -- classify` | ✅ migrate mock ai-ollama→llm-client | ⬜ pending |
| 16-03-01 | 03 | 2 | REQ-16-02 vision pdf-extract callLlm({imageBuffer}) | unit (mock callLlm) | `pnpm --filter @qualiof/web test -- pdf-extract` | ❌→created in 03 (`apps/web/src/lib/__tests__/pdf-extract.test.ts`) | ⬜ pending |
| 16-03-02 | 03 | 2 | REQ-16-02 preinscription-extractor callLlm tier fast + aiModel dynamique (PII, pilier #4) | unit (mock callLlm, mutation-of-power) | `pnpm --filter @qualiof/web test -- preinscription-extractor` | ❌→created in 03 (`apps/web/src/lib/__tests__/preinscription-extractor.test.ts`) | ⬜ pending |
| 16-04-01 | 04 | 2 | REQ-16-06 tiers D-01a par générateur | tsc + grep | `pnpm --filter @qualiof/web tsc --noEmit` | ✅ | ⬜ pending |
| 16-04-02 | 04 | 2 | REQ-16-04 routage tier + retry→null(stub) | unit (mock callLlm) | `pnpm --filter @qualiof/web test -- generators-routing` | ❌→created in 04 (`apps/web/src/lib/closure/__tests__/generators-routing.test.ts`) | ⬜ pending |
| 16-05-01 | 05 | 3 | REQ-16-05 prompts re-tunés Claude + PROMPT_VERSION bump | tsc + full suite | `pnpm --filter @qualiof/web tsc --noEmit` + `pnpm --filter @qualiof/web test` | ✅ | ⬜ pending |
| 16-06-01 | 06 | 4 | REQ-16-07 pré-checks + pack témoin réel 0-stub | manual + suite | full suite + `grep -v '^#' .env | grep -q 'OPENROUTER_API_KEY=.\+'` + witness pack (AI_PROVIDER=openrouter) | manual | ⬜ pending |


---

## Wave 0 Requirements

- [x] `packages/shared/src/__tests__/env.test.ts` — created in plan 16-01 (tdd). Test stub for `env.ts` openrouter enum + OPENROUTER_* + OLLAMA_MODEL_VISION validation (currently untested)
- [x] `apps/web/src/lib/__tests__/pdf-extract.test.ts` — created in plan 16-03. Mock migration for vision OCR call site (`pdf-extract` extractTextFromImage) — mock `callLlm` instead of `callOllamaVision`
- [x] `apps/web/src/lib/__tests__/preinscription-extractor.test.ts` — created in plan 16-03 (tdd). Mock migration for the PII extraction path (`preinscription-extractor` extractDocsFromBuffers) — assert `callLlm` called with `tier:'fast'`, no `callOllama`/`OLLAMA_MODEL_FAST` path, failure→null. Mutation-of-power convention applies.
- [x] `apps/web/src/lib/closure/__tests__/generators-routing.test.ts` — created in plan 16-04. Retry-then-stub behavior test (mock `callLlm` throwing → assert stub returned after N retries)

*Existing infra covers: `veille/__tests__/classify.test.ts` and `closure/__tests__/deroule-jour-partiel.test.ts` (mock migration only, no new framework).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pack closure témoin réel via Claude | D-01/D-04 | Requires live OpenRouter key + real session; measures JSON stub-rate | Generate a witness pack (e.g. 1 session, 3-5 stagiaires) with `AI_PROVIDER=openrouter`; assert 0 stub, docs varied |
| OCR CNI/RIB via Claude vision | D-02 | Requires real image + live key | Upload a test CNI photo through preinscription; assert fields extracted |
| RGPD/DPA basis for cloud vision PII | D-02b | Non-code compliance action (checkpoint:decision in Plan 16-06, wave 4) | Document OpenRouter + Anthropic sub-processors before prod vision |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (env.test, pdf-extract.test, preinscription-extractor.test, generators-routing.test)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Preinscription PII path (pilier #4) covered by a real unit verify (no tsc escape hatch)

**Approval:** planner-approved 2026-07-03 (revised for checker feedback: 16-03-02 real unit verify, OLLAMA_MODEL_VISION declared, 16-06 API-key gate)
</content>

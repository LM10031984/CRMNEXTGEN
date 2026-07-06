---
phase: 16-migration-ia-ollama-vers-claude-api
plan: 01
subsystem: env / config
tags: [env, t3-env, openrouter, boot-safety, single-source-of-truth]
requires: []
provides:
  - "AI_PROVIDER enum accepte 'openrouter' (boot-safe)"
  - "7 clés OPENROUTER_* validées par t3-env (single source of truth)"
  - "OLLAMA_MODEL_VISION déclarée (clé fantôme régularisée)"
  - "turbo.json globalEnv invalide le cache sur changement OPENROUTER_*/OLLAMA_MODEL_VISION"
  - ".env.example documente la bascule cloud OpenRouter"
affects:
  - packages/shared/src/env.ts
  - turbo.json
  - .env.example
tech-stack:
  added: []
  patterns:
    - "Schémas Zod isolés exportés (AI_PROVIDER_SCHEMA / OPENROUTER_MODEL_FAST_SCHEMA) pour test unitaire sans createEnv complet"
key-files:
  created:
    - packages/shared/src/__tests__/env.test.ts
  modified:
    - packages/shared/src/env.ts
    - turbo.json
    - .env.example
decisions:
  - "Tester les schémas Zod isolés plutôt que sharedEnv complet (évite de fournir DATABASE_URL/AUTH_SECRET en test)"
  - "OPENROUTER_API_KEY reste optional() — llm-client throw déjà en runtime si vide ; requis casserait le dev local Ollama"
metrics:
  duration: "~6 min"
  completed: 2026-07-03
  tasks: 2
  files: 4
  commits: 2
---

# Phase 16 Plan 01 : env.ts boot-safe OpenRouter Summary

Rend le provider `openrouter` boot-safe : l'enum `AI_PROVIDER` accepte désormais `'openrouter'` (le boot ne throw plus `Invalid enum value`), les 7 clés `OPENROUTER_*` lues par `llm-client.ts` via `process.env` brut sont maintenant validées par t3-env, et la clé fantôme `OLLAMA_MODEL_VISION` (lue L23/L71 de `llm-client.ts` mais jamais déclarée) est régularisée — single source of truth respectée.

## What Was Built

### Task 1 — env.ts + test (TDD, commit `537c8ad`)
- `packages/shared/src/env.ts` :
  - Enum `AI_PROVIDER` étendu : `z.enum(['ollama', 'openrouter', 'anthropic', 'qualiopi-gen'])`.
  - `OLLAMA_MODEL_VISION: z.string().default('llama3.2-vision:11b')` déclarée (server + runtimeEnv).
  - 7 clés `OPENROUTER_*` déclarées (server + runtimeEnv) avec les défauts EXACTS de `llm-client.ts` : `OPENROUTER_BASE_URL`, `OPENROUTER_API_KEY` (optional), `OPENROUTER_MODEL_FAST`, `OPENROUTER_MODEL_QUALITY`, `OPENROUTER_MODEL_VISION`, `OPENROUTER_APP_NAME`, `OPENROUTER_SITE_URL`.
  - Deux schémas isolés exportés (`AI_PROVIDER_SCHEMA`, `OPENROUTER_MODEL_FAST_SCHEMA`) réutilisés dans le bloc `server` ET testés directement.
- `packages/shared/src/__tests__/env.test.ts` : 4 tests (openrouter accepté, ollama préservé, provider invalide rejeté = fail loud, défaut OPENROUTER_MODEL_FAST appliqué). TDD RED → GREEN prouvé (RED : 3 échecs `Cannot read properties of undefined` avant les exports ; GREEN : 4/4).

### Task 2 — turbo.json + .env.example (commit `a4d53ce`)
- `turbo.json` `globalEnv` : +`OLLAMA_MODEL_VISION` (était absente) + 7 clés `OPENROUTER_*` → invalidation cache Turbo sur changement.
- `.env.example` : bloc `# --- OpenRouter (cloud Claude via gateway, milestone v6) ---` avec les 7 clés + défauts commentés, `AI_PROVIDER` documente la valeur `openrouter`, `OPENROUTER_API_KEY` notée requise si provider=openrouter. `OLLAMA_MODEL_VISION` déjà présente L42 (non dupliquée).

## Verification

- `packages/shared/src/__tests__/env.test.ts` : 4/4 verts (exécuté via binaire vitest root-résolu, cf. Deviations).
- `tsc --noEmit` sur `src/env.ts` (source non-test) : clean, 0 erreur.
- Acceptance greps tous OK : enum `'ollama', 'openrouter'` présent, `OLLAMA_MODEL_VISION` count=2, `OPENROUTER_` count=15 (≥14) dans env.ts ; `OPENROUTER_` count=7 dans turbo.json ; `OPENROUTER_API_KEY` + `openrouter` dans .env.example ; turbo.json JSON valide.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Résolution du binaire vitest/tsc (symlink pnpm périmé)**
- **Found during:** Task 1, `pnpm --filter @qualiof/shared test -- env`.
- **Issue:** `packages/shared/node_modules/vitest` pointe sur `vitest@2.1.9_@types+node@22.19.17` (sans suffixe `_jsdom`) alors que le package réel dans le store pnpm est `vitest@2.1.9_@types+node@22.19.17_jsdom@25.0.1` → `Cannot find module '.../vitest/vitest.mjs'`. Idem `.bin/tsc`. Bloque l'exécution du test.
- **Fix (verification-only, aucune modif de code) :** test exécuté via le binaire root-résolu `node node_modules/.pnpm/vitest@2.1.9_..._jsdom@25.0.1/node_modules/vitest/vitest.mjs run env` → 4/4 verts. tsc source exécuté via `node_modules/typescript/bin/tsc`.
- **Files modified:** aucun (contournement d'exécution uniquement).

### Deferred (out of scope — SCOPE BOUNDARY)

- **Drift symlink pnpm sur `packages/shared`** : affecte IDENTIQUEMENT les 8 fichiers de test pré-existants (`tsc` reporte `TS2307 Cannot find module 'vitest'` sur tous). Non causé par ce plan. Logué dans `deferred-items.md`. Correctif suggéré (non appliqué) : `pnpm install` au root pour réparer le symlink.

## Known Stubs

Aucun. Les 4 fichiers touchés sont de la config/validation (pas d'UI, pas de data source).

## Self-Check: PASSED

- Fichiers créés/modifiés : 5/5 FOUND (env.ts, env.test.ts, turbo.json, .env.example, 16-01-SUMMARY.md).
- Commits : 2/2 FOUND (537c8ad, a4d53ce).

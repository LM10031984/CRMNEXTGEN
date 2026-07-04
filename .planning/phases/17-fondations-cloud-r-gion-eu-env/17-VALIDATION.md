---
phase: 17
slug: fondations-cloud-r-gion-eu-env
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-04
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (`apps/web` + `packages/shared`) |
| **Config file** | `vitest.config.ts` par package (pas de Jest ; Playwright = Phase 21) |
| **Quick run command** | `pnpm --filter @qualiof/shared exec vitest run src/__tests__/env.test.ts` |
| **Full suite command** | `pnpm --filter @qualiof/shared exec vitest run && pnpm --filter @qualiof/web exec vitest run` |
| **Estimated runtime** | ~30 seconds (quick) / ~120 seconds (full) |

> Note symlink (historique 16-01) : lancer vitest/tsc via `pnpm --filter … exec` — symlink `node_modules/vitest` parfois périmé → `pnpm install` root si TS2307.

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @qualiof/shared exec vitest run src/__tests__/env.test.ts` + grep du critère touché
- **After every plan wave:** Run full suite shared + web (`vitest run`) + `pnpm --filter @qualiof/web build` (prouve le fail-loud réel : build vert avec env valide, throw avec env cassé)
- **Before `/gsd:verify-work`:** Full suite verte + boot test négatif (env cassé → throw) + les 6 greps critères verts
- **Max feedback latency:** 120 seconds

---

## Wave 0 embedding (Nyquist)

> Nyquist compliance : chaque comportement testable a un `<automated>` verify avec le test créé AVANT (ou dans) la task qui le consomme. Ici les tests Wave 0 sont EMBARQUÉS dans les tasks TDD, pas isolés dans une task Wave 0 séparée :
>
> - **`packages/shared/src/__tests__/env.test.ts`** (schémas cloud STORAGE_PROVIDER/WEASYPRINT_URL/DIRECT_URL) → créé/étendu dans **17-02 Task 1** (`tdd="true"`, bloc `<behavior>` = 7 assertions RED→GREEN). Le verify `vitest run env.test.ts` exécute ces tests.
> - **`apps/web/src/lib/__tests__/pdf-render.test.ts`** (Bearer sur les 2 fonctions, mutation-safe) → créé dans **17-03 Task 1** (`tdd="true"`, RED puis GREEN dans la même task). Le verify `vitest run pdf-render.test.ts` l'exécute.
> - **Preuve du chokepoint boot fail-loud** → intégrée directement dans le `<verify><automated>` de **17-02 Task 2** : build POSITIF (env valide → `BUILD_VALID_OK`) + build NÉGATIF (env cloud malformé → `FAILLOUD_OK`). Le mécanisme (next.config.mjs + workers) est créé dans la même task qui le prouve.
>
> Conclusion : `nyquist_compliant: true` — aucun comportement testable sans son test embarqué dans la task productrice ; pas de trou d'échantillonnage de 3 tasks consécutives sans verify automatisé. `wave_0_complete: true` car les 3 artefacts de test (env.test.ts, pdf-render.test.ts, preuve boot) sont couverts par les tasks TDD 17-02/17-03 et non par une task Wave 0 orpheline.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| T1 | 17-01 | 1 | CLOUDENV-01 | manual/grep | `grep -E "eu-west-3\|cdg1\|europe-west4\|eu-central-1" .planning/phases/17-*/17-REGIONS.md` | 🔨 T1 crée | ⬜ pending |
| T1 | 17-02 | 1 | CLOUDENV-02 (2a) | grep + unit (TDD embarqué) | 5 clés présentes dans `packages/shared/src/env.ts` ET `grep -c DOC_ENGINE_URL packages/shared/src/env.ts turbo.json .env.example` = 0 ; `env.test.ts` vert | 🔨 T1 étend env.test.ts | ⬜ pending |
| T2 | 17-02 | 1 | CLOUDENV-02 (2b) | integration/boot (embarqué dans verify T2) | build POSITIF (`pnpm --filter @qualiof/web build` → `BUILD_VALID_OK`) + build NÉGATIF (`DIRECT_URL="pas-url"`/`SUPABASE_URL="pas-url" STORAGE_PROVIDER=supabase pnpm --filter @qualiof/web build` → throw → `FAILLOUD_OK`) | 🔨 T2 crée le chokepoint | ⬜ pending |
| T2 | 17-02 | 1 | CLOUDENV-02 (2c) | grep | `grep -rn "process.env.\(SUPABASE_URL\|STORAGE_PROVIDER\|WEASYPRINT_URL\)" apps/web/src` → 0 | ✅ | ⬜ pending |
| T2 | 17-02 | 1 | CLOUDENV-02 (3) | grep | 5 clés dans `turbo.json` globalEnv, `DOC_ENGINE_URL` = 0 | ✅ | ⬜ pending |
| T1 | 17-03 | 2 | CLOUDENV-03 (4) | unit + grep (TDD embarqué) | `pdf-render.test.ts` créé RED→GREEN dans la task : mock fetch → assert `Authorization: Bearer` sur les 2 fonctions ; `grep -c "Authorization.*Bearer" apps/web/src/lib/pdf-render.ts` ≥ 1 | 🔨 T1 crée pdf-render.test.ts | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · 🔨 créé par la task*

---

## Wave 0 Requirements (embarqués dans les tasks TDD — pas de task Wave 0 séparée)

- [x] `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` — doc région EU auditable des 4 plateformes (critère 1) → 17-01 Task 1 (doc-only, pas de test)
- [x] `packages/shared/src/__tests__/env.test.ts` — étendre avec schémas `STORAGE_PROVIDER`/`WEASYPRINT_URL`/`DIRECT_URL` → **embarqué 17-02 Task 1 (TDD, `<behavior>` RED→GREEN)**
- [x] `apps/web/src/lib/__tests__/pdf-render.test.ts` — nouveau, teste le Bearer sur les 2 fonctions (mock fetch, mutation-safe) → **embarqué 17-03 Task 1 (TDD, RED→GREEN dans la task)**
- [x] Preuve du chokepoint boot : commande démontrant que `next build` throw sur env malformé → **intégrée à la `<verify><automated>` de 17-02 Task 2 (build positif `BUILD_VALID_OK` + build négatif `FAILLOUD_OK`)**

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Doc régions EU lisible et complète | CLOUDENV-01 | Contenu rédactionnel, jugement humain | Lire `17-REGIONS.md` : vérifier que les 4 plateformes (Supabase, Vercel, Upstash, Railway/Fly) ont une région EU explicite et une note d'irréversibilité |
| Test de puissance (mutation) au gate | CLOUDENV-03 | Convention projet | Retirer le header Bearer dans `pdf-render.ts` → `pdf-render.test.ts` doit passer au rouge → restaurer |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Wave 0 embarqué dans les tasks TDD 17-02 T1 / 17-03 T1 ; preuve boot dans verify 17-02 T2)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (aucun `MISSING` restant — tests créés dans les tasks productrices)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready (nyquist compliant — Wave 0 embarqué)

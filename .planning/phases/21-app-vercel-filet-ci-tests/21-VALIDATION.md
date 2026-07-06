---
phase: 21
slug: app-vercel-filet-ci-tests
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-06
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 (existant, baseline 1166+ verts) + Playwright ^1.61.1 (installé au plan 21-05 Task 1) |
| **Config file** | `apps/web/vitest.config.ts`, `packages/db/vitest.config.ts` ; `apps/web/playwright.config.ts` (créé 21-05) |
| **Quick run command** | `pnpm --filter @qualiof/web exec dotenv -e ../../.env -- vitest run <fichier>` |
| **Full suite command** | `pnpm test` (turbo → vitest web + db) |
| **Estimated runtime** | Vitest complet ~90 s · Playwright smoke ~2 min · E2E closure ~5-15 min (à la demande, D-10) |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @qualiof/web exec tsc --noEmit` + vitest ciblé sur les fichiers touchés
- **After every plan wave:** `pnpm test` (suite complète) + `pnpm lint`
- **Before `/gsd:verify-work`:** suite complète verte + CI verte sur main + Playwright smoke & E2E verts contre le staging (21-SMOKE.md rempli)
- **Max feedback latency:** 120 s (hors E2E closure, run long à la demande)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | APP-01 | config/grep | grep vercel.json cdg1 + tsc --noEmit shared | ✅ (grep) | ⬜ pending |
| 21-01-02 | 01 | 1 | APP-01 | unit (TDD) | `… vitest run src/lib/__tests__/pdf-render.watermark.test.ts` | ❌ W0 (créé par la task, RED d'abord) | ⬜ pending |
| 21-01-03 | 01 | 1 | APP-01/APP-02 | grep + unit | greps sameSite/StagingBanner/maxDuration + vitest calendar | ✅ (tests calendar existants) | ⬜ pending |
| 21-02-01 | 02 | 1 | TEST-01/02 (préreq D-06) | script DRY | `… tsx scripts/migrate-storage.ts` (DRY) | ✅ (script Phase 18) | ⬜ pending |
| 21-02-02 | 02 | 1 | TEST-01/02 (préreq D-06) | script WRITE + rapport | `WRITE=1 … tsx scripts/migrate-storage.ts` + grep rapport | ✅ | ⬜ pending |
| 21-03-01 | 03 | 2 | CI-01 | grep workflows | greps ci.yml/deploy.yml | ✅ (grep) | ⬜ pending |
| 21-03-02 | 03 | 2 | CI-01 | CI runtime | `gh run list --branch main` success + `gh api …/protection` | ✅ (gh) | ⬜ pending |
| 21-03-03 | 03 | 2 | CI-01 | PR témoin | `gh pr list --state merged --search "PR témoin"` | ✅ (gh) | ⬜ pending |
| 21-04-01 | 04 | 3 | APP-01/02/03 | doc/grep | greps runbook (env checklist, WAF, 22 OF_*) | ✅ (grep) | ⬜ pending |
| 21-04-02 | 04 | 3 | APP-01/02/03 | checkpoint human-action | dashboard Vercel + DNS (runbook) | — | ⬜ pending |
| 21-04-03 | 04 | 3 | APP-01/02, D-13 | curl runtime | curl 200/cdg1/STAGING/307/429 + evidence runbook | ✅ (curl) | ⬜ pending |
| 21-05-01 | 05 | 4 | APP-02 | setup + tsc | greps config/user script + tsc + run create-e2e-user | ❌ W0 (créés par la task) | ⬜ pending |
| 21-05-02 | 05 | 4 | TEST-02, APP-02 | e2e | `STAGING_BASE_URL=… playwright test e2e/auth.setup.ts e2e/smoke-routes.spec.ts` | ❌ W0 | ⬜ pending |
| 21-05-03 | 05 | 4 | TEST-02 (PENDING 18) | e2e | `… playwright test e2e/upload-preenrollment.spec.ts` | ❌ W0 | ⬜ pending |
| 21-06-01 | 06 | 5 | TEST-01 (teardown) | script | `… tsx e2e/teardown-e2e-data.ts` (idempotent, compteurs 0) | ❌ W0 | ⬜ pending |
| 21-06-02 | 06 | 5 | TEST-01, APP-03 | e2e long | `… playwright test e2e/closure-flow.spec.ts` (15 min) | ❌ W0 | ⬜ pending |
| 21-06-03 | 06 | 5 | phase gate | doc + gh | greps 21-SMOKE.md + `gh pr list --state merged` | ✅ (grep/gh) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Les artefacts de test MANQUANTS sont créés par les tasks elles-mêmes, en interface-first / RED d'abord :

- [ ] `apps/web/src/lib/__tests__/pdf-render.watermark.test.ts` — APP-01 (plan 21-01 Task 2, TDD RED→GREEN)
- [ ] `apps/web/playwright.config.ts` + `e2e/auth.setup.ts` — APP-02 (plan 21-05 Task 1)
- [ ] `apps/web/e2e/smoke-routes.spec.ts` — TEST-02 (plan 21-05 Task 2)
- [ ] `apps/web/e2e/upload-preenrollment.spec.ts` — PENDING 18 (plan 21-05 Task 3)
- [ ] `apps/web/e2e/teardown-e2e-data.ts` + `closure-flow.spec.ts` — TEST-01 (plan 21-06 Tasks 1-2)
- [ ] Install `@playwright/test` + chromium (plan 21-05 Task 1)
- [ ] User E2E dédié en base (`scripts/create-e2e-user.ts`) + secrets locaux `E2E_LOGIN_*` (plan 21-05 Task 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Création projet Vercel + env + domaine + WAF | APP-01/02/03, D-13 | Dashboard Vercel + DNS registrar — pas de CLI (pattern verrouillé RESEARCH ; Vercel CLI explicitement exclu) | Runbook `21-DEPLOY-VERCEL.md`, checkpoint plan 21-04 Task 2 |
| Retry upload sur coupure réseau mobile réelle | PENDING 18-SMOKE ② | Coupure réseau réelle non simulable de façon fiable en Playwright | Test terrain smartphone post-bascule ; tracé dans 21-SMOKE.md comme reporté |
| Expiration signed URL 11 min temps réel | PENDING 18-SMOKE ③ | Attente 11 min temps réel ; mécanisme JWT exp déjà prouvé en 18-04 | Tracé dans 21-SMOKE.md (non re-testé, couvert par équivalence) |
| Dialog pricing WAF rate-limit | D-13 | S'affiche uniquement dans le dashboard à la création de la règle | Valider le montant à l'écran avant Publish (fallback Postgres documenté au runbook) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (tous les runs = `vitest run` / `playwright test`, jamais watch)
- [x] Feedback latency < 120s (hors E2E closure long, à la demande D-10)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (rempli à l'exécution — plan 21-06 Task 3)

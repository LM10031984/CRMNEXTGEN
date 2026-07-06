---
phase: 21
slug: app-vercel-filet-ci-tests
status: executed
nyquist_compliant: true
wave_0_complete: true
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
| 21-01-01 | 01 | 1 | APP-01 | config/grep | grep vercel.json cdg1 + tsc --noEmit shared | ✅ (grep) | ✅ green (2026-07-06) |
| 21-01-02 | 01 | 1 | APP-01 | unit (TDD) | `… vitest run src/lib/__tests__/pdf-render.watermark.test.ts` | ✅ créé (RED→GREEN) | ✅ green — 5/5 |
| 21-01-03 | 01 | 1 | APP-01/APP-02 | grep + unit | greps sameSite/StagingBanner/maxDuration + vitest calendar | ✅ | ✅ green (suite 1176/1176) |
| 21-02-01 | 02 | 1 | TEST-01/02 (préreq D-06) | script DRY | `… tsx scripts/migrate-storage.ts` (DRY) | ✅ (script Phase 18) | ✅ green — 899 clés, audit d'écart 733 manquants identifiés |
| 21-02-02 | 02 | 1 | TEST-01/02 (préreq D-06) | script WRITE + rapport | `WRITE=1 … tsx scripts/migrate-storage.ts` + grep rapport | ✅ | ✅ green — 871 copiés, re-audit 899/899, 0 lien mort |
| 21-03-01 | 03 | 2 | CI-01 | grep workflows | greps ci.yml/deploy.yml | ✅ (grep) | ✅ green |
| 21-03-02 | 03 | 2 | CI-01 | CI runtime | `gh run list --branch main` success + `gh api …/protection` | ✅ (gh) | ✅ green — CI+Deploy success, contexts ["test"], force-push off |
| 21-03-03 | 03 | 2 | CI-01 | PR témoin | `gh pr list --state merged --search "PR témoin"` | ✅ (gh) | ✅ green — PR #1 BLOCKED→merged |
| 21-04-01 | 04 | 3 | APP-01/02/03 | doc/grep | greps runbook (env checklist, WAF, 22 OF_*) | ✅ (grep) | ✅ green |
| 21-04-02 | 04 | 3 | APP-01/02/03 | checkpoint human-action | dashboard Vercel + DNS (runbook) | — | ✅ green — exécuté par API/CLI (autorisation Laurent) ; ⚠ DNS domaine final PENDING webmaster |
| 21-04-03 | 04 | 3 | APP-01/02, D-13 | curl runtime | curl 200/cdg1/STAGING/307/429 + evidence runbook | ✅ (curl) | ✅ green — ⚠ WAF deny = 403 (équivalent accepté, pas 429) |
| 21-05-01 | 05 | 4 | APP-02 | setup + tsc | greps config/user script + tsc + run create-e2e-user | ✅ créés | ✅ green |
| 21-05-02 | 05 | 4 | TEST-02, APP-02 (login+logout) | e2e | `STAGING_BASE_URL=… playwright test e2e/auth.setup.ts e2e/smoke-routes.spec.ts e2e/auth-logout.spec.ts` | ✅ créés | ✅ green — 22/22 (43 s) |
| 21-05-03 | 05 | 4 | TEST-02 (PENDING 18) | e2e | `… playwright test e2e/upload-preenrollment.spec.ts` | ✅ créé | ✅ green — 10 Mo, zéro 413, aucun body ≥4 Mo via Vercel |
| 21-06-01 | 06 | 5 | TEST-01 (teardown) | script | `… tsx e2e/teardown-e2e-data.ts` (idempotent, compteurs 0) | ✅ créé | ✅ green — run à blanc + post-run = tous compteurs 0 |
| 21-06-02 | 06 | 5 | TEST-01, APP-03 | e2e long | `… playwright test e2e/closure-flow.spec.ts` (15 min) | ✅ créé | ✅ green — 2 passed (2.3 min), pack 16/16 en 89 s, 0 stub, %PDF- ×2 |
| 21-06-03 | 06 | 5 | phase gate | doc + gh | greps 21-SMOKE.md + `gh pr list --state merged` | ✅ (grep/gh) | ✅ green — 21-SMOKE.md consolidé, PR finale mergée |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Les artefacts de test MANQUANTS sont créés par les tasks elles-mêmes, en interface-first / RED d'abord :

- [x] `apps/web/src/lib/__tests__/pdf-render.watermark.test.ts` — APP-01 (plan 21-01 Task 2, TDD RED→GREEN)
- [x] `apps/web/playwright.config.ts` + `e2e/auth.setup.ts` — APP-02 (plan 21-05 Task 1)
- [x] `apps/web/e2e/smoke-routes.spec.ts` — TEST-02 (plan 21-05 Task 2)
- [x] `apps/web/e2e/auth-logout.spec.ts` — APP-02 logout, session fraîche sans storageState (plan 21-05 Task 2)
- [x] `apps/web/e2e/upload-preenrollment.spec.ts` — PENDING 18 (plan 21-05 Task 3)
- [x] `apps/web/e2e/teardown-e2e-data.ts` + `closure-flow.spec.ts` — TEST-01 (plan 21-06 Tasks 1-2)
- [x] Install `@playwright/test` + chromium (plan 21-05 Task 1)
- [x] User E2E dédié en base (`scripts/create-e2e-user.ts`) + secrets locaux `E2E_LOGIN_*` (plan 21-05 Task 1)

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

**Approval:** ✅ approved — 2026-07-06 (plan 21-06 Task 3). Toutes les vérifications automatisées sont
vertes (map ci-dessus), evidence consolidée dans `21-SMOKE.md`. Restent MANUAL/reportés (pas des échecs) :
retry réseau mobile réel, expiration signed URL 11 min (équivalence 18-04), domaine final PENDING DNS.

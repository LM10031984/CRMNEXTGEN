---
phase: 20
slug: worker-3-h-te-doc-engines
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-05
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (apps/web, packages/shared) + pytest 8.3.3 (docker/weasyprint, venv local) |
| **Config file** | apps/web/vitest.config.* (existant) ; pas de Playwright (TEST-01 = Phase 21) |
| **Quick run command** | `pnpm --filter @qualiof/web test -- <pattern>` |
| **Full suite command** | `pnpm --filter @qualiof/web test && pnpm --filter @qualiof/shared test` |
| **Estimated runtime** | ~40 secondes (suite web) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @qualiof/web test -- <module touche>` + `tsc --noEmit`
- **After every plan wave:** Run full suite web + shared
- **Before `/gsd:verify-work`:** Full suite must be green + smoke reel (20-SMOKE.md) rempli
- **Max feedback latency:** ~40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | WORK-02 | unit/tsc | `pnpm --filter @qualiof/web exec tsc --noEmit` | ✅ (source) | ⬜ pending |
| 20-01-02 | 01 | 1 | WORK-02 | unit | `pnpm --filter @qualiof/web test -- cron-workers` | ❌ W0 (cree par la task) | ⬜ pending |
| 20-02-01 | 02 | 1 | WORK-04 | tsc | `pnpm --filter @qualiof/web exec tsc --noEmit` | ✅ (source) | ⬜ pending |
| 20-02-02 | 02 | 1 | WORK-04 | unit | `pnpm --filter @qualiof/web test -- preinscription-ocr-queue` | ❌ W0 (cree par la task) | ⬜ pending |
| 20-03-01 | 03 | 1 | WORK-01 | unit (pytest) | `pytest docker/weasyprint/test_auth.py` | ❌ W0 (cree par la task) | ⬜ pending |
| 20-03-02 | 03 | 1 | WORK-01 | config validate | `caddy validate --config docker/gotenberg-proxy/Caddyfile` | ❌ W0 (cree par la task) | ⬜ pending |
| 20-04-01 | 04 | 2 | WORK-01 | tsc + suite | `tsc --noEmit && pnpm --filter @qualiof/web test` | ✅ (suite) | ⬜ pending |
| 20-04-02 | 04 | 2 | WORK-01/03 | config load | `node -e "require('./ecosystem.config.cjs')"` + JSON parse railway.json | ❌ W0 (cree par la task) | ⬜ pending |
| 20-04-03 | 04 | 2 | WORK-01 | grep doc | `grep -c europe-west4 20-DEPLOY.md` | ❌ W0 (cree par la task) | ⬜ pending |
| 20-05-02 | 05 | 3 | WORK-01/02/03/04 | smoke reel (infra) | `grep -c "RESULTATS DE VALIDATION" 20-SMOKE.md` | ❌ smoke (infra reelle) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/scripts/__tests__/cron-workers.test.ts` — tests croner veille/reminders (WORK-02, cree par 20-01 Task 2)
- [ ] `apps/web/src/lib/__tests__/preinscription-ocr-queue.test.ts` — tests driver OCR poll (WORK-04, cree par 20-02 Task 2)
- [ ] `docker/weasyprint/test_auth.py` — tests Bearer Flask (WORK-01, cree par 20-03 Task 1)
- [ ] Framework install : aucun (Vitest present ; pytest via venv local /tmp/wp-venv)

*Chaque test est cree par la task qui produit le code correspondant (task-level TDD ou test-avec-code).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Build image Docker + `pdftoppm -v` dans le conteneur | WORK-01 | Necessite Docker/Railway (infra) | Plan 20-05 P1 : exec worker `pdftoppm -v` |
| Pack closure 100 % cloud Mac eteint, 0 stub | WORK-03 | Infra reelle + Mac eteint | Plan 20-05 P4 : enqueuer ClosureJob, verifier stub rate 0 |
| doc-engines Bearer 401/200 apres restart | WORK-01 | Domaine public Railway | Plan 20-05 P2 : curl gotenberg-proxy + weasyprint |
| OCR PDF scanne -> EXTRACTED donnees reelles | WORK-04 | Infra + pdftoppm + vision | Plan 20-05 P6 : depot CNI scannee via /p/[token] |
| Egress SMTP OVH :465 depuis worker | WORK-02 | Railway Pro + OVH | Plan 20-05 P5 : envoi test |
| Stabilite 24 h + cout projete sous budget | WORK-02/03 | Observation 24 h facturation | Plan 20-05 P7 : pm2 uptime + dashboard Railway |

*L'anti-degradation D-06 (sans poppler -> warning, pas EXTRACTED vide) est couverte par un test unitaire pdf-extract branche "pdftoppm introuvable" (existant) + le filet du driver OCR (test 20-02 Task 2 Test 3).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (3 nouveaux fichiers test crees par leur task)
- [x] No watch-mode flags (verify commands sans --watch)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready

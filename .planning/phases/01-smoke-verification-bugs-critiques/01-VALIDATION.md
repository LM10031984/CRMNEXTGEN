---
phase: 1
slug: smoke-verification-bugs-critiques
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-12
notes: |
  Manual-only verifications (BUG-02 sticky captures, BUG-01 runtime browser check)
  acceptable per CONTEXT.md decision: no E2E framework in scope (Playwright deferred v2).
  Each manual task adjacent to an automated assertion (vitest, curl, or grep) ensuring
  sampling continuity. Wave 0 (vitest.config.ts + smoke test file) created in-line by
  Plan 01-01 Task 1.2 before consumption by Tasks 1.3 / future plans.
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (declared in `apps/web/package.json`) |
| **Config file** | none today — Wave 0 adds `apps/web/vitest.config.ts` if needed |
| **Quick run command** | `pnpm --filter @qualiof/web exec vitest run src/app/app/sessions/\[id\]/__tests__/` |
| **Full suite command** | `pnpm --filter @qualiof/web test` |
| **Estimated runtime** | ~5-10 seconds (quick) · ~30-60 seconds (full) |

Plus manual verifications via `curl` (redirects) and browser DevTools (sticky).

---

## Sampling Rate

- **After every task commit:** Run quick command if it touched tests / pages under test.
- **After every plan wave:** Run full suite + manual checklist (sticky captures + curl redirects).
- **Before `/gsd:verify-work`:** Full suite green + manual checklist complete with attached evidence.
- **Max feedback latency:** 60 seconds (quick) · 90 seconds (full + manual).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | BUG-01 | unit (smoke) | `pnpm --filter @qualiof/web exec vitest run src/app/app/sessions/\[id\]/__tests__/page.smoke.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | BUG-01 | manual | `rm -rf apps/web/.next && pnpm --filter @qualiof/web dev` + browser visit | ✅ | ⬜ pending |
| 1-02-01 | 02 | 1 | BUG-03 | manual (curl) | `curl -sI http://localhost:3000/app/pre-inscriptions \| grep -E 'HTTP\|Location'` | ✅ | ⬜ pending |
| 1-02-02 | 02 | 1 | BUG-03 | manual (curl) | `curl -sI http://localhost:3000/app/modeles \| grep -E 'HTTP\|Location'` | ✅ | ⬜ pending |
| 1-02-03 | 02 | 1 | BUG-03 | unit (config inspect) | optional Vitest test that imports `next.config.mjs` and asserts redirects | ❌ W0 (optional) | ⬜ pending |
| 1-03-01 | 03 | 1 | BUG-02 | manual (devtools) | open page, `getComputedStyle(header).position === 'sticky'` in console | ✅ | ⬜ pending |
| 1-03-02 | 03 | 1 | BUG-02 | manual (screenshot) | capture top + 500px scroll on 3 pages | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/vitest.config.ts` — minimal Vitest config for Next.js+TSX (env: jsdom, alias `@/` → `./src/`). Verify if Vitest already picks up `apps/web/src/**/*.test.ts` files via inherited config; if yes, skip this Wave 0 item.
- [ ] `apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts` — test stub for BUG-01 (created in Plan 01).
- [ ] (Optional) `apps/web/__tests__/next-config.redirects.test.ts` — test stub for BUG-03 (created in Plan 02).

*Note : Pas d'install Vitest needed (déjà présent). Pas de framework Playwright à ajouter (out of scope).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Header reste sticky au scroll sur dashboard | BUG-02 | Sticky est un comportement visuel browser dynamique ; pas de framework E2E configuré | 1. `pnpm --filter @qualiof/web dev` 2. Login 3. Aller `/app` 4. Scroller 500px 5. Vérifier header visible en haut + DevTools `getComputedStyle($('header')).position === 'sticky'` 6. Capture |
| Header reste sticky sur sessions list | BUG-02 | idem | Idem mais sur `/app/sessions` |
| Header reste sticky sur fiche apprenant | BUG-02 | idem | Idem mais sur `/app/apprenants/<un id>` |
| Page sessions/[id] boote sans erreur runtime | BUG-01 | Test runtime confirmant absence d'erreur de cache stale | 1. `rm -rf apps/web/.next` 2. `pnpm --filter @qualiof/web dev` 3. `/app/sessions/<id valide>` 4. DevTools console : pas de `is not defined` 5. Capture |
| Redirect `/app/pre-inscriptions` → `/app/preinscriptions` | BUG-03 | Vérification rapide curl avec dev server | `curl -sI localhost:3000/app/pre-inscriptions` → `308` + `Location: /app/preinscriptions` |
| Redirect `/app/modeles` → `/app/templates` | BUG-03 | idem | `curl -sI localhost:3000/app/modeles` → `308` + `Location: /app/templates` |
| No regression sur 6 écrans clés | (all 3 bugs) | QA visuel | Cliquer chaque entrée sidebar : dashboard, sessions list, sessions détail, apprenants list, apprenant détail (3 onglets), dossier OPCO détail. Pas d'erreur console nouvelle. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify (smoke test BUG-01 + optional config test BUG-03) OR manual verification with concrete grep-checkable steps
- [ ] Sampling continuity: each plan has at least 1 verification step; no plan goes without check
- [ ] Wave 0 covers: vitest.config.ts (if needed), smoke test file stubs
- [ ] No watch-mode flags (`vitest run`, not `vitest watch`)
- [ ] Feedback latency < 90 seconds end-to-end
- [ ] `nyquist_compliant: true` to be set in frontmatter after Wave 0 complete

**Approval:** pending

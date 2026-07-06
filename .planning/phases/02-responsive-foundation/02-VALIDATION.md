---
phase: 2
slug: responsive-foundation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-12
notes: |
  Validation principalement manuelle (responsive = comportement visuel par viewport).
  Aucun framework E2E configuré (Playwright deferred v2). Chaque task code est
  vérifiable via grep et build success ; les manual checks sont scope par viewport.
---

# Phase 2 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (déjà configuré Phase 1, `apps/web/vitest.config.ts`) |
| **Quick run command** | `cd apps/web && npx vitest run` |
| **Build verification** | `pnpm --filter @qualiof/web build` |
| **Manual viewport check** | DevTools responsive mode |
| **Estimated runtime** | ~1 sec (vitest) · ~60 sec (build) · ~5 min (manual viewports) |

## Sampling Rate

- **After every task commit :** grep checks acceptance_criteria + `pnpm build` si changement TSX significatif
- **After plan wave :** captures sur 4 viewports (390 / 768 / 1024 / 1440) sur dashboard + sessions list
- **Before phase verification :** drawer mobile testé interactivement (open / nav / close)

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated | Manual |
|---------|------|------|-------------|-----------|-----------|--------|
| 2-01-01 | 01 | 1 | RESP-01 | breakpoint test | — | viewport color shift |
| 2-01-02 | 01 | 1 | RESP-01 | docs correction | `grep` | — |
| 2-02-01 | 02 | 1 | RESP-02 | extract NAV | `grep + build` | — |
| 2-02-02 | 02 | 1 | RESP-02 | MobileNavDrawer | `grep + build` | drawer open/nav/close |
| 2-02-03 | 02 | 1 | RESP-02 | hamburger TopBar | `grep + build` | visible < md only |
| 2-03-01 | 03 | 1 | RESP-03 | MainContent ml | `grep` | viewport margin |
| 2-04-01 | 04 | 2 | tous | bookkeeping | `grep` | — |

## Wave 0 Requirements

Aucune. Vitest config + helpers déjà en place depuis Phase 1.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Breakpoints sm/md/lg/xl actifs | RESP-01 | CSS computed depend on viewport browser | Ajouter div test couleurs, redimensionner browser de 320 → 1600 px |
| Sidebar cachée en mobile | RESP-02 | computed style depend on viewport | DevTools 390px : `<aside>` invisible |
| Hamburger visible en mobile | RESP-02 | idem | DevTools 390px : bouton `<Menu />` rendu dans TopBar |
| Drawer ouvre + ferme | RESP-02 | Interaction | Clic hamburger → drawer slide-in, clic item → ferme + navigate |
| Drawer recouvre TopBar (z-index OK) | RESP-02 | Visual | Drawer overlay z-50 > TopBar z-10 |
| MainContent prend toute largeur < md | RESP-03 | Visual | DevTools 390px : `<div MainContent>` computed margin-left = 0 |
| MainContent margin reprend desktop | RESP-03 | Visual | DevTools 1024px : margin-left = 256px (ou 64 si collapsed) |
| Aucune régression Phase 1 | toutes | Visual | Sticky header reste OK sur 3 pages |

## Validation Sign-Off

- [ ] Breakpoint test runtime passé
- [ ] 4 viewports capturés sur 2 pages clés
- [ ] Drawer mobile testé interactivement
- [ ] Sticky header non régressé (Phase 1 ne casse pas)
- [ ] `pnpm build` complète sans erreur

**Approval:** pending (validation runtime à faire par Laurent en fin de phase)

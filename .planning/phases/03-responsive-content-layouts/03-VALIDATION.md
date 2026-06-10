---
phase: 3
slug: responsive-content-layouts
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-13
notes: |
  Validation principalement automatisée (grep audit + build) + visuel viewport.
  Aucun test E2E (Playwright deferred v2). Le grep "grid-cols sans responsive"
  sert d'invariant continue.
---

# Phase 3 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework auto** | Vitest (smoke) + grep + Next build |
| **Quick run** | `cd apps/web && npx vitest run` (Phase 1 smoke regression) |
| **Audit grids** | `grep -rE 'grid-cols-[2-9]+' apps/web/src/ \| grep -vE '(sm\|md\|lg\|xl):' \| wc -l` (cible : 0 ou justifié) |
| **Build verification** | `pnpm --filter @qualiof/web build` |
| **Manual viewport** | DevTools 390 / 768 / 1024 / 1440 |

## Sampling Rate

- **Après chaque task code :** grep audit local (sur le fichier modifié) + ne rien casser
- **Après chaque plan :** grep global + smoke test
- **Fin de phase :** build + 7 captures (4 dashboard + 3 listings mobiles)

## Per-Task Verification Map

| Task | Plan | Wave | REQ | Auto | Manual |
|------|------|------|-----|------|--------|
| 3-01-01 | 01 | 1 | RESP-04 | grep dashboard | viewport 1024/1280/1440 |
| 3-02-* | 02 | 1 | RESP-04 | grep par fichier | — |
| 3-03-* | 03 | 1 | RESP-04 | grep par fichier | — |
| 3-04-01 | 04 | 1 | RESP-05 | grep wrapper + grep p-4 md:p-8 | viewport 390 listings |
| 3-04-02 | 04 | 1 | RESP-05 | — | scroll H test |
| 3-05-* | 05 | 2 | tous | grep cocheboxes | — |

## Wave 0 Requirements

Aucune. Vitest + breakpoints en place depuis Phase 1+2.

## Manual-Only Verifications

| Behavior | REQ | Test |
|----------|-----|------|
| Dashboard reflow propre 4 viewports | RESP-04 | `/app` à 390 / 768 / 1024 / 1440 — pas de débordement, KPI lisibles |
| Listings scrollables mobile | RESP-05 | `/app/sessions` à 390px : tableau apparait, peut être scrollé H |
| Phase 1 + 2 non régressées | — | sticky OK, drawer mobile OK, redirects 308 OK |

## Validation Sign-Off

- [ ] Audit grep grids responsive : 0 occurrence non-conforme (ou exempted documenté)
- [ ] Build OK
- [ ] Smoke test 2/2 (régression Phase 1)
- [ ] 4 viewports dashboard captures attached
- [ ] 3 captures listings mobile attached

**Approval:** pending

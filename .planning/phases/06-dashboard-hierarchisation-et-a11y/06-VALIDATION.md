---
phase: 6
slug: dashboard-hierarchisation-et-a11y
status: approved
nyquist_compliant: true
created: 2026-05-13
---

# Phase 6 — Validation Strategy

| Property | Value |
|---|---|
| Auto | grep + Next build + Vitest smoke regression |
| Manual | DevTools desktop dashboard, lecture badges harmonisés |

## Per-Task Verification Map

| Task | REQ | Auto | Manual |
|---|---|---|---|
| funder-codes helper créé | UX-12 | `test -f`, grep `formatFunderCode` | — |
| funder-codes intégré dashboard + financeurs | UX-12 | grep usage | viewer dashboard |
| Dashboard PrioCard 4 KPI haut | UX-11 | grep `PrioCard` | viewer dashboard |
| CollapsibleSection détails | UX-11 | grep `CollapsibleSection` | clic toggle |
| a11y audit doc | UX-13 | rapport (notes) | — |
| Build + smoke | tous | `pnpm build`, `vitest run` | — |

**Approval:** pending

---
phase: 4
slug: topbar-ux
status: approved
nyquist_compliant: true
created: 2026-05-13
---

# Phase 4 — Validation Strategy

## Test Infrastructure
| Property | Value |
|---|---|
| Framework auto | Vitest (smoke régression Phase 1) + Next build + grep |
| Quick run | `cd apps/web && npx vitest run` |
| Build | `pnpm --filter @qualiof/web build` |
| Manual | DevTools : ouvrir cloche, ouvrir menu user, tenter déconnexion |

## Per-Task Verification Map
| Task | Plan | Wave | REQ | Auto | Manual |
|---|---|---|---|---|---|
| 4-01-01 | 01 | 1 | UX-01 | — | clic cloche, panel OK |
| 4-02-01 | 02 | 1 | UX-02 | grep `UserMenuButton`, file exists | — |
| 4-02-02 | 02 | 1 | UX-02 | grep top-bar.tsx absence form logout | clic avatar, menu+confirm |
| 4-03-01 | 03 | 2 | tous | grep cocheboxes | — |

## Manual-Only Verifications
| Behavior | Test |
|---|---|
| Panel notifications | Clic cloche → liste s'affiche ou état vide visible |
| Menu user | Clic avatar/nom → dropdown s'affiche avec Paramètres + Déconnexion |
| Confirmation logout | Clic Déconnexion → AlertDialog s'ouvre, Annuler ferme, Se déconnecter → redirect /login |

## Sign-Off
- [ ] `top-bar.tsx` ne contient plus `<form action={logoutAction}>` direct (grep)
- [ ] `user-menu-button.tsx` créé
- [ ] Build OK
- [ ] Smoke 2/2

**Approval:** pending

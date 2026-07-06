---
phase: 8
slug: multi-utilisateurs-et-rbac
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-15
---

# Phase 8 — Validation Strategy

| Property | Value |
|---|---|
| Framework | Vitest 2.1 (existing in `apps/web` + `packages/shared`) |
| Auto | `pnpm --filter @qualiof/web test --run`, `tsc --noEmit`, `pnpm --filter @qualiof/web build`, grep patterns |
| Manual | DevTools : flow invitation user → email → set MDP → login, désactivation user, sidebar filtrée par rôle, page Historique avec filtres |

## Per-Task Verification Map

| Task | REQ | Auto | Manual |
|---|---|---|---|
| Migration Prisma User + UserInvitation | RBAC-01..05 | `prisma migrate status`, grep model UserInvitation | — |
| `lib/rbac.ts` requireRole + UnauthorizedError/ForbiddenError | RBAC-04 | vitest `rbac.test.ts` (allowed/disabled/wrong-role) | — |
| `auth.ts` validateRequest rejette disabledAt | RBAC-01 | vitest mock disabled user → null | login désactivé |
| Zod schema `packages/shared/src/schemas/user.ts` | RBAC-01 | vitest schemas | — |
| Server action `inviteUser` (token + email) | RBAC-02 | vitest mock prisma + mailer, grep `users.invite` AuditLog | envoi mail test |
| Server action `disableUser` + invalidate sessions | RBAC-01 | vitest grep `invalidateUserSessions`, grep `users.disable` AuditLog | UI désactivation |
| Server action `resetUserPassword` (génère token + email) | RBAC-01 | vitest, grep `users.password.reset_requested` | envoi mail test |
| Server action `acceptUserInvitation` (single-use) | RBAC-02 | vitest token expiry + usedAt | UI page publique |
| Email templates user-invitation/password-reset | RBAC-02 | grep templates + dry-run mailer | UI mail réel |
| Route publique `/invitation/[token]` | RBAC-02 | smoke test page render | clic email |
| `lib/nav-config.ts` allowedRoles + filter Server Comp | RBAC-03 | vitest pure fn filter | sidebar visu par rôle |
| Page `/app/parametres/utilisateurs` CRUD | RBAC-01 | smoke test page render | UI complète |
| Page `/app/parametres/historique` AuditLog UI | RBAC-05 | smoke test + pagination | filtres UI |
| Apply requireRole sur server actions sensibles (tenant-settings, tenant-assets, etc.) | RBAC-04 | grep `requireRole(` count ≥ N | — |
| Login hooks (lastLoginAt + AuditLog login.success/failed) | RBAC-05 | vitest mock action, grep AuditLog actions | login + bad pwd |
| Build + smoke vitest final | tous | `pnpm build`, `pnpm test --run` | — |

**Approval:** approved

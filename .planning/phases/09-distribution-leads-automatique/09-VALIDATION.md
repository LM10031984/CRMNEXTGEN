---
phase: 9
slug: distribution-leads-automatique
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-16
---

# Phase 9 — Validation Strategy

| Property | Value |
|---|---|
| Framework | Vitest 2.1 |
| Auto | `pnpm --filter @qualiof/web test --run`, `tsc --noEmit`, `pnpm --filter @qualiof/web build`, grep |
| Manual | DevTools : créer lead → assignation auto, voir notification cloche + email dry-run, page charge avec KPI, page config toggles |

## Per-Task Verification Map

| Task | REQ | Auto | Manual |
|---|---|---|---|
| Migration Prisma : `Notification` model + `Lead.wonAt` + `Tenant.autoAssignLeads/notify*` | LEAD-01/02 | `prisma migrate status`, grep model | — |
| Server action `createLead(input)` + trigger `autoAssignLead` | LEAD-01 | vitest mock prisma, grep `autoAssignLead(` in leads.ts | — |
| Set `wonAt` on status WON transition | LEAD-02 | vitest changement status | UI changement status |
| Notification creation on assign + helper `createLeadAssignedNotification` | LEAD-01 | vitest notif row created | cloche affiche |
| Email send via mailer (dry-run safe) + template `lead-assigned-template.ts` | LEAD-01 | vitest mock mailer, grep `lead-assigned` template | mail réel |
| AuditLog conventions `leads.auto_assigned/reassigned/distribution_config` | LEAD-01 | grep action strings | — |
| Bouton "Réassigner" sur fiche lead | LEAD-01 | smoke test composant | UI |
| Page `/app/leads/charge` ADMIN+MANAGER + 4 KPI + camembert SVG | LEAD-02 | smoke + grep PrioCard/SVG | viewer |
| Page `/app/parametres/distribution-leads` ADMIN + 3 toggles | LEAD-01 | smoke + server action `updateLeadDistributionConfig` | UI |
| Extension cloche TopBar pour type `lead.assigned` | LEAD-01 | smoke render | clic cloche |
| Sidebar : "Vue de charge" sous-item ADMIN+MANAGER | LEAD-02 | grep nav-config | viewer rôle |
| Build + smoke vitest | tous | `pnpm build`, `pnpm test --run` | — |

**Approval:** approved

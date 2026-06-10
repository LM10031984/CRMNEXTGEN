---
phase: 7
slug: param-tres-organisme-ditables
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-14
---

# Phase 7 — Validation Strategy

| Property | Value |
|---|---|
| Framework | Vitest 2.1 (existing in `apps/web` + `packages/shared`) |
| Auto | `pnpm --filter @qualiof/web test`, `tsc --noEmit`, `pnpm --filter @qualiof/web build`, grep specific patterns |
| Manual | DevTools : édition Paramètres + sauvegarde, upload logo + re-render PDF, simulate audit log entry |

## Per-Task Verification Map

| Task | REQ | Auto | Manual |
|---|---|---|---|
| Tenant migration appliquée | SET-01..03 | `prisma migrate status`, grep nouveau champ | — |
| of-config.ts refactor async + fallback ENV | SET-01..03 | grep `getOfConfig.*Promise`, tsc OK | génération PDF |
| Zod schemas tenant (siret/iban/bic/email) | SET-01..03 | vitest schema tests | — |
| Server action updateIdentity + Audit | SET-01 | vitest mock prisma, grep `auditLog.create` | save form |
| Upload logo Server Action | SET-02 | grep `uploadTenantLogo`, fichier écrit en disque | upload + preview |
| Upload signatures 2 emplacements | SET-02 | grep `uploadTenantSignature.*pedago\|dirigeant` | upload + preview |
| loadAssetDataUrl(filenames, tenantId?) | SET-02 | grep nouveau param tenantId, cache invalidation | re-générer PDF post-upload |
| Cascade programme/convention templates | SET-02 | grep usage tenantId | génération programme |
| numbering.ts extracted + invoicePrefix lu | SET-03 | grep `getNextInvoiceNumber`, test config prefix | — |
| Editable RIB IBAN/BIC | SET-03 | save + reload, valeurs visibles | — |
| Email expéditeur stocké + utilisé mailer | SET-03 | grep `Tenant.emailFrom` dans mailer.ts | envoi mail test |
| UI Paramètres 6 sections édition inline | SET-01..03 | grep `<EditableSection`, viewport | clic Modifier + Save |
| Build + smoke vitest | tous | `pnpm build`, `pnpm test --run` | — |

**Approval:** approved

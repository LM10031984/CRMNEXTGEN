/**
 * Helper AuditLog Phase 11 — entity='Invoice', actions namespacées `invoices.*` (D-18).
 *
 * 5ème instance "one helper per entity" (pattern D-Phase9.1-02) :
 *   - Phase 7   : logTenantSettingsChange (entity='Tenant',    actions parameters.*)
 *   - Phase 8   : logUserAction           (entity='User',      actions users.*)
 *   - Phase 9   : logLeadEvent            (entity='Lead',      actions leads.*)
 *   - Phase 9.1 : logDocumentEvent        (entity='Document',  actions documents.*)
 *   - Phase 11  : logInvoiceEvent         (entity='Invoice',   actions invoices.*)
 *
 * NE PAS éditer `audit-log.ts` global (D-Phase9.1-02 — frontière phase, rollback
 * indépendant possible).
 *
 * Actions namespacées Phase 11 (D-18) :
 *   - 'invoices.created'              — createInvoiceFromParticipant / createInvoiceForSponsorGroup
 *   - 'invoices.issued'               — DRAFT → ISSUED (création passe direct ISSUED)
 *   - 'invoices.payment_recorded'     — recordInvoicePayment
 *   - 'invoices.credit_note_created'  — createCreditNote (Plan 11-05)
 *   - 'invoices.reminder_sent'        — sendInvoiceReminder (cron OR manual — Plan 11-06)
 *   - 'invoices.exported'             — route /api/factures/export (Plan 11-07)
 *
 * Conventions :
 *  - `actorUserId: null` = action système (worker daily cron BullMQ — D-13c).
 *  - `targetInvoiceId: 'BULK'` = convention pour `invoices.exported` (un export couvre N factures).
 *  - **Pas de no-op sur diff vide** (cohérent D-Phase9-H) — certains events comme
 *    `invoices.exported` n'ont qu'un payload (period/count).
 */

import { prisma } from '@qualiof/db';

export type Diff = Record<string, { before: unknown; after: unknown } | unknown>;

export async function logInvoiceEvent(opts: {
  tenantId: string;
  actorUserId: string | null;
  targetInvoiceId: string;
  action: string;
  diff?: Diff | Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      entity: 'Invoice',
      entityId: opts.targetInvoiceId,
      action: opts.action,
      diff: (opts.diff ?? {}) as never,
    },
  });
}

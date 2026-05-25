/**
 * Helper AuditLog Phase 13 — entity='RegulatoryWatch', actions namespacées
 * `regulatoryWatch.*` (D-Phase 13 — 1ère instanciation de la convention).
 *
 * 7e instance "one helper per entity" (pattern D-Phase9.1-02) :
 *   - Phase 7   : logTenantSettingsChange (entity='Tenant',          actions parameters.*)
 *   - Phase 8   : logUserAction           (entity='User',            actions users.*)
 *   - Phase 9   : logLeadEvent            (entity='Lead',            actions leads.*)
 *   - Phase 9.1 : logDocumentEvent        (entity='Document',        actions documents.*)
 *   - Phase 11  : logInvoiceEvent         (entity='Invoice',         actions invoices.*)
 *   - Phase 13  : logRegulatoryWatchEvent (entity='RegulatoryWatch', actions regulatoryWatch.*)
 *
 * NE PAS éditer `audit-log.ts` global (D-Phase9.1-02 — frontière phase, rollback
 * indépendant possible).
 *
 * Actions namespacées Phase 13 (8 verbes — D-Phase 13 §AuditLog convention) :
 *   - 'regulatoryWatch.created'                — création manuelle UI OU import xlsx (batch=true)
 *   - 'regulatoryWatch.updated'                — édition champs hors exploitation
 *   - 'regulatoryWatch.exploitation_updated'   — inline edit exploitation (déclenche dateLastReviewed=now())
 *   - 'regulatoryWatch.approved'               — passage DRAFT (suggestedBy=AUTO) → ACTIVE
 *   - 'regulatoryWatch.rejected'               — rejet inbox → ARCHIVED + rejectionReason dans diff
 *   - 'regulatoryWatch.archived'               — archivage manuel
 *   - 'regulatoryWatch.auto_inserted'          — insertion worker (actorUserId=null)
 *   - 'regulatoryWatch.exported'               — export PDF audit (targetWatchId='BULK', diff inclut theme+count+documentId)
 *
 * Conventions :
 *  - `actorUserId: null` = action système (worker BullMQ Plan 05, script CLI Plan 01).
 *  - `targetWatchId: 'BULK'` = convention pour `regulatoryWatch.exported` (un export couvre N entrées).
 *  - **Pas de no-op sur diff vide** (cohérent D-Phase9-H) — certains events comme
 *    `regulatoryWatch.exported` n'ont qu'un payload (theme/count/documentId).
 *
 * Reuse safety (mémoire `feedback_worker_no_react_imports.md`) :
 *  - Ce helper N'IMPORTE PAS `requireRole` ni `validateRequest`.
 *  - Importable depuis n'importe quel script tsx (worker BullMQ Plan 05, script
 *    one-shot import Plan 01) sans crash `react does not provide an export named 'cache'`.
 */

import { prisma } from '@qualiof/db';

export type Diff = Record<string, { before: unknown; after: unknown } | unknown>;

export async function logRegulatoryWatchEvent(opts: {
  tenantId: string;
  actorUserId: string | null;
  targetWatchId: string;
  action: string;
  diff?: Diff | Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      entity: 'RegulatoryWatch',
      entityId: opts.targetWatchId,
      action: opts.action,
      diff: (opts.diff ?? {}) as never,
    },
  });
}

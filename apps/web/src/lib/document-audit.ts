/**
 * Helper AuditLog Phase 9.1 — entity='Document', actions namespacées `documents.*`.
 *
 * Conventions (RESEARCH Decision B + Open Question 5 résolue) :
 *  - 'documents.regenerate'       → re-gen ciblée (ou batch via closure-pack)
 *  - 'documents.upload_signed'    → upload PDF signé scanné
 *  - 'documents.status_change'    → mark MANUAL_OK / markedOkWithoutUpload
 *  - 'documents.delete'           → suppression Document / asset
 *
 * `targetEntityId` = participantId (le participant porte le statut, le doc
 * est l'objet de l'action). entity='Document' (générique, pas 'SessionParticipant'
 * pour rester sémantique côté UI AuditLog Phase 8).
 *
 * Pattern clone-strict `logLeadEvent` (Phase 9 D-Phase9-H) — pas de no-op sur
 * diff vide, actorUserId nullable pour cas system (worker BullMQ async).
 *
 * Module isolé (NE PAS éditer `audit-log.ts`) pour conserver la frontière
 * Phase 9 / Phase 9.1 — rollback indépendant possible.
 */

import { prisma } from '@qualiof/db';

export type Diff = Record<string, { before: unknown; after: unknown } | unknown>;

export async function logDocumentEvent(opts: {
  tenantId: string;
  actorUserId: string | null;
  targetEntityId: string;
  action: string;
  diff?: Diff | Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      entity: 'Document',
      entityId: opts.targetEntityId,
      action: opts.action,
      diff: (opts.diff ?? {}) as never,
    },
  });
}

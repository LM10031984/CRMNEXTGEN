/**
 * Helpers AuditLog (Phase 7 — D-09 convention).
 *
 * Extrait de `server/actions/tenant-settings.ts` pour respecter la contrainte
 * Next.js : un fichier marqué `'use server'` ne peut exporter que des async
 * functions. `computeDiff` est sync (pur) → doit vivre dans une lib séparée.
 *
 * Convention `action` :
 *  - 'parameters.update' : identité, adresse, RIB, email
 *  - 'parameters.upload.logo' : Plan 07-03
 *  - 'parameters.upload.signature.pedago' / 'signature.dirigeant' : Plan 07-03
 *  - 'parameters.reset.logo' / 'reset.signature.*' : Plan 07-03
 */

import { prisma } from '@qualiof/db';

export type Diff = Record<string, { before: unknown; after: unknown }>;

/**
 * Helper pur — calcule la diff entre deux snapshots de champs Tenant.
 *
 * - `null` et `undefined` sont normalisés à chaîne vide
 * - Les objets (typiquement `address` Json) sont comparés via JSON.stringify
 * - Les primitives sont comparées via String()
 *
 * Retourne uniquement les clés qui diffèrent → no-op AuditLog si {}.
 */
export function computeDiff<T extends Record<string, unknown>>(before: T, after: T): Diff {
  const diff: Diff = {};
  for (const key of Object.keys(after)) {
    const b = before[key];
    const a = after[key];
    const bStr =
      b === null || b === undefined
        ? ''
        : typeof b === 'object'
          ? JSON.stringify(b)
          : String(b);
    const aStr =
      a === null || a === undefined
        ? ''
        : typeof a === 'object'
          ? JSON.stringify(a)
          : String(a);
    if (bStr !== aStr) {
      diff[key] = { before: b ?? null, after: a ?? null };
    }
  }
  return diff;
}

/**
 * Écrit une row AuditLog si la diff n'est pas vide.
 * No-op si aucun champ n'a changé.
 */
export async function logTenantSettingsChange(opts: {
  tenantId: string;
  userId: string;
  action: string;
  diff: Diff;
}): Promise<void> {
  if (Object.keys(opts.diff).length === 0) return;
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      entity: 'Tenant',
      entityId: opts.tenantId,
      action: opts.action,
      diff: opts.diff as never,
    },
  });
}

/**
 * Helper AuditLog pour les actions sur entité 'User' (Phase 8 D-10).
 *
 * Convention `action` :
 *  - 'users.invite' / 'users.invitation.resend'
 *  - 'users.disable' / 'users.enable'
 *  - 'users.role.change'
 *  - 'users.password.reset_requested' (déclenché par un admin)
 *  - 'users.password.set' (par l'user lui-même via /invitation/[token])
 *  - 'auth.login.success' / 'auth.login.failed' (entity='User' aussi, entityId=user.id ou null)
 *
 * Distinction par rapport à `logTenantSettingsChange` :
 *  - `targetUserId` = l'utilisateur concerné par l'action (ligne AuditLog.entityId)
 *  - `actorUserId`  = l'admin qui déclenche (peut être null pour login.failed sans user résolu)
 *  - **Pas de no-op sur diff vide** : certaines actions n'ont pas de diff (disable, login.success).
 */
export async function logUserAction(opts: {
  tenantId: string;
  actorUserId: string | null;
  targetUserId: string;
  action: string;
  diff?: Diff | Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      entity: 'User',
      entityId: opts.targetUserId,
      action: opts.action,
      diff: (opts.diff ?? {}) as never,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });
}

/**
 * Helper AuditLog pour entité 'Lead' (Phase 9 — D-07 convention CONTEXT.md).
 *
 * Convention `action` :
 *  - 'leads.auto_assigned'       → actorUserId=null (system, à la création du Lead)
 *  - 'leads.reassigned'          → actorUserId=user.id (clic manuel "Réassigner")
 *  - 'leads.distribution_config' → actorUserId=admin.id (modif des 3 toggles)
 *  - 'leads.status.change'       → actorUserId=user.id (transition status, set wonAt)
 *
 * Distinction par rapport à `logUserAction` :
 *  - `targetLeadId` = Lead concerné (AuditLog.entityId, AuditLog.entity='Lead').
 *  - `actorUserId`  = qui déclenche (null = system, ex. auto-assignation).
 *  - Pas de no-op sur diff vide : certains événements n'ont qu'un payload
 *    (ex. `leads.auto_assigned` après création).
 */
export async function logLeadEvent(opts: {
  tenantId: string;
  actorUserId: string | null;
  targetLeadId: string;
  action: string;
  diff?: Diff | Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      entity: 'Lead',
      entityId: opts.targetLeadId,
      action: opts.action,
      diff: (opts.diff ?? {}) as never,
    },
  });
}

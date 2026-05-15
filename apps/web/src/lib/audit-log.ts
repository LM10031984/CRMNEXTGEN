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

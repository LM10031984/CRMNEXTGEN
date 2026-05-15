/**
 * Helper pur pour construire la clause `where` Prisma de la page Historique
 * AuditLog (Phase 8 Plan 08-05 — D-09 CONTEXT.md, RBAC-05).
 *
 * Pourquoi un helper isolé ?
 *  - Testable sans I/O (pure function) → ≥ 5 cas Vitest, pas de mock Prisma.
 *  - Centralise la convention `action: { startsWith: prefix }` pour qu'un filtre
 *    `'users.'` matche `'users.invite'`, `'users.disable'`, etc.
 *  - Sécurité multi-tenant : `tenantId` est TOUJOURS injecté (jamais facultatif),
 *    impossible d'oublier le scope côté caller.
 *
 * Convention d'usage côté page :
 *
 *   const admin = await requireRole(['ADMIN']);
 *   const where = buildAuditWhere(searchParams, admin.tenantId);
 *   const rows = await prisma.auditLog.findMany({ where, ... });
 *
 * Robustesse :
 *  - Dates invalides (`new Date('foo')` → NaN) sont silencieusement ignorées
 *    pour ne pas crasher la page si l'utilisateur saisit n'importe quoi en URL.
 *  - `from` et `to` sont indépendants : on peut filtrer seulement par borne haute
 *    ou seulement par borne basse.
 */

import type { Prisma } from '@prisma/client';

export interface AuditFilters {
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
}

function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function buildAuditWhere(
  filters: AuditFilters,
  tenantId: string,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { tenantId };
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = { startsWith: filters.action };
  const from = parseDate(filters.from);
  const to = parseDate(filters.to);
  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    where.createdAt = createdAt;
  }
  return where;
}

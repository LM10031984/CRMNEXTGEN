'use server';

/**
 * Server action Pilotage Direction — objectif de CA annuel (quick 260620-d42 Plan 02).
 *
 * `setRevenueTarget` permet à un ADMIN ou MANAGER de saisir/mettre à jour
 * l'objectif de CA (EUR HT, entier) d'une année donnée pour son tenant.
 *
 * Réutilise le pattern Phase 7/11 (`invoice-settings.ts`, `tenant-settings.ts`) :
 *  - `requireRole(['ADMIN','MANAGER'])` — pilotage réservé à la direction (D-08).
 *  - `logTenantSettingsChange` (entity='Tenant') avec action LIBRE
 *    `'revenueTarget.update'` (nouvelle convention, cohérente avec
 *    `'parameters.update'`). `computeDiff` → no-op AuditLog si rien ne change.
 *  - `revalidatePath('/app/pilotage')` pour rafraîchir le Server Component.
 *
 * Sécurité multi-tenant : la clé composite `tenantId_year` porte `user.tenantId`
 * → un user ne peut écrire QUE l'objectif de son propre tenant. Le `where` de
 * l'upsert et du findUnique scope PARTOUT par tenantId.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { computeDiff, logTenantSettingsChange } from '@/lib/audit-log';

export type SetRevenueTargetResult = { ok: true } | { ok: false; error: string };

export async function setRevenueTarget(
  year: number,
  amountHT: number,
): Promise<SetRevenueTargetResult> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);

    // Validation inline (un schéma dédié n'apporte rien ici — 2 entiers bornés).
    const validYear = Number.isInteger(year) && year >= 2020 && year <= 2100;
    const validAmount = Number.isInteger(amountHT) && amountHT >= 0;
    if (!validYear || !validAmount) {
      return { ok: false, error: 'Valeurs invalides' };
    }

    const before = await prisma.revenueTarget.findUnique({
      where: { tenantId_year: { tenantId: user.tenantId, year } },
      select: { amountHT: true },
    });

    await prisma.revenueTarget.upsert({
      where: { tenantId_year: { tenantId: user.tenantId, year } },
      create: { tenantId: user.tenantId, year, amountHT },
      update: { amountHT },
    });

    await logTenantSettingsChange({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'revenueTarget.update',
      diff: computeDiff(
        { amountHT: before?.amountHT ?? null },
        { amountHT },
      ),
    });

    revalidatePath('/app/pilotage');
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

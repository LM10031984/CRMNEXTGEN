'use server';

/**
 * Server action `updateLeadDistributionConfig` (Phase 9 Plan 09-02 Task 3, LEAD-01 / D-06).
 *
 * Modifie les 3 toggles `Tenant` qui gerent la distribution automatique des leads :
 *  - `autoAssignLeads`          — declenche `autoAssignLead` a la creation (`createLead`)
 *  - `notifyOnLeadAssignEmail`  — envoi d'email au commercial assigne
 *  - `notifyOnLeadAssignBell`   — creation Notification cloche
 *
 * Reserve ADMIN-only (cf. matrice PERMISSIONS Phase 8). AuditLog `leads.distribution_config`
 * ecrit MEME si diff vide — utile pour traçer les "verifications" admin (consultation
 * sans modification). Distinct de `logTenantSettingsChange` qui no-op sur diff vide.
 *
 * Convention `entity='Tenant'` (Phase 7), `action='leads.distribution_config'` (Phase 9).
 * Consommable directement par la page Historique (Plan 08-05) sans hardcode enum côté UI.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { DistributionConfigSchema } from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { computeDiff } from '@/lib/audit-log';

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export async function updateLeadDistributionConfig(input: unknown): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireRole(['ADMIN']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = DistributionConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const before = await prisma.tenant.findUnique({
    where: { id: admin.tenantId },
    select: {
      autoAssignLeads: true,
      notifyOnLeadAssignEmail: true,
      notifyOnLeadAssignBell: true,
    },
  });
  if (!before) return { ok: false, error: 'Tenant introuvable' };

  const after = parsed.data;
  const diff = computeDiff(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
  );

  await prisma.tenant.update({
    where: { id: admin.tenantId },
    data: {
      autoAssignLeads: after.autoAssignLeads,
      notifyOnLeadAssignEmail: after.notifyOnLeadAssignEmail,
      notifyOnLeadAssignBell: after.notifyOnLeadAssignBell,
    },
  });

  // Pas de no-op : on logge même si diff vide (utile pour traçer une visite admin
  // sur l'ecran de config sans modification — equivalent d'un acces audit-trail).
  // Si on voulait no-op, on utiliserait `logTenantSettingsChange` qui filtre les diff vides.
  await prisma.auditLog.create({
    data: {
      tenantId: admin.tenantId,
      userId: admin.id,
      entity: 'Tenant',
      entityId: admin.tenantId,
      action: 'leads.distribution_config',
      diff: diff as never,
    },
  });

  revalidatePath('/app/parametres/distribution-leads');
  revalidatePath('/app/leads');
  revalidatePath('/app/leads/charge');
  return { ok: true };
}

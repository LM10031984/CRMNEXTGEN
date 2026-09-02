'use server';

/**
 * Server action Paramètres « Envois d'emails » (Phase 22 Plan 22-11, D-06).
 *
 * `updateEmailSettings` permet à l'ADMIN d'éditer les réglages d'envoi
 * `TenantEmailSettings` (couche MÉTIER du garde-fou du mailer) :
 *  - `emailsEnabled` — interrupteur général (défaut FALSE, fail-closed)
 *  - 6 toggles par catégorie (relances factures, rappels pré-inscription,
 *    relances OPCO, envoi dossiers OPCO, notifs internes, invitations)
 *  - `testSessionIds` — sessions autorisées en mode test (master OFF)
 *
 * Clone strict du pattern `invoice-settings.ts` (Phase 11) :
 *  - `requireRole(['ADMIN'])` — Paramètres OF ADMIN-only.
 *  - Zod safeParse → `{ ok:false, error, fieldErrors }`.
 *  - **upsert** scopé `where: { tenantId: user.tenantId }` — jamais d'id fourni
 *    par le client, un user ne peut éditer que son propre tenant.
 *  - `logTenantSettingsChange` (action='parameters.update') + `computeDiff`.
 *  - `revalidatePath('/app/parametres')`.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { computeDiff, logTenantSettingsChange } from '@/lib/audit-log';
import { EmailSettingsSchema, type EmailSettingsInput } from '@qualiof/shared';

export type EmailSettingsActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export async function updateEmailSettings(
  input: EmailSettingsInput,
): Promise<EmailSettingsActionResult> {
  try {
    const user = await requireRole(['ADMIN']);

    const parsed = EmailSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Validation échouée',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const data = parsed.data;

    const before = await prisma.tenantEmailSettings.findUnique({
      where: { tenantId: user.tenantId },
      select: {
        emailsEnabled: true,
        invoiceRemindersEnabled: true,
        preinscriptionRemindersEnabled: true,
        opcoRemindersEnabled: true,
        opcoSubmissionsEnabled: true,
        internalNotificationsEnabled: true,
        userInvitationsEnabled: true,
        diagnosticProgramsEnabled: true,
        testSessionIds: true,
      },
    });

    const after = await prisma.tenantEmailSettings.upsert({
      where: { tenantId: user.tenantId },
      create: { tenantId: user.tenantId, ...data },
      update: { ...data },
      select: {
        emailsEnabled: true,
        invoiceRemindersEnabled: true,
        preinscriptionRemindersEnabled: true,
        opcoRemindersEnabled: true,
        opcoSubmissionsEnabled: true,
        internalNotificationsEnabled: true,
        userInvitationsEnabled: true,
        diagnosticProgramsEnabled: true,
        testSessionIds: true,
      },
    });

    await logTenantSettingsChange({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'parameters.update',
      diff: computeDiff(
        (before ?? {}) as Record<string, unknown>,
        after as Record<string, unknown>,
      ),
    });

    revalidatePath('/app/parametres');
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

'use server';

/**
 * Server action Paramètres Facturation (Phase 11 Plan 11-04 Task 2).
 *
 * `updateInvoiceReminderSettings` permet à l'ADMIN d'éditer 2 champs Tenant :
 *  - `creditNotePrefix` (D-02 CONTEXT.md) — préfixe séquence avoirs (CGI 289).
 *    Optional dans le schéma : permet de modifier uniquement les délais sans
 *    risquer d'écraser le préfixe à null.
 *  - `invoiceReminderDays` (D-10 CONTEXT.md) — array 1-3 entiers strictement
 *    croissants éditable depuis Paramètres → consommé par worker Plan 11-06.
 *
 * Réutilise le pattern Phase 7 (`tenant-settings.ts`) :
 *  - `requireRole(['ADMIN'])` (D-08) — Paramètres OF ADMIN-only.
 *  - `logTenantSettingsChange` (entity='Tenant' / action='parameters.update') —
 *    convention Phase 7 D-09 préservée. PAS `logInvoiceEvent` (Plan 11-02) car
 *    on édite la config tenant, pas une facture en particulier.
 *  - `computeDiff` per-champ → no-op AuditLog si aucun changement.
 *  - `revalidatePath('/app/parametres')` pour rafraîchir le Server Component.
 *
 * Sécurité : `where: { id: user.tenantId }` — un user ne peut éditer que les
 * paramètres de son propre tenant.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { computeDiff, logTenantSettingsChange } from '@/lib/audit-log';
import {
  InvoiceReminderSettingsSchema,
  type InvoiceReminderSettingsInput,
} from '@qualiof/shared';

export type InvoiceSettingsActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export async function updateInvoiceReminderSettings(
  input: InvoiceReminderSettingsInput,
): Promise<InvoiceSettingsActionResult> {
  try {
    const user = await requireRole(['ADMIN']);

    const parsed = InvoiceReminderSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Validation échouée',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const before = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { invoiceReminderDays: true, creditNotePrefix: true },
    });
    if (!before) return { ok: false, error: 'Tenant introuvable' };

    // Préserve le préfixe si non fourni (le schéma le rend optional) — évite
    // d'écraser à null la valeur courante lorsqu'on édite uniquement les délais.
    const after = await prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        invoiceReminderDays: parsed.data.invoiceReminderDays,
        ...(parsed.data.creditNotePrefix !== undefined
          ? { creditNotePrefix: parsed.data.creditNotePrefix }
          : {}),
      },
      select: { invoiceReminderDays: true, creditNotePrefix: true },
    });

    await logTenantSettingsChange({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'parameters.update',
      diff: computeDiff(before as Record<string, unknown>, after as Record<string, unknown>),
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

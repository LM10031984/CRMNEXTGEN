'use server';

/**
 * Server actions Leads (Phase 9 Plan 09-02 — LEAD-01 / LEAD-02).
 *
 * 3 actions discriminees `{ ok, ... }` :
 *  1. `createLead`        — RBAC ADMIN/MANAGER/COMMERCIAL + validation Zod + create
 *                            + auto-assign conditionnel (toggle Tenant.autoAssignLeads)
 *                            + notifyLeadAssigned(assignedBy=null) si auto-assigne.
 *  2. `reassignLead`      — Bouton manuel "Reassigner" : autoAssignLead(force:true)
 *                            + notifyLeadAssigned(assignedBy=user.id).
 *                            Pitfall 4 : IGNORE volontairement le toggle autoAssignLeads.
 *  3. `updateLeadStatus`  — Transition LeadStatus + gestion automatique de `wonAt` :
 *                            null → WON  => wonAt = now()
 *                            WON  → null => wonAt = null
 *                            sinon       => wonAt inchange (Pitfall 3 KPI 2/3/4).
 *
 * Conventions partagees (coherentes Phase 7/8) :
 *  - Toutes les queries scopees par `user.tenantId` (multi-tenant safety).
 *  - AuditLog `logLeadEvent` pour la transition status (action='leads.status.change').
 *  - notifyLeadAssigned centralise les side-effects (Notification + Email + AuditLog
 *    `leads.auto_assigned`/`leads.reassigned`), 1 seul appel par site métier.
 *  - revalidatePath sur '/app/leads' (+ '/app/leads/[id]' et '/app/leads/charge' si pertinent).
 *
 * Pitfall 1 (race condition createLead + autoAssign) : volume estime 1-5 leads/jour
 *  → pas de fix prioritaire. Documente ici pour traçabilite.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import type { LeadStatus } from '@qualiof/db';
import { CreateLeadSchema } from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { autoAssignLead } from './auto-assign-leads';
import { notifyLeadAssigned } from '@/lib/lead-notifications';
import { logLeadEvent } from '@/lib/audit-log';

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

// ─── 1. createLead ──────────────────────────────────────────────────────
/**
 * LEAD-01 — Creation d'un Lead avec auto-assignation conditionnelle.
 *
 * Flow :
 *  1. RBAC ADMIN/MANAGER/COMMERCIAL.
 *  2. Validation Zod (`CreateLeadSchema` — refine personId XOR firstName+lastName).
 *  3. Lecture toggle `tenant.autoAssignLeads`.
 *  4. `prisma.lead.create` (ownerUserId=null).
 *  5. Si toggle ON → `autoAssignLead(lead.id)` puis `notifyLeadAssigned(assignedBy=null)`.
 */
export async function createLead(
  input: unknown,
): Promise<ActionResult<{ leadId: string; ownerUserId: string | null }>> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = CreateLeadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { autoAssignLeads: true },
  });

  const lead = await prisma.lead.create({
    data: {
      tenantId: user.tenantId,
      ...parsed.data,
    },
    select: { id: true, ownerUserId: true },
  });

  let ownerUserId: string | null = lead.ownerUserId;

  // Toggle defaut true (Tenant.autoAssignLeads @default(true)) → un tenant qui
  // n'a jamais touche ses paramètres aura l'auto-assignation activee.
  if (tenant?.autoAssignLeads !== false) {
    const r = await autoAssignLead(lead.id);
    if (r.ok && r.ownerUserId) {
      ownerUserId = r.ownerUserId;
      await notifyLeadAssigned({
        tenantId: user.tenantId,
        leadId: lead.id,
        ownerUserId: r.ownerUserId,
        assignedBy: null, // system
      });
    }
  }

  revalidatePath('/app/leads');
  return { ok: true, data: { leadId: lead.id, ownerUserId } };
}

// ─── 2. reassignLead ────────────────────────────────────────────────────
/**
 * LEAD-01 — Reassignation manuelle (bouton "Reassigner" sur fiche Lead).
 *
 * Pitfall 4 : `force: true` IGNORE volontairement le toggle Tenant.autoAssignLeads.
 *  - L'admin/manager qui clique sait ce qu'il fait — sinon le bouton serait inutile.
 *  - Le toggle régit uniquement le déclenchement automatique à la création.
 */
export async function reassignLead(
  leadId: string,
): Promise<ActionResult<{ ownerUserId: string; ownerName: string }>> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const r = await autoAssignLead(leadId, { force: true });
  if (!r.ok) {
    return {
      ok: false,
      error: r.error ?? r.skippedReason ?? 'Echec reassignation',
    };
  }

  if (r.ownerUserId) {
    await notifyLeadAssigned({
      tenantId: user.tenantId,
      leadId,
      ownerUserId: r.ownerUserId,
      assignedBy: user.id, // manuel
    });
  }

  revalidatePath('/app/leads');
  revalidatePath(`/app/leads/${leadId}`);
  return {
    ok: true,
    data: {
      ownerUserId: r.ownerUserId ?? '',
      ownerName: r.ownerName ?? '',
    },
  };
}

// ─── 3. updateLeadStatus ────────────────────────────────────────────────
/**
 * LEAD-02 — Transition de statut, set `wonAt` automatiquement (Pitfall 3).
 *
 * Logique `wonAt` :
 *  - Passage vers WON (status precedent != WON) → wonAt = now()
 *  - Passage hors WON (status precedent == WON) → wonAt = null
 *  - Tout autre transition → wonAt inchange
 *
 * Sans ce fix, les KPI 2 (leadsWonThisMonth), 3 (conversionPct sur 60j),
 * 4 (avgDaysToWin) retournent toujours 0/null car Lead.wonAt reste NULL.
 *
 * AuditLog : action='leads.status.change' avec diff before/after sur status + wonAt.
 */
export async function updateLeadStatus(
  leadId: string,
  newStatus: LeadStatus,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const existing = await prisma.lead.findFirst({
    where: { id: leadId, tenantId: user.tenantId },
    select: { id: true, status: true, wonAt: true },
  });
  if (!existing) return { ok: false, error: 'Lead introuvable' };

  const wasWon = existing.status === 'WON';
  const becomesWon = newStatus === 'WON';

  const wonAt =
    becomesWon && !wasWon
      ? new Date()
      : !becomesWon && wasWon
        ? null
        : existing.wonAt;

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: newStatus, wonAt },
  });

  await logLeadEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetLeadId: leadId,
    action: 'leads.status.change',
    diff: {
      status: { before: existing.status, after: newStatus },
      wonAt: { before: existing.wonAt, after: wonAt },
    },
  });

  revalidatePath('/app/leads');
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath('/app/leads/charge');
  return { ok: true };
}

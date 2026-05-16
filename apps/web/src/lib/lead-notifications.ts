/**
 * LEAD-01 — Side-effects post-assignation (Notification + Email + AuditLog).
 *
 * Helper centralisé (Phase 9 Plan 09-02) qui orchestre les 3 side-effects
 * qui suivent l'assignation d'un Lead à un commercial :
 *  1. **Notification cloche** — `prisma.notification.create({ type: 'lead.assigned' })`
 *     si `tenant.notifyOnLeadAssignBell` est ON.
 *  2. **Email** — `sendMail` (dry-run silencieux si SMTP non configuré) si
 *     `tenant.notifyOnLeadAssignEmail` est ON ET `owner.email` est renseigné.
 *  3. **AuditLog** — toujours écrit, action `leads.auto_assigned` (assignedBy=null,
 *     déclenché par `createLead`) ou `leads.reassigned` (assignedBy=user.id,
 *     déclenché par `reassignLead`).
 *
 * Pourquoi un helper centralisé (vs inline dans server actions) :
 *  - Testable en isolation avec mocks Prisma + mailer.
 *  - Garde `createLead` / `reassignLead` lisibles.
 *  - Respect des 3 toggles Tenant (D-06) à un seul endroit.
 *
 * Décision Pitfall 5 (option b) : le `dryRun` flag de `sendMail` est ignoré
 * dans l'AuditLog — la trace `leads.auto_assigned` n'atteste pas l'envoi
 * physique de l'email, juste la décision d'envoi.
 *
 * Décision Pitfall 6 : la table `Notification.payload` est shape-less côté
 * Prisma (Json). Le payload écrit ici DOIT matcher `LeadAssignedPayloadSchema`
 * (`packages/shared/src/schemas/lead.ts`) — source unique writer/reader.
 */

import { prisma } from '@qualiof/db';
import { sendMail } from './mailer';
import { renderLeadAssignedEmail } from './mailer-templates/lead-assigned';
import { loadOfConfig } from './of-config';
import { logLeadEvent } from './audit-log';

export interface NotifyLeadAssignedOptions {
  tenantId: string;
  leadId: string;
  ownerUserId: string;
  /** null = system (auto-assignation à la création). non-null = clic "Réassigner". */
  assignedBy: string | null;
}

export async function notifyLeadAssigned(opts: NotifyLeadAssignedOptions): Promise<void> {
  // Lecture parallèle des 3 entités requises (1 round-trip BDD).
  const [lead, owner, tenant] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: opts.leadId },
      include: { person: true, interestedProduct: true },
    }),
    prisma.user.findUnique({
      where: { id: opts.ownerUserId },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
    prisma.tenant.findUnique({
      where: { id: opts.tenantId },
      select: { notifyOnLeadAssignEmail: true, notifyOnLeadAssignBell: true },
    }),
  ]);

  // Return silencieux si une des 3 entités manque (ne doit pas arriver en
  // fonctionnement normal, mais évite de crasher si la donnée a été supprimée
  // entre l'autoAssignLead et notifyLeadAssigned).
  if (!lead || !owner || !tenant) return;

  // Compute prospectName (CONTEXT.md D-03) : priorité au `Person` lié (source
  // canonique CRM), fallback `lead.firstName/lastName` (saisie libre).
  const personName = lead.person
    ? `${lead.person.firstName ?? ''} ${lead.person.lastName ?? ''}`.trim()
    : '';
  const leadName = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim();
  const prospectName = personName || leadName || 'Prospect';

  // 1. Notification cloche (si toggle bell ON — défaut true via Tenant @default(true))
  if (tenant.notifyOnLeadAssignBell !== false) {
    await prisma.notification.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.ownerUserId,
        type: 'lead.assigned',
        payload: {
          leadId: opts.leadId,
          prospectName,
          source: lead.source ?? null,
        },
      },
    });
  }

  // 2. Email (si toggle email ON ET owner.email renseigné)
  if (tenant.notifyOnLeadAssignEmail !== false && owner.email) {
    const of = await loadOfConfig(opts.tenantId);
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
    const { subject, html, text } = renderLeadAssignedEmail(
      {
        commercialFirstName: owner.firstName,
        prospectName,
        leadSource: lead.source ?? null,
        productTitle: lead.interestedProduct?.title ?? null,
        leadUrl: `${appUrl.replace(/\/$/, '')}/app/leads/${opts.leadId}`,
      },
      of,
    );
    await sendMail({ to: owner.email, subject, html, text });
    // Pitfall 5 (option b) : on ignore volontairement `mailResult.dryRun`.
    // L'AuditLog atteste la décision d'envoi, pas la livraison physique.
  }

  // 3. AuditLog (toujours écrit — convention D-07)
  await logLeadEvent({
    tenantId: opts.tenantId,
    actorUserId: opts.assignedBy,
    targetLeadId: opts.leadId,
    action: opts.assignedBy ? 'leads.reassigned' : 'leads.auto_assigned',
    diff: {
      assignedTo: opts.ownerUserId,
      assignedBy: opts.assignedBy ?? 'system',
    },
  });
}

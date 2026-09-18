'use server';

/**
 * Server Actions pour la gestion des LegalLinks (cas EI / multi-casquettes).
 */

import { prisma, LinkRole, Prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { validateRequest } from '@/lib/auth';
import { requireRole } from '@/lib/rbac';
import { createHash } from 'node:crypto';
import { calendarDay, legalLinkAtSession, planLegalLinkChange } from '@/lib/persons/legal-link-period';
import { dossierEstParti, pieceEstSignee, pieceEstPartieEnSignature } from '@/lib/enrollment/verrou-financeur';
import { z } from 'zod';

export async function searchOrganizations(query: string, limit = 10) {
  const { user } = await validateRequest();
  if (!user) return [];
  const term = (query || '').trim();
  if (term.length < 2) {
    return prisma.organization.findMany({
      where: { tenantId: user.tenantId, archived: false },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, legalName: true, legalForm: true, siret: true, opcoCode: true },
    });
  }
  return prisma.organization.findMany({
    where: {
      tenantId: user.tenantId,
      archived: false,
      OR: [
        { legalName: { contains: term, mode: 'insensitive' } },
        { siret: { contains: term } },
      ],
    },
    orderBy: { legalName: 'asc' },
    take: limit,
    select: { id: true, legalName: true, legalForm: true, siret: true, opcoCode: true },
  });
}

export async function createLegalLink(input: {
  personId: string;
  organizationId: string;
  role: keyof typeof LinkRole;
  isPrimary?: boolean;
  function?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  // Vérifie que la personne et l'org appartiennent au tenant
  const [person, org] = await Promise.all([
    prisma.person.findFirst({ where: { id: input.personId, tenantId: user.tenantId } }),
    prisma.organization.findFirst({ where: { id: input.organizationId, tenantId: user.tenantId } }),
  ]);
  if (!person || !org) return { ok: false, error: 'Personne ou organisation introuvable.' };

  try {
    const existing = await prisma.legalLink.findFirst({ where: { personId: input.personId, organizationId: input.organizationId } });
    if (existing) return { ok: false, error: 'Cette organisation possède déjà un rattachement. Utilisez « Modifier le rattachement » sur la fiche apprenant pour corriger sa période ou changer de rôle.' };
    const link = await prisma.legalLink.upsert({
      where: {
        personId_organizationId_role: {
          personId: input.personId,
          organizationId: input.organizationId,
          role: input.role as LinkRole,
        },
      },
      create: {
        personId: input.personId,
        organizationId: input.organizationId,
        role: input.role as LinkRole,
        isPrimary: input.isPrimary ?? false,
        function: input.function,
      },
      update: {
        isPrimary: input.isPrimary ?? false,
        function: input.function,
      },
    });

    // Si on marque ce lien comme principal, démarque les autres pour cette person
    if (input.isPrimary) {
      await prisma.legalLink.updateMany({
        where: { personId: input.personId, id: { not: link.id }, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    revalidatePath(`/app/apprenants/${input.personId}`);
    revalidatePath(`/app/organisations/${input.organizationId}`);
    return { ok: true, id: link.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setPrimaryLegalLink(linkId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const link = await prisma.legalLink.findUnique({
    where: { id: linkId },
    include: { person: { select: { tenantId: true } } },
  });
  if (!link || link.person.tenantId !== user.tenantId) {
    return { ok: false, error: 'Lien introuvable.' };
  }

  await prisma.$transaction([
    prisma.legalLink.updateMany({
      where: { personId: link.personId, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.legalLink.update({ where: { id: linkId }, data: { isPrimary: true } }),
  ]);
  revalidatePath(`/app/apprenants/${link.personId}`);
  return { ok: true };
}

type LinkSnapshot = {
  role: LinkRole; function: string | null; startDate: string | null; endDate: string | null; isPrimary: boolean;
};
type LinkChangeResult =
  | { ok: true; changed: boolean; confirmationKey?: string; preview?: { before: LinkSnapshot; after: LinkSnapshot; next: LinkSnapshot | null } }
  | { ok: false; error: string };
const EditLinkSchema = z.object({
  linkId: z.string().min(1), function: z.string().trim().max(200).nullable().optional(),
  startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(),
  changeRole: z.object({ role: z.nativeEnum(LinkRole), effectiveDate: z.string() }).optional(),
  apply: z.boolean().optional(), confirmationKey: z.string().optional(),
}).strict();
type EditLinkInput = z.infer<typeof EditLinkSchema>;

function snapshot(link: { role: LinkRole; function?: string | null; startDate?: Date | string | null; endDate?: Date | string | null; isPrimary?: boolean }): LinkSnapshot {
  return { role: link.role, function: link.function ?? null,
    startDate: link.startDate ? calendarDay(link.startDate) : null,
    endDate: link.endDate ? calendarDay(link.endDate) : null, isPrimary: link.isPrimary ?? false };
}
function datesForDb(link: LinkSnapshot) {
  return { ...link, startDate: link.startDate ? new Date(link.startDate) : null,
    endDate: link.endDate ? new Date(link.endDate) : null };
}
function confirmation(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

/** Prévisualisation par défaut. La confirmation porte sur l'instantané effectivement relu. */
export async function updateLegalLink(input: EditLinkInput): Promise<LinkChangeResult> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const data = EditLinkSchema.parse(input);
    const result = await prisma.$transaction(async (tx): Promise<LinkChangeResult> => {
      const link = await tx.legalLink.findFirst({
        where: { id: data.linkId, person: { tenantId: user.tenantId } },
      });
      if (!link) return { ok: false, error: 'Rattachement introuvable.' };
      const before = snapshot(link);
      let after = { ...before };
      let next: LinkSnapshot | null = null;
      const siblings = await tx.legalLink.findMany({ where: { personId: link.personId, organizationId: link.organizationId } });
      if (data.changeRole) {
        const start = calendarDay(data.changeRole.effectiveDate);
        const previousDay = new Date(start); previousDay.setUTCDate(previousDay.getUTCDate() - 1);
        const existing = siblings.find((l) => l.id !== link.id && l.role === data.changeRole!.role);
        if (existing && before.endDate === calendarDay(previousDay) && existing.startDate && calendarDay(existing.startDate) === start) {
          return { ok: true, changed: false }; // rejeu après succès, sans deuxième journal
        }
        if (existing) return { ok: false, error: 'Une période de ce rôle existe déjà dans cette organisation. Corrigez ses dates dans la fiche apprenant ; elle ne sera pas écrasée.' };
        const plan = planLegalLinkChange(link, data.changeRole);
        after = snapshot({ ...plan.previous, role: link.role });
        next = snapshot({ ...plan.next, role: data.changeRole.role });
      } else {
        if (data.function !== undefined) after.function = data.function || null;
        if (data.startDate !== undefined) after.startDate = data.startDate ? calendarDay(data.startDate) : null;
        if (data.endDate !== undefined) after.endDate = data.endDate ? calendarDay(data.endDate) : null;
        if (after.startDate && after.endDate && after.endDate < after.startDate) throw new Error('La fin du rattachement précède son début.');
      }
      if (JSON.stringify(before) === JSON.stringify(after) && !next) return { ok: true, changed: false };
      const proposed = siblings.filter((l) => l.id !== link.id).map((l) => ({ ...l, ...snapshot(l) }));
      proposed.push({ ...link, ...after });
      if (next) proposed.push({ ...link, id: 'new-period', ...next });
      // Un changement ne doit pas rendre arbitraire le rôle lu sur une session.
      const participants = await tx.sessionParticipant.findMany({
        where: { personId: link.personId, session: { tenantId: user.tenantId } },
        include: { session: { include: { documents: true } }, agreementDocs: true, opcoSubmissions: true, invoices: true },
      });
      const groupedInvoices = participants.length === 0 ? [] : await tx.invoice.findMany({
        where: { tenantId: user.tenantId, sessionId: { in: participants.map((p) => p.sessionId ?? p.session.id) }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
        select: { id: true, number: true, sessionId: true, participantIds: true, status: true },
      });
      for (const participant of participants) {
        let oldRole: string | null = null;
        try { const old = legalLinkAtSession(siblings, link.organizationId, { startDate: participant.session.startDate, endDate: participant.session.endDate }); oldRole = old ? JSON.stringify([old.role, old.function]) : null; } catch { oldRole = 'ambiguous'; }
        let newRole: string | null = null;
        try { const updated = legalLinkAtSession(proposed, link.organizationId, { startDate: participant.session.startDate, endDate: participant.session.endDate }); newRole = updated ? JSON.stringify([updated.role, updated.function]) : null; }
        catch (e) { throw new Error(`${participant.session.code} : ${(e as Error).message}`); }
        if (oldRole === newRole) continue;
        const docs = [...participant.agreementDocs, ...participant.session.documents];
        const piece = docs.find((d) => pieceEstSignee(d) || pieceEstPartieEnSignature(d));
        const dossier = participant.opcoSubmissions.find((d) => dossierEstParti(d.status));
        const invoice = participant.invoices.find((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED') ??
          groupedInvoices.find((i) => i.sessionId === participant.session.id && (!Array.isArray(i.participantIds) || i.participantIds.includes(participant.id)));
        if (participant.conventionSigned || piece || dossier || invoice) {
          const reason = invoice ? `facture ${invoice.number}` : dossier ? `dossier financeur ${dossier.id}` : piece ? `pièce ${piece.type}` : 'convention signée';
          throw new Error(`${participant.session.code} : la période porte une ${reason} engagée. Corrigez d'abord cette pièce depuis la fiche session avant de modifier le rattachement.`);
        }
      }
      const preview = { before, after, next };
      const key = confirmation({ id: link.id, ...preview });
      if (!data.apply) return { ok: true, changed: false, preview, confirmationKey: key };
      if (data.confirmationKey !== key) throw new Error('Prévisualisation absente ou périmée. Vérifiez à nouveau les périodes avant de confirmer.');
      // Le rôle de l'ancien lien reste identique : seules ses bornes / sa fonction changent.
      await tx.legalLink.update({ where: { id: link.id }, data: datesForDb(after) });
      const created = next ? await tx.legalLink.create({ data: { personId: link.personId, organizationId: link.organizationId, ...datesForDb(next) } }) : null;
      await tx.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id,
        entity: 'LegalLink', entityId: link.id, action: next ? 'legalLinks.changeRole' : 'legalLinks.update',
        diff: { ...preview, newLinkId: created?.id ?? null, changed: created ? 2 : 1 } } });
      return { ok: true, changed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.ok && result.changed) revalidatePath('/app/apprenants', 'layout');
    return result;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Modification impossible.' }; }
}

export async function deleteLegalLink(linkId: string, apply = false, confirmationKey?: string): Promise<LinkChangeResult> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const result = await prisma.$transaction(async (tx): Promise<LinkChangeResult> => {
      const link = await tx.legalLink.findFirst({ where: { id: linkId, person: { tenantId: user.tenantId } }, include: { organization: { include: { ageficeProfile: true } } } });
      if (!link) return { ok: true, changed: false };
      const participants = await tx.sessionParticipant.findMany({ where: { personId: link.personId, session: { tenantId: user.tenantId } }, include: { sponsorOrg: { select: { opcoCode: true } }, agreementDocs: { select: { type: true } } } });
      if (participants.some((p) => p.sponsorOrgId === link.organizationId ||
          (['EI_SELF', 'AGENT_COMMERCIAL', 'DIRIGEANT'].includes(link.role) && (p.sponsorOrg.opcoCode === 'AGEFICE' || p.agreementDocs.some((d) => d.type === 'AGEFICE')))) ||
          (link.role === 'EI_SELF' && link.organization.ageficeProfile)) {
        return { ok: false, error: 'Ce lien a porté une inscription ou un profil AGEFICE. Terminez sa période depuis « Modifier le rattachement » pour conserver l’historique.' };
      }
      const key = confirmation({ id: link.id, ...snapshot(link) });
      if (!apply) return { ok: true, changed: false, confirmationKey: key, preview: { before: snapshot(link), after: snapshot(link), next: null } };
      if (confirmationKey !== key) throw new Error('Prévisualisation absente ou périmée. Vérifiez de nouveau ce rattachement.');
      await tx.legalLink.delete({ where: { id: link.id } });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, entity: 'LegalLink', entityId: link.id,
        action: 'legalLinks.delete', diff: { before: JSON.parse(JSON.stringify(link)), deleted: 1 } } });
      return { ok: true, changed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.ok && result.changed) revalidatePath('/app/apprenants', 'layout');
    return result;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Suppression impossible.' }; }
}

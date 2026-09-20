'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import {
  ActivitySchema,
  EditLeadSchema,
  RESULTATS,
  TYPES_ACTIVITE,
  transitionAppel,
} from '@/lib/leads/suivi';
import type { ActionResult } from './leads';

const refresh = (id: string) => {
  revalidatePath('/app/leads');
  revalidatePath(`/app/leads/${id}`);
  revalidatePath(`/app/leads/${id}/edit`);
};
class FicheError extends Error {}
const stale = () =>
  new FicheError('Cette fiche a été modifiée entre-temps. Rechargez la page avant d’enregistrer.');
function failure(e: unknown): ActionResult {
  if (e instanceof FicheError || e instanceof UnauthorizedError || e instanceof ForbiddenError)
    return { ok: false, error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(e.code))
    return { ok: false, error: 'Une autre modification est en cours. Rechargez la fiche.' };
  throw e;
}

export async function editLead(id: string, input: unknown): Promise<ActionResult> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
    const parsed = EditLeadSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const { updatedAt, ...data } = parsed.data;
    await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!lead) throw new FicheError('Lead introuvable.');
      if (!lead.personId && (!data.firstName || !data.lastName))
        throw new FicheError('Le prénom et le nom sont obligatoires.');
      if (lead.personId && (data.firstName !== lead.firstName || data.lastName !== lead.lastName))
        throw new FicheError('Modifiez l’identité depuis la fiche apprenant liée.');
      if (
        data.organizationId &&
        !(await tx.organization.findFirst({
          where: { id: data.organizationId, tenantId: user.tenantId, archived: false },
          select: { id: true },
        }))
      )
        throw new FicheError('Agence introuvable.');
      if (
        data.ownerUserId &&
        !(await tx.user.findFirst({
          where: {
            id: data.ownerUserId,
            tenantId: user.tenantId,
            disabledAt: null,
            role: { in: ['ADMIN', 'MANAGER', 'COMMERCIAL'] },
          },
          select: { id: true },
        }))
      )
        throw new FicheError('Commercial indisponible.');
      const wonAt = data.status === 'WON' ? (lead.wonAt ?? new Date()) : null;
      const closed = ['WON', 'LOST'].includes(data.status);
      const updated = await tx.lead.updateMany({
        where: { id, tenantId: user.tenantId, updatedAt: new Date(updatedAt) },
        data: {
          ...data,
          wonAt,
          nextAction: closed ? null : data.nextAction,
          nextActionAt: closed ? null : data.nextActionAt,
          lossReason: data.status === 'LOST' ? data.lossReason : null,
        },
      });
      if (updated.count !== 1) throw stale();
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Lead',
          entityId: id,
          action: 'leads.edit',
          diff: {
            before: JSON.parse(JSON.stringify(lead)),
            after: JSON.parse(JSON.stringify(data)),
          },
        },
      });
    });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function addLeadActivity(id: string, input: unknown): Promise<ActionResult> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
    const parsed = ActivitySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const d = parsed.data;
    await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!lead) throw new FicheError('Lead introuvable.');
      if (
        await tx.leadAction.findFirst({
          where: { id: d.requestId, leadId: id },
          select: { id: true },
        })
      )
        return;
      let transition;
      try {
        transition = transitionAppel(lead, d);
      } catch (e) {
        throw new FicheError((e as Error).message);
      }
      const closed = ['WON', 'LOST'].includes(transition.status);
      if (!closed && (!d.nextAction || !d.nextActionAt))
        throw new FicheError('Indiquez la prochaine action et sa date.');
      const subject = `${TYPES_ACTIVITE[d.type]}${d.type === 'call' ? ` ${transition.callCount}` : ''}${d.outcome ? ` — ${RESULTATS[d.outcome]}` : ''}`;
      const nextAction = closed ? null : d.nextAction;
      const nextActionAt = closed ? null : d.nextActionAt;
      const changed = await tx.lead.updateMany({
        where: { id, tenantId: user.tenantId, updatedAt: new Date(d.updatedAt) },
        data: {
          ...transition,
          nextAction,
          nextActionAt,
          lossReason: transition.status === 'LOST' ? d.lossReason : null,
          wonAt: transition.status === 'WON' ? (lead.wonAt ?? new Date()) : null,
          ...(!lead.lastActionAt || lead.lastActionAt <= d.occurredAt
            ? { lastAction: subject, lastActionAt: d.occurredAt }
            : {}),
          staleAlertedAt: null,
        },
      });
      if (changed.count !== 1) throw stale();
      await tx.leadAction.create({
        data: {
          id: d.requestId,
          leadId: id,
          type: d.type,
          subject,
          body: d.body,
          occurredAt: d.occurredAt,
          authorUserId: user.id,
          authorName: `${user.firstName} ${user.lastName}`,
          outcome: d.outcome,
          durationSeconds: d.type === 'call' ? d.durationSeconds : null,
          nextAction,
          nextActionAt,
          statusAfter: transition.status,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Lead',
          entityId: id,
          action: 'leads.activity.create',
          diff: {
            activityId: d.requestId,
            before: { status: lead.status, callCount: lead.callCount },
            after: transition,
          },
        },
      });
    });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

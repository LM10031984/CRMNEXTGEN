'use server';

/**
 * Actions en lot sur les dossiers OPCO (US-010).
 *
 * Permet de cocher en masse Facture / Validation / Remboursement / Paiement
 * pour plusieurs SessionParticipant en 1 clic, ou d'envoyer en masse une
 * relance email aux sponsors.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { sendDossierReminderEmail } from './dossier-reminder';

type ToggleField = 'invoiceSent' | 'opcoApproved' | 'opcoReimbursed' | 'paymentReceived';

export interface BulkToggleResult {
  ok: boolean;
  updated: number;
  errors: number;
  skipped: number;
  error?: string;
}

const FIELD_DATE_MAP: Record<ToggleField, keyof Prisma.SessionParticipantUpdateInput> = {
  invoiceSent: 'invoiceSentAt',
  paymentReceived: 'paymentReceivedAt',
  opcoApproved: 'opcoApprovedAt',
  opcoReimbursed: 'opcoReimbursedAt',
};

/**
 * Toggle bulk d'un boolean sur N participants. Réutilise la logique de
 * propagation amountCollected pour paymentReceived/opcoReimbursed.
 */
export async function bulkToggleDossierField(
  participantIds: string[],
  field: ToggleField,
  next: boolean,
): Promise<BulkToggleResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, updated: 0, errors: 0, skipped: 0, error: e.message };
    }
    throw e;
  }
  if (participantIds.length === 0) return { ok: true, updated: 0, errors: 0, skipped: 0 };

  // Sécurité tenant : on filtre sur les participants du tenant uniquement
  const eligible = await prisma.sessionParticipant.findMany({
    where: { id: { in: participantIds }, session: { tenantId: user.tenantId } },
    select: {
      id: true,
      sessionId: true,
      priceHT: true,
      invoiceSent: true,
      opcoApproved: true,
      paymentReceived: true,
      opcoReimbursed: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const sessionIdsToRevalidate = new Set<string>();
  const dateField = FIELD_DATE_MAP[field];
  const now = new Date();

  for (const p of eligible) {
    const current = p[field];
    if (current === next) {
      skipped++;
      continue;
    }
    try {
      const data: Prisma.SessionParticipantUpdateInput = {
        [field]: next,
      };
      // Date de transition false→true
      (data as Record<string, unknown>)[dateField] = next ? now : null;

      // Propagation amountCollected si on touche les booléens encaissement
      if (field === 'paymentReceived' || field === 'opcoReimbursed') {
        const nextPayment = field === 'paymentReceived' ? next : p.paymentReceived;
        const nextReimb = field === 'opcoReimbursed' ? next : p.opcoReimbursed;
        const fullPaid = nextPayment || nextReimb;
        const priceHT = new Prisma.Decimal(p.priceHT);
        data.amountCollected = fullPaid ? priceHT : new Prisma.Decimal(0);
        data.amountRemaining = fullPaid ? new Prisma.Decimal(0) : priceHT;
      }

      await prisma.sessionParticipant.update({
        where: { id: p.id },
        data,
      });
      // Synchro OpcoSubmission : APPROVED/REIMBURSED suit la timeline
      if (next && (field === 'opcoApproved' || field === 'opcoReimbursed')) {
        const last = await prisma.opcoSubmission.findFirst({
          where: { participantId: p.id, status: { in: ['SENT', 'ACK_RECEIVED', 'APPROVED'] } },
          orderBy: { sentAt: 'desc' },
          select: { id: true, status: true },
        });
        if (last) {
          if (field === 'opcoApproved' && last.status !== 'APPROVED' && last.status !== 'REIMBURSED') {
            await prisma.opcoSubmission.update({
              where: { id: last.id },
              data: { status: 'APPROVED', approvedAt: now },
            });
          } else if (field === 'opcoReimbursed' && last.status !== 'REIMBURSED') {
            await prisma.opcoSubmission.update({
              where: { id: last.id },
              data: { status: 'REIMBURSED', reimbursedAt: now },
            });
          }
        }
      }
      sessionIdsToRevalidate.add(p.sessionId);
      updated++;
    } catch {
      errors++;
    }
  }

  revalidatePath('/app/dossiers-opco');
  for (const sid of sessionIdsToRevalidate) {
    revalidatePath(`/app/sessions/${sid}`);
  }

  return { ok: true, updated, errors, skipped };
}

/**
 * US-008 : bascule en masse le type de dossier (FORMATION ↔ PREINSCRIPTION_BUDGET).
 * Cas typique : marquer N inscriptions AGEFICE comme "réservation budget"
 * (dossier déposé en avance pour bloquer le budget annuel sans formation
 * définitivement calée).
 */
export async function bulkSetDossierType(
  participantIds: string[],
  next: 'FORMATION' | 'PREINSCRIPTION_BUDGET',
): Promise<BulkToggleResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, updated: 0, errors: 0, skipped: 0, error: e.message };
    }
    throw e;
  }
  if (participantIds.length === 0) return { ok: true, updated: 0, errors: 0, skipped: 0 };

  const eligible = await prisma.sessionParticipant.findMany({
    where: { id: { in: participantIds }, session: { tenantId: user.tenantId } },
    select: { id: true, sessionId: true, dossierType: true },
  });

  let updated = 0;
  let skipped = 0;
  const sessionIdsToRevalidate = new Set<string>();

  for (const p of eligible) {
    if (p.dossierType === next) {
      skipped++;
      continue;
    }
    await prisma.sessionParticipant.update({
      where: { id: p.id },
      data: { dossierType: next },
    });
    sessionIdsToRevalidate.add(p.sessionId);
    updated++;
  }

  revalidatePath('/app/dossiers-opco');
  for (const sid of sessionIdsToRevalidate) {
    revalidatePath(`/app/sessions/${sid}`);
  }

  return { ok: true, updated, errors: 0, skipped };
}

export interface BulkRemindersResult {
  ok: boolean;
  totalCandidates: number;
  sent: number;
  errors: number;
  skipped: number;
  dryRun: boolean;
}

/**
 * Envoie en masse les relances email pour N dossiers. Skip ceux où la facture
 * n'est pas encore émise ou où le dossier est déjà complet.
 */
export async function bulkSendDossierReminders(
  participantIds: string[],
): Promise<BulkRemindersResult> {
  try {
    await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, totalCandidates: 0, sent: 0, errors: 0, skipped: 0, dryRun: false };
    }
    throw e;
  }
  if (participantIds.length === 0) {
    return { ok: true, totalCandidates: 0, sent: 0, errors: 0, skipped: 0, dryRun: false };
  }

  let sent = 0;
  let errors = 0;
  let skipped = 0;
  let anyDryRun = false;
  for (const id of participantIds) {
    const r = await sendDossierReminderEmail(id);
    if (r.ok) {
      sent++;
      if (r.dryRun) anyDryRun = true;
    } else if (r.error?.includes('non encore émise') || r.error?.includes('complet')) {
      skipped++;
    } else {
      errors++;
    }
  }

  return {
    ok: true,
    totalCandidates: participantIds.length,
    sent,
    errors,
    skipped,
    dryRun: anyDryRun,
  };
}

'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';

type ToggleField = 'invoiceSent' | 'opcoApproved' | 'opcoReimbursed' | 'paymentReceived';

/**
 * Toggle un booléen d'encaissement et propage l'effet sur les montants :
 * - Si paymentReceived OU opcoReimbursed devient true → amountCollected = priceHT
 *   (on considère qu'au moins l'une des deux sources a versé l'intégralité)
 * - Si les deux sont false → amountCollected = 0
 * - amountRemaining = priceHT - amountCollected
 *
 * NB : la sémantique reste simplifiée pour le MVP. Pour les cas mixtes
 * (ex : OPCO 70% + client 30%) on affinera au lot 2 (module Factures).
 */
export async function toggleDossierBoolean(
  participantId: string,
  field: ToggleField,
  next: boolean,
): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    select: {
      id: true,
      sessionId: true,
      priceHT: true,
      paymentReceived: true,
      opcoReimbursed: true,
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  // Calcule le nouvel état des deux booléens encaissement
  const nextPayment = field === 'paymentReceived' ? next : participant.paymentReceived;
  const nextReimb = field === 'opcoReimbursed' ? next : participant.opcoReimbursed;
  const fullPaid = nextPayment || nextReimb;

  // String() : construction realm-safe (un Decimal issu du client reste valide
  // quelle que soit l'instance decimal.js — audit 2026-08-12, neutre en prod).
  const priceHT = new Prisma.Decimal(String(participant.priceHT));
  const amountCollected = fullPaid ? priceHT : new Prisma.Decimal(0);
  const amountRemaining = fullPaid ? new Prisma.Decimal(0) : priceHT;

  const data: Prisma.SessionParticipantUpdateInput = {
    [field]: next,
  };
  // Ne propage les montants que si on touche aux 2 booléens "encaissement"
  if (field === 'paymentReceived' || field === 'opcoReimbursed') {
    data.amountCollected = amountCollected;
    data.amountRemaining = amountRemaining;
  }

  // Memorise la date de transition false→true (et la remet a null si on
  // detoggle). Permet de calculer le DSO moyen entre fin de formation et
  // paiement client / remboursement OPCO. Cf retours Laurent 02/05.
  const dateFieldMap: Record<ToggleField, keyof Prisma.SessionParticipantUpdateInput> = {
    invoiceSent: 'invoiceSentAt',
    paymentReceived: 'paymentReceivedAt',
    opcoApproved: 'opcoApprovedAt',
    opcoReimbursed: 'opcoReimbursedAt',
  };
  const dateField = dateFieldMap[field];
  (data as Record<string, unknown>)[dateField] = next ? new Date() : null;

  await prisma.sessionParticipant.update({
    where: { id: participantId },
    data,
  });

  // Synchro OpcoSubmission : APPROVED quand opcoApproved → true, REIMBURSED
  // quand opcoReimbursed → true. Met à jour le dernier dossier envoyé.
  if (next && (field === 'opcoApproved' || field === 'opcoReimbursed')) {
    await syncOpcoSubmissionStatus(participantId, field);
  }

  // Synchro Facture (audit 2026-08-12) : encaisser côté dossier (paiement
  // client OU remboursement OPCO subrogé) doit solder la facture liée — sinon
  // la page Factures affiche « impayé » pendant que le dossier dit « encaissé »
  // (deux vérités trésorerie contradictoires). Le passage inverse (détoggle)
  // ne reverse RIEN automatiquement : un mouvement d'argent ne s'annule pas
  // silencieusement, on laisse la facture en l'état pour correction manuelle.
  if (next && (field === 'paymentReceived' || field === 'opcoReimbursed')) {
    await settleInvoiceForParticipant(participantId, field);
  }

  revalidatePath('/app/dossiers-opco');
  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}

/**
 * Solde la facture liée à un participant quand l'encaissement est marqué côté
 * dossier OPCO (audit 2026-08-12). Enregistre un InvoicePayment du restant dû
 * (virement — référence explicite) et passe la facture en PAID. No-op si pas
 * de facture, facture déjà soldée, annulée ou avoir.
 */
async function settleInvoiceForParticipant(
  participantId: string,
  field: 'paymentReceived' | 'opcoReimbursed',
) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      participantId,
      status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, amountTTC: true, amountPaid: true, paidAt: true },
  });
  if (!invoice) return;
  const remaining = Number(invoice.amountTTC) - Number(invoice.amountPaid);
  if (remaining <= 0) return;
  const now = new Date();
  await prisma.$transaction([
    prisma.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: new Prisma.Decimal(String(remaining)),
        method: 'virement',
        receivedAt: now,
        reference:
          field === 'opcoReimbursed'
            ? 'Remboursement financeur (synchro dossier OPCO)'
            : 'Paiement client (synchro dossier OPCO)',
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: new Prisma.Decimal(String(invoice.amountTTC)),
        status: 'PAID',
        paidAt: invoice.paidAt ?? now,
      },
    }),
  ]);
}

/**
 * Met à jour le dernier OpcoSubmission status=SENT (ou ACK_RECEIVED) d'un
 * participant pour refléter la validation/remboursement venant de la timeline.
 */
async function syncOpcoSubmissionStatus(
  participantId: string,
  field: 'opcoApproved' | 'opcoReimbursed',
) {
  const last = await prisma.opcoSubmission.findFirst({
    where: {
      participantId,
      status: { in: ['SENT', 'ACK_RECEIVED', 'APPROVED'] },
    },
    orderBy: { sentAt: 'desc' },
    select: { id: true, status: true },
  });
  if (!last) return;
  const now = new Date();
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

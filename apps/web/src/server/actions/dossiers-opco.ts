'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

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
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

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

  const priceHT = new Prisma.Decimal(participant.priceHT);
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

  revalidatePath('/app/dossiers-opco');
  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}

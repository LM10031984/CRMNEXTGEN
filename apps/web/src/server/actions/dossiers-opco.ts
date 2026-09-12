'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import {
  messageRefusReversion,
  planifierReversion,
  type PaiementConnu,
} from '@/lib/invoice-settlement';

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

  // ⚠ E-9 : la réversion est vérifiée AVANT d'écrire le participant. Écrire
  // d'abord puis refuser laisserait exactement la divergence qu'on corrige.
  if (!next && (field === 'paymentReceived' || field === 'opcoReimbursed')) {
    const verdict = await verifierReversionPossible(participantId);
    if (!verdict.ok) return verdict;
  }

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
  // client OU remboursement OPCO subrogé) solde la facture liée — sinon la page
  // Factures affiche « impayé » pendant que le dossier dit « encaissé ».
  //
  // E-9, tranché le 10/09/2026 : le retour DÉFAIT l'aller. L'ancien commentaire
  // disait « un mouvement d'argent ne s'annule pas silencieusement, on laisse la
  // facture en l'état pour correction manuelle ». Deux faits l'ont invalidé :
  // rien ne signalait jamais cette correction (la divergence était donc
  // silencieuse dans l'autre sens), et la bascule n'écrivait AUCUN AuditLog —
  // l'argument défendait une trace qui n'existait pas. Elle existe maintenant,
  // à l'aller comme au retour, et seul un règlement produit par la synchro est
  // supprimable : un règlement saisi à la main fait REFUSER la réversion.
  if (field === 'paymentReceived' || field === 'opcoReimbursed') {
    const consequence = next
      ? await settleInvoiceForParticipant(participantId, field, user.tenantId, user.id)
      : await unsettleInvoiceForParticipant(participantId, field, user.tenantId, user.id);
    if (!consequence.ok) return consequence;
  }

  revalidatePath('/app/dossiers-opco');
  revalidatePath(`/app/sessions/${participant.sessionId}`);
  return { ok: true };
}

/** La facture soldable d'un participant, avec ses règlements et leur origine. */
async function factureDuParticipant(participantId: string) {
  return prisma.invoice.findFirst({
    where: { participantId, status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE', 'PAID'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      tenantId: true,
      amountTTC: true,
      amountPaid: true,
      paidAt: true,
      status: true,
      payments: { select: { id: true, amount: true, source: true } },
    },
  });
}

/**
 * Le dé-toggle est-il possible ? Vérifié AVANT toute écriture (E-9).
 *
 * Pas de facture, ou facture non soldée par la synchro : on laisse passer — le
 * dossier peut se corriger seul, il n'y a rien à défaire côté facture.
 * Règlement humain présent : REFUS, et le message nomme la facture.
 */
async function verifierReversionPossible(
  participantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invoice = await factureDuParticipant(participantId);
  if (!invoice) return { ok: true };

  const paiements: PaiementConnu[] = invoice.payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    source: p.source,
  }));
  const plan = planifierReversion(paiements, Number(invoice.amountTTC));

  // « Rien de la synchro à défaire » n'est pas un refus : c'est une facture que
  // la machine n'a jamais touchée, le dossier se corrige sans elle.
  if (!plan.ok && plan.raison === 'aucun-paiement-synchro') return { ok: true };
  if (!plan.ok) return { ok: false, error: messageRefusReversion(plan.raison, invoice.number) };
  return { ok: true };
}

/**
 * Défait ce que `settleInvoiceForParticipant` a fait : supprime le règlement
 * d'origine `OPCO_SYNC`, recalcule le montant réglé et rend son statut à la
 * facture. `AuditLog` dans la MÊME transaction que la suppression — un
 * mouvement d'argent qui s'annule doit laisser une trace, c'est précisément ce
 * qui manquait avant le 10/09/2026.
 */
async function unsettleInvoiceForParticipant(
  participantId: string,
  field: 'paymentReceived' | 'opcoReimbursed',
  tenantId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invoice = await factureDuParticipant(participantId);
  if (!invoice) return { ok: true };

  const paiements: PaiementConnu[] = invoice.payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    source: p.source,
  }));
  const plan = planifierReversion(paiements, Number(invoice.amountTTC));

  if (!plan.ok) {
    if (plan.raison === 'aucun-paiement-synchro') return { ok: true };
    return { ok: false, error: messageRefusReversion(plan.raison, invoice.number) };
  }

  await prisma.$transaction([
    prisma.invoicePayment.deleteMany({ where: { id: { in: plan.paymentIdsASupprimer } } }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: new Prisma.Decimal(String(plan.amountPaid)),
        status: plan.status,
        paidAt: plan.status === 'PAID' ? invoice.paidAt : null,
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        entity: 'Invoice',
        entityId: invoice.id,
        action: 'invoices.settlement_reverted',
        diff: {
          number: invoice.number,
          declencheur: field,
          paiementsSupprimes: plan.paymentIdsASupprimer.length,
          statusAvant: invoice.status,
          statusApres: plan.status,
          amountPaidAvant: Number(invoice.amountPaid),
          amountPaidApres: plan.amountPaid,
        },
      },
    }),
  ]);
  return { ok: true };
}

/**
 * Solde la facture liée à un participant quand l'encaissement est marqué côté
 * dossier OPCO (audit 2026-08-12). Enregistre un InvoicePayment `OPCO_SYNC` du
 * restant dû et passe la facture en PAID, avec son `AuditLog` dans la même
 * transaction. No-op si pas de facture, facture déjà soldée, annulée ou avoir.
 */
async function settleInvoiceForParticipant(
  participantId: string,
  field: 'paymentReceived' | 'opcoReimbursed',
  tenantId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      participantId,
      status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, amountTTC: true, amountPaid: true, paidAt: true, status: true },
  });
  if (!invoice) return { ok: true };
  const remaining = Number(invoice.amountTTC) - Number(invoice.amountPaid);
  if (remaining <= 0) return { ok: true };
  const now = new Date();
  await prisma.$transaction([
    prisma.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: new Prisma.Decimal(String(remaining)),
        method: 'virement',
        receivedAt: now,
        // E-9 : c'est cette origine, et elle seule, qui autorisera le
        // dé-toggle à supprimer ce règlement. La `reference` reste lisible par
        // un humain, mais ne sert plus à décider quoi que ce soit.
        source: 'OPCO_SYNC',
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
    prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        entity: 'Invoice',
        entityId: invoice.id,
        action: 'invoices.settled_from_dossier',
        diff: {
          number: invoice.number,
          declencheur: field,
          montantRegle: remaining,
          statusAvant: invoice.status,
          statusApres: 'PAID',
        },
      },
    }),
  ]);
  return { ok: true };
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

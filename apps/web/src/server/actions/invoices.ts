'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdf } from '@/lib/pdf-render';
import {
  renderInvoiceHtml,
  renderInvoiceFooterHtml,
  type InvoiceData,
} from '@/lib/invoice-template';
import { loadOfConfig } from '@/lib/of-config';
import { getNextInvoiceNumber, getNextCreditNoteNumber } from '@/lib/numbering';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import { sendMail } from '@/lib/mailer';
import { renderInvoiceReminderEmail } from '@/lib/mailer-templates/invoice-reminder';
import { CreateCreditNoteSchema } from '@qualiof/shared';

// Phase 7 — Plan 07-01 : suppression du bloc `OF` local qui bypassait
// `getOfConfig()` en lisant directement les variables d'environnement.
// Les Server Actions ci-dessous appellent désormais
// `await loadOfConfig(user.tenantId)` pour lire BDD avec fallback ENV (D-01 hybrid).
//
// Phase 7 — Plan 07-02 : la numérotation a été extraite dans `lib/numbering.ts`
// pour lire `Tenant.invoicePrefix` (préfixe configurable depuis Paramètres,
// fallback 'FAC'). Préserve la sémantique atomique (à appeler dans un tx).

interface CreateInvoiceInput {
  participantId: string;
  vatRate?: number; // défaut 0 (exonération formation pro)
  dueDateDays?: number; // défaut 30j
  notes?: string;
}

/** « 20 rue de France à Nice » (gabarit 12/08) — depuis Location.address. */
function composeLieu(
  location: { name: string; address: unknown } | null,
): string | null {
  if (!location) return null;
  const addr = location.address as Record<string, string> | null;
  if (addr?.street && addr?.city) return `${addr.street} à ${addr.city}`;
  return location.name || null;
}

/** « M. Jean-Guy Ourmières » — formateur principal (gabarit 12/08). */
function composeFormateur(
  trainers: { person: { civility: string | null; firstName: string; lastName: string } }[],
): string | null {
  const t = trainers[0];
  if (!t) return null;
  const civ = t.person.civility?.toLowerCase().startsWith('m') && !t.person.civility?.toLowerCase().startsWith('mme')
    ? 'M.'
    : t.person.civility
      ? 'Mme'
      : 'M.';
  return `${civ} ${t.person.firstName} ${t.person.lastName}`;
}

const MODALITE_LABEL: Record<string, string> = {
  PRESENTIEL: 'en présentiel',
  DISTANCIEL: 'en distanciel',
  MIXTE: 'en présentiel et distanciel',
  ELEARNING: 'en e-learning',
};

export async function createInvoiceFromParticipant(
  input: CreateInvoiceInput,
): Promise<{ ok: boolean; invoiceId?: string; documentId?: string; number?: string; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: input.participantId, session: { tenantId: user.tenantId } },
    include: {
      person: true,
      sponsorOrg: true,
      session: {
        include: {
          product: true,
          // Gabarit 12/08 — désignation riche : lieu + formateur principal.
          location: true,
          trainers: { where: { isPrimary: true }, include: { person: true }, take: 1 },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  // Phase 7 — pre-resolve OF config (BDD fallback ENV via D-01 hybrid)
  const of = await loadOfConfig(user.tenantId);

  const session = participant.session;
  const product = session.product;
  const vatRate = input.vatRate ?? 0;
  const dueDays = input.dueDateDays ?? 30;
  const amountHT = Number(participant.priceHT);
  const amountTTC = Math.round(amountHT * (1 + vatRate / 100) * 100) / 100;

  // Création atomique : numéro + invoice
  const invoice = await prisma.$transaction(async (tx) => {
    const number = await getNextInvoiceNumber(user.tenantId, tx);
    return tx.invoice.create({
      data: {
        tenantId: user.tenantId,
        number,
        status: 'ISSUED',
        participantId: participant.id,
        payerOrgId: participant.sponsorOrg.id,
        amountHT: new Prisma.Decimal(amountHT),
        vatRate: new Prisma.Decimal(vatRate),
        amountTTC: new Prisma.Decimal(amountTTC),
        amountPaid: new Prisma.Decimal(0),
        issueDate: new Date(),
        dueDate: new Date(Date.now() + dueDays * 86400000),
        notes: input.notes ?? null,
      },
    });
  });

  // Génération PDF
  const sponsorAddr = (participant.sponsorOrg.address ?? null) as null | { street?: string; postalCode?: string; city?: string };
  const data: InvoiceData = {
    number: invoice.number,
    issueDate: invoice.issueDate ?? new Date(),
    dueDate: invoice.dueDate ?? new Date(),
    status: invoice.status,
    ofName: of.name,
    ofSiret: of.siret,
    ofRnq: of.rnq,
    ofAddress: of.addressFull,
    ofPhone: of.phone,
    ofEmail: of.email,
    ofTvaIntra: of.tvaIntra || null,
    payerName: participant.sponsorOrg.legalName,
    payerSiret: participant.sponsorOrg.siret,
    payerAddress: sponsorAddr?.street ?? null,
    payerCp: sponsorAddr?.postalCode ?? null,
    payerVille: sponsorAddr?.city ?? null,
    payerEmail: participant.sponsorOrg.email ?? participant.sponsorOrg.emailBilling,
    apprenantNom: participant.person.lastName,
    apprenantPrenom: participant.person.firstName,
    formationTitre: product.title,
    formationCode: session.code,
    formationDateDebut: session.startDate,
    formationDateFin: session.endDate,
    formationDureeHeures: product.durationHours,
    // Gabarit 12/08 — désignation riche
    formationLieu: composeLieu(session.location),
    formateurNom: composeFormateur(session.trainers),
    formationModalite: MODALITE_LABEL[session.modality] ?? null,
    tenantId: user.tenantId,
    amountHT,
    vatRate,
    amountTTC,
    notes: input.notes ?? null,
    paymentMethod: 'Virement',
    paymentIban: of.iban || null,
    paymentBic: of.bic || null,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderHtmlToPdf(renderInvoiceHtml(data), {
      footerHtml: renderInvoiceFooterHtml({ ofName: of.name, ofSiret: of.siret, ofTvaIntra: of.tvaIntra || null }),
    });
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF : ${e?.message ?? e}`, invoiceId: invoice.id };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const key = `factures/${invoice.number}-${hash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfUrl: key, hashSha256: hash },
  });

  // Crée aussi un Document type=FACTURE pour la cohérence
  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'FACTURE',
      entityType: 'invoice',
      entityId: invoice.id,
      pdfUrl: key,
      hashSha256: hash,
      sessionId: session.id,
      participantId: participant.id,
    },
  });

  // Marque l'inscription comme facturée + memorise la date pour la timeline OPCO
  await prisma.sessionParticipant.update({
    where: { id: participant.id },
    data: { invoiceSent: true, invoiceSentAt: new Date() },
  });

  // Phase 11 Plan 11-08 backfill FACT-01 (D-18) — émet 2 events :
  // 1. invoices.created  : trace complète des champs métier
  // 2. invoices.issued   : tracking du passage DRAFT → ISSUED (création passe direct ISSUED)
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: invoice.id,
    action: 'invoices.created',
    diff: {
      amountHt: Number(invoice.amountHT),
      amountTtc: Number(invoice.amountTTC),
      vatRate: Number(invoice.vatRate),
      participantId: invoice.participantId,
      payerOrgId: invoice.payerOrgId,
      sessionId: session.id,
      number: invoice.number,
    },
  });
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: invoice.id,
    action: 'invoices.issued',
    diff: { status: { before: 'DRAFT', after: 'ISSUED' } },
  });

  revalidatePath('/app/factures');
  revalidatePath('/app/dossiers-opco');
  revalidatePath(`/app/sessions/${session.id}`);

  return { ok: true, invoiceId: invoice.id, documentId: doc.id, number: invoice.number };
}

/**
 * Crée UNE facture groupée pour TOUS les participants d'une session payés
 * par un même sponsor (typiquement les salariés d'une SARL employeur sur la
 * même session). 1 PDF avec N lignes au lieu de N factures distinctes.
 *
 * Pour les EI/AE, le résultat sera identique à createInvoiceFromParticipant
 * (1 sponsor = 1 personne = 1 ligne).
 */
export async function createInvoiceForSponsorGroup(input: {
  sessionId: string;
  sponsorOrgId: string;
  vatRate?: number;
  dueDateDays?: number;
  notes?: string;
}): Promise<{ ok: boolean; invoiceId?: string; documentId?: string; number?: string; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    include: {
      product: true,
      // Gabarit 12/08 — désignation riche : lieu + formateur principal.
      location: true,
      trainers: { where: { isPrimary: true }, include: { person: true }, take: 1 },
      participants: {
        where: { sponsorOrgId: input.sponsorOrgId, invoiceSent: false },
        include: { person: true },
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
      },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };
  if (session.participants.length === 0) {
    return { ok: false, error: 'Aucun participant non facturé pour ce sponsor sur cette session.' };
  }

  const sponsor = await prisma.organization.findFirst({
    where: { id: input.sponsorOrgId, tenantId: user.tenantId },
  });
  if (!sponsor) return { ok: false, error: 'Organisation sponsor introuvable.' };

  // Phase 7 — pre-resolve OF config (BDD fallback ENV via D-01 hybrid)
  const of = await loadOfConfig(user.tenantId);

  const vatRate = input.vatRate ?? 0;
  const dueDays = input.dueDateDays ?? 30;
  const totalHT = session.participants.reduce((sum, p) => sum + Number(p.priceHT), 0);
  const totalTTC = Math.round(totalHT * (1 + vatRate / 100) * 100) / 100;

  const participantIds = session.participants.map((p) => p.id);

  const invoice = await prisma.$transaction(async (tx) => {
    const number = await getNextInvoiceNumber(user.tenantId, tx);
    return tx.invoice.create({
      data: {
        tenantId: user.tenantId,
        number,
        status: 'ISSUED',
        // Si 1 seul participant, on remplit aussi participantId pour compatibilité
        participantId: participantIds.length === 1 ? participantIds[0] : null,
        participantIds: participantIds as Prisma.InputJsonValue,
        sessionId: session.id,
        payerOrgId: sponsor.id,
        amountHT: new Prisma.Decimal(totalHT),
        vatRate: new Prisma.Decimal(vatRate),
        amountTTC: new Prisma.Decimal(totalTTC),
        amountPaid: new Prisma.Decimal(0),
        issueDate: new Date(),
        dueDate: new Date(Date.now() + dueDays * 86400000),
        notes: input.notes ?? null,
      },
    });
  });

  // Génération PDF multi-lignes
  const sponsorAddr = (sponsor.address ?? null) as null | { street?: string; postalCode?: string; city?: string };
  const lines = session.participants.map((p) => ({
    label: `${p.person.firstName} ${p.person.lastName.toUpperCase()}`,
    amountHT: Number(p.priceHT),
  }));

  const data: InvoiceData = {
    number: invoice.number,
    issueDate: invoice.issueDate ?? new Date(),
    dueDate: invoice.dueDate ?? new Date(),
    status: invoice.status,
    ofName: of.name,
    ofSiret: of.siret,
    ofRnq: of.rnq,
    ofAddress: of.addressFull,
    ofPhone: of.phone,
    ofEmail: of.email,
    ofTvaIntra: of.tvaIntra || null,
    payerName: sponsor.legalName,
    payerSiret: sponsor.siret,
    payerAddress: sponsorAddr?.street ?? null,
    payerCp: sponsorAddr?.postalCode ?? null,
    payerVille: sponsorAddr?.city ?? null,
    payerEmail: sponsor.email ?? sponsor.emailBilling,
    apprenantNom: lines.length === 1 ? session.participants[0]!.person.lastName : '',
    apprenantPrenom: lines.length === 1 ? session.participants[0]!.person.firstName : '',
    formationTitre: session.product.title,
    formationCode: session.code,
    formationDateDebut: session.startDate,
    formationDateFin: session.endDate,
    formationDureeHeures: session.product.durationHours,
    // Gabarit 12/08 — désignation riche
    formationLieu: composeLieu(session.location),
    formateurNom: composeFormateur(session.trainers),
    formationModalite: MODALITE_LABEL[session.modality] ?? null,
    tenantId: user.tenantId,
    stagiaires: lines.map((l) => l.label),
    amountHT: totalHT,
    vatRate,
    amountTTC: totalTTC,
    notes: input.notes ?? null,
    paymentMethod: 'Virement',
    paymentIban: of.iban || null,
    paymentBic: of.bic || null,
    lines: lines.length > 1 ? lines : undefined,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderHtmlToPdf(renderInvoiceHtml(data), {
      footerHtml: renderInvoiceFooterHtml({ ofName: of.name, ofSiret: of.siret, ofTvaIntra: of.tvaIntra || null }),
    });
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF : ${e?.message ?? e}`, invoiceId: invoice.id };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const key = `factures/${invoice.number}-${hash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfUrl: key, hashSha256: hash },
  });

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'FACTURE',
      entityType: 'invoice',
      entityId: invoice.id,
      pdfUrl: key,
      hashSha256: hash,
      sessionId: session.id,
      participantId: participantIds[0] ?? null,
    },
  });

  // Marque tous les participants concernés comme facturés
  await prisma.sessionParticipant.updateMany({
    where: { id: { in: participantIds } },
    data: { invoiceSent: true },
  });

  // Phase 11 Plan 11-08 backfill FACT-01 (D-18) — émet 2 events :
  // 1. invoices.created  : trace métier (sponsor groupé, N participants, total HT/TTC)
  // 2. invoices.issued   : passage DRAFT → ISSUED
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: invoice.id,
    action: 'invoices.created',
    diff: {
      amountHt: Number(invoice.amountHT),
      amountTtc: Number(invoice.amountTTC),
      vatRate: Number(invoice.vatRate),
      participantIds,
      payerOrgId: invoice.payerOrgId,
      sessionId: session.id,
      number: invoice.number,
      grouped: true,
    },
  });
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: invoice.id,
    action: 'invoices.issued',
    diff: { status: { before: 'DRAFT', after: 'ISSUED' } },
  });

  revalidatePath('/app/factures');
  revalidatePath('/app/dossiers-opco');
  revalidatePath(`/app/sessions/${session.id}`);

  return { ok: true, invoiceId: invoice.id, documentId: doc.id, number: invoice.number };
}

export async function recordInvoicePayment(input: {
  invoiceId: string;
  amount: number;
  method: string;
  receivedAt: string; // ISO
  reference?: string;
}): Promise<{ ok: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, tenantId: user.tenantId },
    include: { participant: true },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };

  const newPaid = Number(invoice.amountPaid) + input.amount;
  const fullyPaid = newPaid >= Number(invoice.amountTTC);

  await prisma.$transaction([
    prisma.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: new Prisma.Decimal(input.amount),
        method: input.method,
        receivedAt: new Date(input.receivedAt),
        reference: input.reference ?? null,
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: new Prisma.Decimal(newPaid),
        status: fullyPaid ? 'PAID' : 'PARTIAL',
        paidAt: fullyPaid ? new Date() : invoice.paidAt,
      },
    }),
    ...(fullyPaid && invoice.participantId
      ? [
          prisma.sessionParticipant.update({
            where: { id: invoice.participantId },
            data: {
              paymentReceived: true,
              amountCollected: new Prisma.Decimal(invoice.participant!.priceHT),
              amountRemaining: new Prisma.Decimal(0),
            },
          }),
        ]
      : []),
  ]);

  // Phase 11 Plan 11-08 backfill FACT-01 (D-18) — trace paiement comptable.
  // Hors transaction : audit complémentaire qui ne doit pas bloquer
  // le rollback business (cohérent createCreditNote Plan 11-05).
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: invoice.id,
    action: 'invoices.payment_recorded',
    diff: {
      amount: input.amount,
      method: input.method,
      receivedAt: input.receivedAt,
      reference: input.reference ?? null,
      fullyPaid,
      newStatus: fullyPaid ? 'PAID' : 'PARTIAL',
      balanceRemaining: Number(invoice.amountTTC) - newPaid,
    },
  });

  revalidatePath('/app/factures');
  revalidatePath(`/app/factures/${invoice.id}`);
  revalidatePath('/app/dossiers-opco');
  return { ok: true };
}

/**
 * Phase 11 Plan 11-05 — Création d'avoir (NCN au sens CGI art. 289).
 *
 * D-01/D-02 : Invoice + status='CREDIT_NOTE' + originalInvoiceId self-FK.
 * D-03      : statut origine éligible ∈ {ISSUED, PAID, PARTIAL, OVERDUE}.
 * D-04      : avoir total → CANCELLED, avoir partiel → original inchangé,
 *             N avoirs cumulés autorisés tant que sum(avoirs) ≤ original.amountHT.
 * D-19      : RBAC ADMIN + MANAGER + COMPTABLE.
 * D-18      : AuditLog action 'invoices.credit_note_created'.
 *
 * Montants stockés en **NÉGATIF** (RESEARCH Finding 6) : simplifie les KPI
 * "À encaisser" et permet d'exclure CREDIT_NOTE naturellement de SUM().
 *
 * Note PDF : la génération du PDF avoir (mode AVOIR du template — Plan 11-05
 * Task 1) n'est pas encore branchée ici ; elle sera ajoutée par le Plan 11-08
 * (page liste factures) ou directement dans une itération suivante. Pour
 * l'instant on crée l'Invoice record (status=CREDIT_NOTE) qui suffit à la
 * comptabilité et à la cross-nav fiche détail. L'UI affichera "PDF à régénérer"
 * tant que pdfUrl est null (cohérent avec le pattern Phase 7-02).
 */
export async function createCreditNote(input: {
  originalInvoiceId: string;
  amountHtToCredit: number;
  motif: string;
}): Promise<
  | { ok: true; creditNoteId: string; number: string }
  | { ok: false; error: string }
> {
  // RBAC D-19
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  // Validation Zod (motif ≥3 chars, amountHtToCredit > 0, originalInvoiceId uuid)
  const parsed = CreateCreditNoteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'Validation échouée',
    };
  }
  const { originalInvoiceId, amountHtToCredit, motif } = parsed.data;

  // Lookup facture origine (scope tenant — RGPD/multi-tenant)
  const original = await prisma.invoice.findFirst({
    where: { id: originalInvoiceId, tenantId: user.tenantId },
    select: {
      id: true,
      number: true,
      status: true,
      amountHT: true,
      amountTTC: true,
      vatRate: true,
      participantId: true,
      payerOrgId: true,
      sessionId: true,
      issueDate: true,
    },
  });
  if (!original) return { ok: false, error: 'Facture introuvable' };

  // D-03 : statuts éligibles
  if (!['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'].includes(original.status)) {
    return {
      ok: false,
      error: 'Avoir impossible sur facture brouillon/annulée/avoir',
    };
  }

  const originalHt = Number(original.amountHT);
  if (amountHtToCredit > originalHt) {
    return {
      ok: false,
      error: `Le montant à créditer (${amountHtToCredit} €) dépasse le montant de la facture (${originalHt} €).`,
    };
  }

  // D-04 : autoriser N avoirs partiels tant que sum ≤ original.amountHT.
  // Avoirs stockés en négatif → Math.abs pour somme positive comparable.
  const existingCreditNotes = await prisma.invoice.findMany({
    where: {
      originalInvoiceId,
      tenantId: user.tenantId,
      status: 'CREDIT_NOTE',
    },
    select: { amountHT: true },
  });
  const alreadyCredited = existingCreditNotes.reduce(
    (sum, cn) => sum + Math.abs(Number(cn.amountHT)),
    0,
  );
  if (alreadyCredited + amountHtToCredit > originalHt) {
    const remaining = originalHt - alreadyCredited;
    return {
      ok: false,
      error: `Cette facture est déjà avoirée à hauteur de ${alreadyCredited} €. Reste créditable : ${remaining} €.`,
    };
  }

  const isTotalCreditNote = alreadyCredited + amountHtToCredit === originalHt;
  const vatRateNum = Number(original.vatRate ?? 0);
  const amountTtcToCredit =
    Math.round(amountHtToCredit * (1 + vatRateNum / 100) * 100) / 100;

  // Transaction atomique : (1) numérotation AVO, (2) create avoir,
  // (3) update facture origine si avoir total.
  const result = await prisma.$transaction(async (tx) => {
    const number = await getNextCreditNoteNumber(user.tenantId, tx);

    const creditNote = await tx.invoice.create({
      data: {
        tenantId: user.tenantId,
        number,
        status: 'CREDIT_NOTE',
        originalInvoiceId: original.id,
        participantId: original.participantId,
        payerOrgId: original.payerOrgId,
        sessionId: original.sessionId,
        amountHT: new Prisma.Decimal(-Math.abs(amountHtToCredit)),
        vatRate: original.vatRate,
        amountTTC: new Prisma.Decimal(-Math.abs(amountTtcToCredit)),
        amountPaid: new Prisma.Decimal(0),
        issueDate: new Date(),
        notes: motif,
      },
    });

    let originalStatusAfter = original.status;
    if (isTotalCreditNote) {
      await tx.invoice.update({
        where: { id: original.id },
        data: { status: 'CANCELLED' },
      });
      originalStatusAfter = 'CANCELLED';
    }

    return { creditNote, originalStatusAfter };
  });

  // AuditLog D-18 (en dehors de la tx pour ne pas bloquer le rollback business)
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: result.creditNote.id,
    action: 'invoices.credit_note_created',
    diff: {
      originalInvoiceId: original.id,
      originalNumber: original.number,
      amountHtCredited: amountHtToCredit,
      motif,
      originalStatusBefore: original.status,
      originalStatusAfter: result.originalStatusAfter,
    },
  });

  // Revalidate (D-07 cross-nav : liste factures + fiche origine + fiche avoir)
  revalidatePath('/app/factures');
  revalidatePath(`/app/factures/${originalInvoiceId}`);
  revalidatePath(`/app/factures/${result.creditNote.id}`);

  return {
    ok: true,
    creditNoteId: result.creditNote.id,
    number: result.creditNote.number,
  };
}

/**
 * Phase 11 Plan 11-06 — Envoi d'une relance facture (FACT-03).
 *
 * Server action **partagée cron + manual** (D-09) :
 *  - `triggered_by='cron'`   → worker système, SKIP requireRole, idempotence 24h
 *  - `triggered_by='manual'` → bouton UI, requireRole + revalidatePath,
 *                              PAS d'idempotence (l'utilisateur force)
 *
 * Décisions clés :
 *  - D-13   : auto-stop si status ∈ {PAID, CANCELLED, CREDIT_NOTE, DRAFT}
 *  - D-13b  : idempotence 24h via `lastReminderAt` pour le cron uniquement
 *  - D-13c  : AuditLog `invoices.reminder_sent` systématique (même sur erreur/dry-run)
 *  - D-19   : RBAC manuel = ADMIN + MANAGER + COMPTABLE
 *  - D-12   : niveau = clamp(reminderCount + 1, 1, invoiceReminderDays.length)
 *  - Mailer : dry-run automatique si SMTP_HOST vide (mailer.ts)
 *  - Email recipient priorité : payerOrg.emailBilling > payerOrg.email > participant.person.email
 */

const REMINDER_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

function getReminderRecipientEmail(invoice: {
  payerOrg: { email: string | null; emailBilling: string | null } | null;
  participant: { person: { email: string | null } | null } | null;
}): string | null {
  return (
    invoice.payerOrg?.emailBilling ??
    invoice.payerOrg?.email ??
    invoice.participant?.person?.email ??
    null
  );
}

export async function sendInvoiceReminder(input: {
  invoiceId: string;
  triggered_by: 'cron' | 'manual';
}): Promise<
  | { ok: true; level: 1 | 2; dryRun: boolean }
  | { ok: false; error: string }
> {
  // RBAC : manual seulement (cron skip — worker système D-09)
  let userId: string | null = null;
  let tenantId: string;

  if (input.triggered_by === 'manual') {
    let user;
    try {
      user = await requireRole(['ADMIN', 'MANAGER', 'COMPTABLE']);
    } catch (e) {
      if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
        return { ok: false, error: e.message };
      }
      throw e;
    }
    userId = user.id;
    tenantId = user.tenantId;
  } else {
    // Cron : pas d'utilisateur — on lit le tenantId depuis la facture
    const inv = await prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { tenantId: true },
    });
    if (!inv) return { ok: false, error: 'Facture introuvable' };
    tenantId = inv.tenantId;
  }

  // Lookup facture + relations
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, tenantId },
    include: {
      payerOrg: { select: { legalName: true, email: true, emailBilling: true } },
      participant: {
        include: {
          person: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };

  // Auto-stop D-13 : PAID / CANCELLED / CREDIT_NOTE / DRAFT → skip
  if (invoice.status === 'PAID') return { ok: false, error: 'Facture déjà payée' };
  if (invoice.status === 'CANCELLED') return { ok: false, error: 'Facture annulée' };
  if (invoice.status === 'CREDIT_NOTE') return { ok: false, error: 'Pas de relance sur un avoir' };
  if (invoice.status === 'DRAFT') return { ok: false, error: 'Facture en brouillon' };

  // Idempotence 24h pour cron uniquement (D-09 — manual confiance utilisateur)
  if (input.triggered_by === 'cron' && invoice.lastReminderAt) {
    const since = Date.now() - invoice.lastReminderAt.getTime();
    if (since < REMINDER_DEDUP_WINDOW_MS) {
      return { ok: false, error: 'Idempotence 24h (cron)' };
    }
  }

  // Lecture tenant.invoiceReminderDays + niveau max
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { invoiceReminderDays: true },
  });
  const reminderDays = tenant?.invoiceReminderDays ?? [30, 45];
  const maxLevel = reminderDays.length;

  if (invoice.reminderCount >= maxLevel) {
    return { ok: false, error: `Niveau maximum atteint (${maxLevel})` };
  }

  const level = Math.min(invoice.reminderCount + 1, maxLevel) as 1 | 2;

  // Days overdue (depuis dueDate, fallback issueDate)
  const dueDate = invoice.dueDate ?? invoice.issueDate ?? new Date();
  const daysOverdue = Math.max(
    0,
    Math.floor((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000)),
  );

  // Email recipient (priorité D-Phase11-Q5)
  const recipientEmail = getReminderRecipientEmail(invoice);
  if (!recipientEmail) {
    // AuditLog quand même pour traçabilité (RESEARCH Q5)
    await logInvoiceEvent({
      tenantId,
      actorUserId: userId,
      targetInvoiceId: invoice.id,
      action: 'invoices.reminder_sent',
      diff: { level, triggered_by: input.triggered_by, error: 'no_email_recipient' },
    });
    return { ok: false, error: 'Aucun email payeur configuré' };
  }

  // Payer name (fallback person)
  const payerName =
    invoice.payerOrg?.legalName ??
    (invoice.participant?.person
      ? `${invoice.participant.person.firstName} ${invoice.participant.person.lastName}`
      : 'Cher client');

  // OfConfig (Phase 7 D-01 hybride BDD/ENV)
  const of = await loadOfConfig(tenantId);

  // Render template (Plan 11-03)
  const remaining = Number(invoice.amountTTC) - Number(invoice.amountPaid);
  const invoiceUrl = `${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/factures/${invoice.id}`;

  const { subject, html, text } = renderInvoiceReminderEmail(
    {
      level,
      invoiceNumber: invoice.number,
      issueDate: invoice.issueDate ?? new Date(),
      dueDate: new Date(dueDate),
      daysOverdue,
      amountTtc: remaining,
      payerName,
      invoiceUrl,
    },
    of,
  );

  // Send mail (2 couches Phase 22-11 : env dry-run + réglages TenantEmailSettings)
  const mailResult = await sendMail({
    to: recipientEmail,
    subject,
    html,
    text,
    context: {
      tenantId,
      category: 'invoice_reminder',
      // Facture groupée : sessionId au niveau facture, sinon celui du participant.
      sessionId: invoice.sessionId ?? invoice.participant?.sessionId ?? null,
    },
  });
  const dryRun = mailResult.dryRun === true;
  const suppressedBySettings = mailResult.suppressed === true;

  // Phase 22 Plan 22-11 (fermeture Pitfall 1) : compteur consommé UNIQUEMENT
  // sur départ réel d'email (ni dry-run env, ni suppression réglages, ni échec SMTP).
  const counterConsumed = mailResult.ok && !dryRun;
  if (counterConsumed) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        lastReminderAt: new Date(),
        reminderCount: { increment: 1 },
      },
    });
  }

  // AuditLog D-13c (systématique — même sur dry-run/suppression)
  await logInvoiceEvent({
    tenantId,
    actorUserId: userId,
    targetInvoiceId: invoice.id,
    action: 'invoices.reminder_sent',
    diff: {
      level,
      channel: 'email',
      triggered_by: input.triggered_by,
      dryRun,
      suppressedBySettings,
      counterConsumed,
      daysOverdue,
    },
  });

  if (input.triggered_by === 'manual') {
    revalidatePath(`/app/factures/${invoice.id}`);
  }

  return { ok: true, level, dryRun };
}

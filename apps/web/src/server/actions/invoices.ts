'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdf } from '@/lib/pdf-render';
import { renderInvoiceHtml, type InvoiceData } from '@/lib/invoice-template';
import { renderOfStandardFooterHtml } from '@/lib/of-pdf-footer';
import { loadOfConfig } from '@/lib/of-config';
import { getNextInvoiceNumber, getNextCreditNoteNumber } from '@/lib/numbering';
import { logInvoiceEvent } from '@/lib/invoice-audit';
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
      session: { include: { product: true } },
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
    amountHT,
    vatRate,
    amountTTC,
    notes: input.notes ?? null,
    paymentMethod: 'Virement bancaire',
    paymentIban: of.iban || null,
    paymentBic: of.bic || null,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderHtmlToPdf(renderInvoiceHtml(data), { footerHtml: renderOfStandardFooterHtml() });
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
    amountHT: totalHT,
    vatRate,
    amountTTC: totalTTC,
    notes: input.notes ?? null,
    paymentMethod: 'Virement bancaire',
    paymentIban: of.iban || null,
    paymentBic: of.bic || null,
    lines: lines.length > 1 ? lines : undefined,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderHtmlToPdf(renderInvoiceHtml(data), { footerHtml: renderOfStandardFooterHtml() });
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

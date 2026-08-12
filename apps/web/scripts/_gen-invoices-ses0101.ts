/**
 * _gen-invoices-ses0101.ts — Factures SES-0101 (quick 2026-08-12, Volet 1).
 *
 * La fiche session n'offre aucun bouton d'émission (trou UI — Volet 2) :
 * ce script one-shot RÉPLIQUE EXACTEMENT `createInvoiceFromParticipant`
 * (apps/web/src/server/actions/invoices.ts:34) sans l'importer (règle projet :
 * un script tsx n'importe jamais une server action → réplique via les libs
 * pures : numbering, invoice-audit, invoice-template, of-pdf-footer, of-config,
 * pdf-render, storage).
 *
 * - 11 factures INDIVIDUELLES : chaque participant est payeur de lui-même
 *   (sponsorOrg = EI individuelle, payeurs protégés à la sync SmartOF 12/08).
 * - Numérotation OFFICIELLE de l'app : getNextInvoiceNumber sous transaction
 *   ({Tenant.invoicePrefix|FAC}-NNNNNN, max+1, séquentielle sans trou).
 * - AuditLog invoices.created + invoices.issued (actorUserId null = système,
 *   diff.script pour la traçabilité).
 * - Idempotent : partIcipant avec facture déjà émise (invoiceSent ou Invoice
 *   existante) → SKIP.
 * - AUCUN email envoyé (aucun appel mailer).
 *
 * Run :
 *   DRY   : cd apps/web && node --import tsx --env-file=../../.env scripts/_gen-invoices-ses0101.ts
 *   WRITE : ... WRITE=1 node --import tsx --env-file=../../.env scripts/_gen-invoices-ses0101.ts
 */
import { createHash } from 'node:crypto';
import { prisma, Prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '../src/lib/storage';
import { renderHtmlToPdf } from '../src/lib/pdf-render';
import { renderInvoiceHtml, type InvoiceData } from '../src/lib/invoice-template';
import { renderOfStandardFooterHtml } from '../src/lib/of-pdf-footer';
import { loadOfConfig } from '../src/lib/of-config';
import { getNextInvoiceNumber } from '../src/lib/numbering';
import { logInvoiceEvent } from '../src/lib/invoice-audit';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const SESSION_CODE = 'SES-0101';
const EXPECTED_TOTAL_HT = 3696; // 11 × 336 € — CA prévu HT validé Laurent
const WRITE = process.env.WRITE === '1';

async function main() {
  console.log(`=== Factures ${SESSION_CODE} — mode ${WRITE ? 'WRITE' : 'DRY (simulation, 0 écriture)'} ===\n`);

  const session = await prisma.trainingSession.findFirst({
    where: { tenantId: TENANT_ID, code: SESSION_CODE },
    include: {
      product: true,
      participants: {
        include: { person: true, sponsorOrg: true },
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
      },
    },
  });
  if (!session?.product) throw new Error(`${SESSION_CODE} introuvable`);
  const participants = session.participants;
  if (participants.length !== 11) throw new Error(`${participants.length} participants ≠ 11`);

  // Factures existantes pour ces participants (idempotence)
  const existing = await prisma.invoice.findMany({
    where: {
      tenantId: TENANT_ID,
      participantId: { in: participants.map((p) => p.id) },
      status: { not: 'CREDIT_NOTE' },
    },
    select: { participantId: true, number: true },
  });
  const invoicedByParticipant = new Map(existing.map((i) => [i.participantId, i.number]));

  // Aperçu numérotation (préfixe officiel + prochain numéro)
  const previewNumber = await getNextInvoiceNumber(TENANT_ID);
  const prefix = previewNumber.slice(0, previewNumber.lastIndexOf('-'));
  let nextSeq = parseInt(previewNumber.slice(previewNumber.lastIndexOf('-') + 1), 10);

  console.log(`Numérotation officielle : préfixe ${prefix}, prochain numéro ${previewNumber}\n`);
  console.log('Participant                        | Payeur (sponsorOrg)                  | HT      | État');
  console.log('-----------------------------------+--------------------------------------+---------+-----');

  let totalHT = 0;
  let toCreate = 0;
  const plan: { participantId: string; label: string; number: string }[] = [];
  for (const p of participants) {
    const label = `${p.person.firstName} ${p.person.lastName}`;
    const amountHT = Number(p.priceHT);
    totalHT += amountHT;
    const already = invoicedByParticipant.get(p.id) ?? (p.invoiceSent ? 'invoiceSent=true' : null);
    const state = already ? `SKIP (déjà facturé : ${already})` : `→ ${prefix}-${String(nextSeq).padStart(6, '0')}`;
    if (!already) {
      plan.push({ participantId: p.id, label, number: `${prefix}-${String(nextSeq).padStart(6, '0')}` });
      nextSeq++;
      toCreate++;
    }
    console.log(
      `${label.padEnd(35)}| ${p.sponsorOrg.legalName.slice(0, 36).padEnd(37)}| ${amountHT.toFixed(2).padStart(7)} | ${state}`,
    );
  }
  console.log(`\nTotal HT session : ${totalHT.toFixed(2)} € (attendu ${EXPECTED_TOTAL_HT}.00) — à créer : ${toCreate}`);
  if (Math.round(totalHT * 100) !== EXPECTED_TOTAL_HT * 100)
    throw new Error(`Somme priceHT ${totalHT} ≠ ${EXPECTED_TOTAL_HT}`);

  if (!WRITE) {
    console.log('\nDRY terminé — relancer avec WRITE=1 pour émettre. Aucune écriture faite. ✅');
    return;
  }

  // ============================ WRITE ============================
  const of = await loadOfConfig(TENANT_ID);
  const vatRate = 0; // exonération formation pro (défaut action)
  const dueDays = 30;
  const results: { number: string; label: string; amountHT: number; invoiceId: string }[] = [];

  for (const p of participants) {
    if (invoicedByParticipant.get(p.id) || p.invoiceSent) continue;
    const label = `${p.person.firstName} ${p.person.lastName}`;
    const amountHT = Number(p.priceHT);
    const amountTTC = Math.round(amountHT * (1 + vatRate / 100) * 100) / 100;

    // 1. Création atomique : numéro + invoice (réplique exacte)
    const invoice = await prisma.$transaction(async (tx) => {
      const number = await getNextInvoiceNumber(TENANT_ID, tx);
      return tx.invoice.create({
        data: {
          tenantId: TENANT_ID,
          number,
          status: 'ISSUED',
          participantId: p.id,
          payerOrgId: p.sponsorOrg.id,
          amountHT: new Prisma.Decimal(amountHT),
          vatRate: new Prisma.Decimal(vatRate),
          amountTTC: new Prisma.Decimal(amountTTC),
          amountPaid: new Prisma.Decimal(0),
          issueDate: new Date(),
          dueDate: new Date(Date.now() + dueDays * 86400000),
          notes: null,
        },
      });
    });

    // 2. PDF (réplique exacte : Gotenberg + footer standard)
    const sponsorAddr = (p.sponsorOrg.address ?? null) as null | {
      street?: string;
      postalCode?: string;
      city?: string;
    };
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
      payerName: p.sponsorOrg.legalName,
      payerSiret: p.sponsorOrg.siret,
      payerAddress: sponsorAddr?.street ?? null,
      payerCp: sponsorAddr?.postalCode ?? null,
      payerVille: sponsorAddr?.city ?? null,
      payerEmail: p.sponsorOrg.email ?? p.sponsorOrg.emailBilling,
      apprenantNom: p.person.lastName,
      apprenantPrenom: p.person.firstName,
      formationTitre: session.product.title,
      formationCode: session.code,
      formationDateDebut: session.startDate,
      formationDateFin: session.endDate,
      formationDureeHeures: session.product.durationHours,
      amountHT,
      vatRate,
      amountTTC,
      notes: null,
      paymentMethod: 'Virement bancaire',
      paymentIban: of.iban || null,
      paymentBic: of.bic || null,
    };
    const pdfBuffer = await renderHtmlToPdf(renderInvoiceHtml(data), {
      footerHtml: renderOfStandardFooterHtml(),
    });

    const hash = createHash('sha256').update(pdfBuffer).digest('hex');
    const key = `factures/${invoice.number}-${hash.slice(0, 8)}.pdf`;
    await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');
    await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfUrl: key, hashSha256: hash } });

    // 3. Document FACTURE (cohérence app)
    await prisma.document.create({
      data: {
        tenantId: TENANT_ID,
        type: 'FACTURE',
        entityType: 'invoice',
        entityId: invoice.id,
        pdfUrl: key,
        hashSha256: hash,
        sessionId: session.id,
        participantId: p.id,
      },
    });

    // 4. Marque l'inscription facturée
    await prisma.sessionParticipant.update({
      where: { id: p.id },
      data: { invoiceSent: true, invoiceSentAt: new Date() },
    });

    // 5. AuditLog ×2 (actorUserId null = système, script tracé)
    await logInvoiceEvent({
      tenantId: TENANT_ID,
      actorUserId: null,
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
        script: '_gen-invoices-ses0101',
      },
    });
    await logInvoiceEvent({
      tenantId: TENANT_ID,
      actorUserId: null,
      targetInvoiceId: invoice.id,
      action: 'invoices.issued',
      diff: { status: { before: 'DRAFT', after: 'ISSUED' }, script: '_gen-invoices-ses0101' },
    });

    results.push({ number: invoice.number, label, amountHT, invoiceId: invoice.id });
    console.log(`  ✓ ${invoice.number} — ${label} — ${amountHT.toFixed(2)} € HT (${(pdfBuffer.length / 1024).toFixed(0)} Ko)`);
  }

  // Contrôle post-écriture
  const check = await prisma.invoice.aggregate({
    where: { tenantId: TENANT_ID, participant: { sessionId: session.id }, status: 'ISSUED' },
    _sum: { amountHT: true },
    _count: true,
  });
  const flags = await prisma.sessionParticipant.count({
    where: { sessionId: session.id, invoiceSent: true },
  });
  console.log(`\nContrôle : ${check._count} factures ISSUED sur la session, somme ${check._sum.amountHT} € HT, invoiceSent=true : ${flags}/11`);
  if (check._count !== 11 || Number(check._sum.amountHT) !== EXPECTED_TOTAL_HT || flags !== 11)
    throw new Error('Contrôle post-écriture KO');
  console.log('Aucun email envoyé. ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

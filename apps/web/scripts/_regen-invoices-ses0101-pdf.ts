/**
 * _regen-invoices-ses0101-pdf.ts — Régénère les PDF des 11 factures SES-0101
 * (quick 2026-08-12, Volet 1bis) : MÊMES numéros/dates/montants (aucune
 * nouvelle Invoice — numérotation intacte), nouveaux PDF avec le gabarit à
 * jour : bloc RIB (IBAN/BIC Tenant formatés) + footer sans « V2 du … ».
 * Met à jour Invoice.pdfUrl/hashSha256 + le Document FACTURE lié.
 * Anciens objets storage = orphelins loggés. AUCUN email.
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/_regen-invoices-ses0101-pdf.ts
 */
import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '../src/lib/storage';
import { renderHtmlToPdf } from '../src/lib/pdf-render';
import { renderInvoiceHtml, type InvoiceData } from '../src/lib/invoice-template';
import { renderOfStandardFooterHtml } from '../src/lib/of-pdf-footer';
import { loadOfConfig } from '../src/lib/of-config';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const SESSION_CODE = 'SES-0101';

async function main() {
  console.log(`=== Régénération PDF factures ${SESSION_CODE} (mêmes numéros) ===\n`);
  const of = await loadOfConfig(TENANT_ID);
  if (!of.iban || !of.bic) throw new Error('IBAN/BIC Tenant absents — lancer _fix-tenant-banking.ts');

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: TENANT_ID,
      status: 'ISSUED',
      participant: { session: { code: SESSION_CODE } },
    },
    include: {
      participant: {
        include: { person: true, session: { include: { product: true } } },
      },
      payerOrg: true,
    },
    orderBy: { number: 'asc' },
  });
  if (invoices.length !== 11) throw new Error(`${invoices.length} factures ≠ 11`);

  for (const inv of invoices) {
    const p = inv.participant!;
    const session = p.session;
    const sponsorAddr = (inv.payerOrg?.address ?? null) as null | {
      street?: string;
      postalCode?: string;
      city?: string;
    };
    const data: InvoiceData = {
      number: inv.number,
      issueDate: inv.issueDate ?? new Date(),
      dueDate: inv.dueDate ?? new Date(),
      status: inv.status,
      ofName: of.name,
      ofSiret: of.siret,
      ofRnq: of.rnq,
      ofAddress: of.addressFull,
      ofPhone: of.phone,
      ofEmail: of.email,
      ofTvaIntra: of.tvaIntra || null,
      payerName: inv.payerOrg?.legalName ?? '',
      payerSiret: inv.payerOrg?.siret ?? null,
      payerAddress: sponsorAddr?.street ?? null,
      payerCp: sponsorAddr?.postalCode ?? null,
      payerVille: sponsorAddr?.city ?? null,
      payerEmail: inv.payerOrg?.email ?? inv.payerOrg?.emailBilling ?? null,
      apprenantNom: p.person.lastName,
      apprenantPrenom: p.person.firstName,
      formationTitre: session.product.title,
      formationCode: session.code,
      formationDateDebut: session.startDate,
      formationDateFin: session.endDate,
      formationDureeHeures: session.product.durationHours,
      amountHT: Number(inv.amountHT),
      vatRate: Number(inv.vatRate),
      amountTTC: Number(inv.amountTTC),
      notes: inv.notes,
      paymentMethod: 'Virement bancaire',
      paymentIban: of.iban || null,
      paymentBic: of.bic || null,
    };
    const pdfBuffer = await renderHtmlToPdf(renderInvoiceHtml(data), {
      footerHtml: renderOfStandardFooterHtml(),
    });
    const hash = createHash('sha256').update(pdfBuffer).digest('hex');
    const key = `factures/${inv.number}-${hash.slice(0, 8)}.pdf`;
    if (inv.pdfUrl && inv.pdfUrl !== key) console.log(`  ⚠ orphelin storage : ${inv.pdfUrl}`);
    await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');
    await prisma.invoice.update({ where: { id: inv.id }, data: { pdfUrl: key, hashSha256: hash } });
    await prisma.document.updateMany({
      where: { tenantId: TENANT_ID, type: 'FACTURE', entityType: 'invoice', entityId: inv.id },
      data: { pdfUrl: key, hashSha256: hash },
    });
    console.log(`  ✓ ${inv.number} régénérée (${(pdfBuffer.length / 1024).toFixed(0)} Ko) — ${key}`);
  }
  console.log('\nAucune nouvelle facture créée (numérotation intacte). Aucun email. ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

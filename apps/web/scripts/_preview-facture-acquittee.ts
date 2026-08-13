/**
 * Script jetable (quick 260813-efh) — rend un PDF témoin des DEUX éditions
 * de facture, pour valider à l'œil le placement du tampon PAYÉ, du cachet et
 * de la signature. Aucune écriture en base, aucun upload.
 *
 *   pnpm --filter @qualiof/web exec tsx scripts/_preview-facture-acquittee.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderInvoiceHtml, renderInvoiceFooterHtml, type InvoiceData } from '../src/lib/invoice-template';
import { renderHtmlToPdf } from '../src/lib/pdf-render';

const BASE: InvoiceData = {
  number: 'F-2026-08-231',
  issueDate: new Date('2026-08-13T09:00:00Z'),
  dueDate: new Date('2026-09-12T09:00:00Z'),
  status: 'PAID',
  ofName: 'Start Academy',
  ofSiret: '90123456700018',
  ofRnq: '93060123456',
  ofAddress: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
  ofPhone: '06 12 34 56 78',
  ofEmail: 'contact@start-academy.fr',
  ofTvaIntra: 'FR90901234567',
  payerName: 'BIANCO INVEST ASSURANCES',
  payerSiret: '84512345600027',
  payerAddress: '18 boulevard Victor Hugo',
  payerCp: '06000',
  payerVille: 'Nice',
  payerEmail: 'compta@bianco-invest.fr',
  apprenantNom: 'Bianco',
  apprenantPrenom: 'Marc',
  formationTitre: "L'IA au service des conseillers immobiliers",
  formationCode: 'SES-0104',
  formationDateDebut: new Date('2026-06-15T08:30:00Z'),
  formationDateFin: new Date('2026-06-17T17:30:00Z'),
  formationDureeHeures: 21,
  formationLieu: '20 rue de France à Nice',
  formateurNom: 'M. Jean-Guy Ourmières',
  formationModalite: 'en présentiel',
  stagiaires: ['Marc BIANCO', 'Sophie PANCRACIO'],
  amountHT: 2100,
  vatRate: 0,
  amountTTC: 2100,
  notes: null,
  paymentMethod: 'Virement',
  paymentIban: 'FR7610807001234567890123456',
  paymentBic: 'CCBPFRPPMAR',
};

const footer = renderInvoiceFooterHtml({
  ofName: BASE.ofName,
  ofSiret: BASE.ofSiret,
  ofTvaIntra: BASE.ofTvaIntra,
});

const outDir = path.resolve(process.cwd(), '../../.preview-facture');
fs.mkdirSync(outDir, { recursive: true });

const editions: [string, InvoiceData][] = [
  ['1-apprenant', BASE],
  [
    '2-acquittee',
    {
      ...BASE,
      acquitted: {
        paidAt: new Date('2026-07-02T10:00:00Z'),
        lieu: BASE.formationLieu ?? null,
        date: BASE.formationDateFin,
      },
    },
  ],
];

for (const [name, data] of editions) {
  const pdf = await renderHtmlToPdf(renderInvoiceHtml(data), { footerHtml: footer });
  const out = path.join(outDir, `facture-${name}.pdf`);
  fs.writeFileSync(out, pdf);
  console.log(`✓ ${out} (${Math.round(pdf.length / 1024)} Ko)`);
}

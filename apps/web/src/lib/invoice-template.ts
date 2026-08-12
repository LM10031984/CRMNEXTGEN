/**
 * Template HTML facture conforme code commerce français.
 * Mentions légales obligatoires : numéro · date · TVA · échéance · mentions
 * "TVA non applicable, art. 293 B du CGI" si applicable.
 */

import { formatIban } from './iban-format';

export interface InvoiceData {
  // Facture
  number: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  // Émetteur (OF)
  ofName: string;
  ofSiret: string;
  ofRnq: string;
  ofAddress: string;
  ofPhone: string;
  ofEmail: string;
  ofTvaIntra: string | null; // null = exonération
  // Destinataire (payeur)
  payerName: string;
  payerSiret: string | null;
  payerAddress: string | null;
  payerCp: string | null;
  payerVille: string | null;
  payerEmail: string | null;
  // Inscription
  apprenantNom: string;
  apprenantPrenom: string;
  formationTitre: string;
  formationCode: string;
  formationDateDebut: Date;
  formationDateFin: Date;
  formationDureeHeures: number;
  // Montants
  amountHT: number;
  vatRate: number; // % (0 si exonération art. 293 B)
  amountTTC: number;
  // Notes optionnelles
  notes: string | null;
  paymentMethod: string;
  paymentIban: string | null;
  paymentBic: string | null;
  // Si présent : facture multi-participants (groupage par sponsorOrg pour les
  // salariés d'une SARL). Une ligne par participant avec son montant HT.
  lines?: { label: string; amountHT: number }[];
  // Phase 11 Plan 11-05 — Mode AVOIR (NCN au sens CGI art. 289).
  // Default 'FACTURE' (rétro-compat). En mode 'AVOIR', le header devient
  // "AVOIR" et un bandeau jaune "Avoir sur facture {originalNumber}" est inséré.
  documentKind?: 'FACTURE' | 'AVOIR';
  originalNumber?: string;       // uniquement renseigné en mode AVOIR
  originalIssueDate?: Date;      // uniquement renseigné en mode AVOIR
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function f(v: string | null | undefined): string {
  return v ? escapeHtml(String(v)) : '';
}

const STYLES = `
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #111; line-height: 1.5; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .header .of { font-size: 9pt; color: #444; }
  .header .of strong { font-size: 14pt; color: #00527A; display: block; margin-bottom: 4px; }
  .invoice-box { text-align: right; }
  .invoice-box h1 { font-size: 22pt; color: #00527A; margin: 0 0 4px 0; letter-spacing: -0.5px; }
  .invoice-box .num { font-family: monospace; font-size: 11pt; color: #444; }
  .billing { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 24px; }
  .billing .block { font-size: 9.5pt; }
  .billing .block .label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .billing .block strong { font-size: 11pt; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; padding: 12px 14px; background: #F1F5F9; border-left: 4px solid #00527A; border-radius: 4px; font-size: 9pt; }
  .meta .label { font-size: 7.5pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .meta strong { font-size: 10pt; }
  table.lines { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 9.5pt; }
  table.lines thead { background: #00527A; color: white; }
  table.lines th { padding: 8px 10px; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4px; }
  table.lines th.right, table.lines td.right { text-align: right; }
  table.lines td { padding: 10px; border-bottom: 1px solid #E5E7EB; }
  table.lines td.designation { line-height: 1.4; }
  table.lines td.designation .sub { font-size: 8.5pt; color: #555; margin-top: 2px; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 18px; }
  .totals table { font-size: 10pt; min-width: 280px; }
  .totals table td { padding: 6px 12px; }
  .totals table tr.total td { font-weight: 700; font-size: 12pt; background: #00527A; color: white; }
  .legal-mentions { background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; font-size: 8.5pt; color: #78350F; }
  .payment { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 4px; padding: 12px 16px; margin-bottom: 16px; font-size: 9pt; }
  .payment h3 { font-size: 9pt; color: #1E40AF; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; }
  .payment .iban { font-family: monospace; font-weight: 600; }
  footer { margin-top: 22px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 7pt; color: #666; text-align: center; line-height: 1.5; }
</style>
`;

export function renderInvoiceHtml(d: InvoiceData): string {
  const exonerationTva = d.vatRate === 0;
  // Phase 11 Plan 11-05 — mode AVOIR (NCN au sens CGI art. 289)
  const docKind = d.documentKind ?? 'FACTURE';
  const isCreditNote = docKind === 'AVOIR';
  const headerTitle = isCreditNote ? 'AVOIR' : 'FACTURE';
  const docLabel = isCreditNote ? 'Avoir' : 'Facture';
  const avoirMention =
    isCreditNote && d.originalNumber
      ? `<div class="avoir-mention" style="background:#FEF3C7;border:1px solid #FCD34D;padding:12px;margin:0 0 16px 0;border-radius:4px;color:#78350F;">
          <strong>Avoir sur facture ${escapeHtml(d.originalNumber)}</strong>${
          d.originalIssueDate
            ? ` émise le ${fmtDate.format(d.originalIssueDate)}`
            : ''
        }
        </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${docLabel} ${escapeHtml(d.number)}</title>
${STYLES}
</head>
<body>

<div class="header">
  <div class="of">
    <strong>${escapeHtml(d.ofName)}</strong>
    ${escapeHtml(d.ofAddress)}<br>
    SIRET ${escapeHtml(d.ofSiret)} · Déclaration ${escapeHtml(d.ofRnq)}<br>
    ${escapeHtml(d.ofPhone)} · ${escapeHtml(d.ofEmail)}
    ${d.ofTvaIntra ? `<br>TVA Intracom. ${escapeHtml(d.ofTvaIntra)}` : ''}
  </div>
  <div class="invoice-box">
    <h1>${headerTitle}</h1>
    <div class="num">${escapeHtml(d.number)}</div>
  </div>
</div>

${avoirMention}

<div class="billing">
  <div class="block">
    <div class="label">Date d'émission</div>
    <strong>${fmtDate.format(d.issueDate)}</strong>
    <div class="label" style="margin-top: 12px;">Date d'échéance</div>
    <strong>${fmtDate.format(d.dueDate)}</strong>
  </div>
  <div class="block">
    <div class="label">Facturé à</div>
    <strong>${escapeHtml(d.payerName)}</strong>
    ${d.payerSiret ? `SIRET ${f(d.payerSiret)}<br>` : ''}
    ${d.payerAddress ? `${f(d.payerAddress)}<br>` : ''}
    ${[d.payerCp, d.payerVille].filter((s): s is string => Boolean(s)).map(escapeHtml).join(' ')}<br>
    ${d.payerEmail ? f(d.payerEmail) : ''}
  </div>
</div>

<div class="meta">
  <div><div class="label">Apprenant</div><strong>${escapeHtml(`${d.apprenantPrenom} ${d.apprenantNom}`)}</strong></div>
  <div><div class="label">Code session</div><strong style="font-family: monospace;">${escapeHtml(d.formationCode)}</strong></div>
  <div><div class="label">Période</div><strong>${fmtDate.format(d.formationDateDebut)} → ${fmtDate.format(d.formationDateFin)}</strong></div>
  <div><div class="label">Durée</div><strong>${d.formationDureeHeures} h</strong></div>
</div>

<table class="lines">
  <thead>
    <tr>
      <th style="width: 60%;">Désignation</th>
      <th class="right">Quantité</th>
      <th class="right">P.U. HT</th>
      <th class="right">Total HT</th>
    </tr>
  </thead>
  <tbody>
    ${
      d.lines && d.lines.length > 0
        ? d.lines
            .map(
              (line, idx) => `
    <tr>
      <td class="designation">
        ${idx === 0 ? `<strong>${escapeHtml(d.formationTitre)}</strong><div class="sub">Action de formation professionnelle continue (Qualiopi)</div>` : ''}
        <div class="sub">Apprenant : ${escapeHtml(line.label)}</div>
      </td>
      <td class="right">1</td>
      <td class="right">${fmtEUR.format(line.amountHT)}</td>
      <td class="right"><strong>${fmtEUR.format(line.amountHT)}</strong></td>
    </tr>`,
            )
            .join('')
        : `
    <tr>
      <td class="designation">
        <strong>${escapeHtml(d.formationTitre)}</strong>
        <div class="sub">Action de formation professionnelle continue (Qualiopi)</div>
        <div class="sub">Apprenant : ${escapeHtml(`${d.apprenantPrenom} ${d.apprenantNom}`)}</div>
      </td>
      <td class="right">1</td>
      <td class="right">${fmtEUR.format(d.amountHT)}</td>
      <td class="right"><strong>${fmtEUR.format(d.amountHT)}</strong></td>
    </tr>`
    }
  </tbody>
</table>

<div class="totals">
  <table>
    <tr>
      <td>Total HT</td>
      <td class="right">${fmtEUR.format(d.amountHT)}</td>
    </tr>
    <tr>
      <td>TVA ${exonerationTva ? '(exonération)' : `(${d.vatRate}%)`}</td>
      <td class="right">${fmtEUR.format(d.amountTTC - d.amountHT)}</td>
    </tr>
    <tr class="total">
      <td>Total TTC à régler</td>
      <td class="right">${fmtEUR.format(d.amountTTC)}</td>
    </tr>
  </table>
</div>

${exonerationTva ? `
<div class="legal-mentions">
  <strong>TVA non applicable</strong> — article 293 B du Code général des impôts.
  Action de formation professionnelle continue exonérée de TVA en application de
  l'article 261, 4-4° a du CGI (déclaration d'activité auprès du Préfet de Région).
</div>
` : ''}

${d.paymentMethod ? `
<div class="payment">
  <h3>Modalités de règlement</h3>
  <div><strong>Mode :</strong> ${escapeHtml(d.paymentMethod)}</div>
  ${d.paymentIban ? `<div style="margin-top: 4px;"><strong>IBAN :</strong> <span class="iban">${escapeHtml(formatIban(d.paymentIban))}</span></div>` : ''}
  ${d.paymentBic ? `<div><strong>BIC :</strong> <span class="iban">${escapeHtml(d.paymentBic)}</span></div>` : ''}
  <div style="margin-top: 6px; font-size: 8pt; color: #555;">
    En cas de retard de paiement, indemnité forfaitaire de 40 € due au titre des frais de recouvrement
    (art. L441-10 du Code de commerce). Pénalités au taux d'intérêt légal majoré de 10 points.
    Pas d'escompte pour règlement anticipé.
  </div>
</div>
` : ''}

${d.notes ? `<div style="font-size: 9pt; color: #444; margin-bottom: 12px;"><strong>Notes :</strong> ${escapeHtml(d.notes)}</div>` : ''}

<footer>
  ${escapeHtml(d.ofName)} — SIRET ${escapeHtml(d.ofSiret)} — Déclaration d'activité ${escapeHtml(d.ofRnq)}<br>
  ${escapeHtml(d.ofAddress)} · ${escapeHtml(d.ofPhone)} · ${escapeHtml(d.ofEmail)}<br>
  Cet enregistrement ne vaut pas agrément de l'État (art. L. 6352-12 du Code du travail).
</footer>

</body>
</html>`;
}

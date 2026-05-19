/**
 * Template email — relance facture impayée (Phase 11 Plan 11-03, FACT-03 D-12).
 *
 * CLONE STRICT de `lead-assigned.ts` (Phase 9 Plan 09-01) :
 *  - HTML inline CSS compatible tous clients mail
 *  - escapeHtml sur toutes les valeurs interpolées (Pitfall 6 RESEARCH.md — XSS)
 *  - OfConfig pour la marque (name, addressFull, siret, rnq) — header + footer
 *  - texte fallback pour clients non-HTML
 *
 * **2 niveaux (D-12)** :
 *  - Niveau 1 (J+30) — ton amical : subject "Rappel — Facture {number} en attente"
 *  - Niveau 2 (J+45) — ton ferme  : subject "Mise en demeure — Facture {number} impayée depuis {N} jours"
 *
 * Le niveau 2 inclut la **mention légale art. L441-10 Code de commerce** (indemnité
 * forfaitaire 40 € + intérêts au taux légal majoré de 10 points).
 *
 * Le `invoiceUrl` doit être construit côté caller (Plan 11-06) :
 *   `${process.env.APP_URL ?? ''}/app/factures/${invoiceId}`
 *
 * Pas de side-effect réseau ici (template pur) → testable sans SMTP.
 */

import type { OfConfig } from '@/lib/of-config';

const BRAND_DARK = '#00527A';
const BRAND_LIGHT_BG = '#F0F9FF';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export interface InvoiceReminderEmailInput {
  level: 1 | 2; // D-12 : 1 = amical (J+30), 2 = ferme (J+45)
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  daysOverdue: number; // jours depuis dueDate
  amountTtc: number; // restant dû (après partial payments)
  payerName: string;
  invoiceUrl: string; // lien fiche facture (download/consultation)
}

export function renderInvoiceReminderEmail(
  input: InvoiceReminderEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const {
    level,
    invoiceNumber,
    issueDate,
    dueDate,
    daysOverdue,
    amountTtc,
    payerName,
    invoiceUrl,
  } = input;

  // === SUBJECT (D-12 verbatim) ===
  const subject =
    level === 1
      ? `Rappel — Facture ${invoiceNumber} en attente`
      : `Mise en demeure — Facture ${invoiceNumber} impayée depuis ${daysOverdue} jours`;

  // === TEXT BODY (fallback non-HTML) ===
  const text =
    level === 1
      ? [
          `Bonjour,`,
          ``,
          `Petit rappel : la facture ${invoiceNumber} (émise le ${fmtDate.format(issueDate)}) est en attente de règlement.`,
          `Montant restant dû : ${fmtEUR.format(amountTtc)}.`,
          `Échéance dépassée depuis le ${fmtDate.format(dueDate)}.`,
          ``,
          `Si le règlement a déjà été effectué, merci d'ignorer ce message.`,
          ``,
          `Consulter la facture : ${invoiceUrl}`,
          ``,
          `Cordialement,`,
          `${of.name}`,
        ].join('\n')
      : [
          `Bonjour,`,
          ``,
          `La facture ${invoiceNumber} (émise le ${fmtDate.format(issueDate)}) est impayée depuis ${daysOverdue} jours.`,
          `Montant restant dû : ${fmtEUR.format(amountTtc)}.`,
          ``,
          `Sans règlement de votre part sous 15 jours, nous engagerons une procédure de recouvrement,`,
          `et appliquerons les pénalités légales (indemnité forfaitaire de 40 € + intérêts au taux légal majoré`,
          `de 10 points — art. L441-10 du Code de commerce).`,
          ``,
          `Consulter la facture : ${invoiceUrl}`,
          ``,
          `Cordialement,`,
          `${of.name}`,
        ].join('\n');

  // === HTML BODY (escape toutes les valeurs interpolées) ===
  const headline = level === 1 ? 'Rappel de règlement' : 'Mise en demeure';
  const headlineColor = level === 1 ? BRAND_DARK : '#B91C1C';
  const bandColor = level === 1 ? BRAND_LIGHT_BG : '#FEF2F2';
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1F2937;line-height:1.5;">
  <div style="max-width:600px;margin:24px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:${headlineColor};padding:28px 32px;text-align:center;color:white;">
      <h1 style="margin:0;font-size:18pt;font-weight:700;letter-spacing:1px;">${escapeHtml(of.name)}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px 0;font-size:16pt;color:${headlineColor};">${escapeHtml(headline)}</h2>
      <p style="margin:0 0 16px 0;">Bonjour <strong>${escapeHtml(payerName)}</strong>,</p>
      ${
        level === 1
          ? `<p style="margin:0 0 16px 0;">Petit rappel : la facture ci-dessous est en attente de règlement depuis le ${escapeHtml(fmtDate.format(dueDate))}.</p>`
          : `<p style="margin:0 0 16px 0;">La facture ci-dessous est impayée depuis <strong>${daysOverdue} jours</strong>. Sans règlement sous 15 jours, nous engagerons une procédure de recouvrement.</p>`
      }
      <div style="background:${bandColor};border-radius:6px;padding:16px;margin:16px 0;">
        <div><strong>Numéro :</strong> <span style="font-family:monospace;">${escapeHtml(invoiceNumber)}</span></div>
        <div><strong>Date d'émission :</strong> ${escapeHtml(fmtDate.format(issueDate))}</div>
        <div><strong>Date d'échéance :</strong> ${escapeHtml(fmtDate.format(dueDate))}</div>
        <div style="margin-top:8px;font-size:13pt;"><strong>Montant restant dû :</strong> ${escapeHtml(fmtEUR.format(amountTtc))}</div>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:${headlineColor};color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:11pt;">
          Consulter la facture
        </a>
      </div>
      ${level === 2 ? `<p style="margin:24px 0 0 0;font-size:9pt;color:#7F1D1D;">Pénalités légales applicables : indemnité forfaitaire de 40 € + intérêts au taux légal majoré de 10 points (art. L441-10 du Code de commerce).</p>` : ''}
      <p style="margin:24px 0 0 0;font-size:10pt;color:#64748B;">Si le règlement a déjà été effectué, merci d'ignorer ce message.<br><br>Cordialement,<br>L'équipe ${escapeHtml(of.name)}</p>
    </div>
    <div style="background:#F8FAFC;padding:16px 32px;border-top:1px solid #E2E8F0;font-size:9pt;color:#64748B;text-align:center;">
      <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong>${of.addressFull ? ` — ${escapeHtml(of.addressFull)}` : ''}<br>
      ${of.siret ? `SIRET : ${escapeHtml(of.siret)}` : ''}${of.siret && of.rnq ? ' — ' : ''}${of.rnq ? `NDA : ${escapeHtml(of.rnq)}` : ''}
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

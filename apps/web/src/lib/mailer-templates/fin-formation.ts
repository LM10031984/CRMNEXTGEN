/**
 * Template email — fin de formation : attestation + facture au stagiaire.
 *
 * CLONE STRICT de `invoice-reminder.ts` (Phase 11) : HTML inline, escapeHtml sur
 * toutes les valeurs, OfConfig pour la marque, texte fallback, AUCUN side-effect
 * réseau (template pur, testable sans SMTP).
 *
 * Contexte (04/09/2026, point Laurent + admin) : à la fin d'une formation le
 * stagiaire doit recevoir automatiquement son attestation de fin de formation
 * et, quand il est lui-même payeur, sa facture. Ce template est la brique
 * « rendu » ; l'orchestration (déclenchement J+1, catégorie email dédiée,
 * garde `usedStub`) viendra ensuite. Premier usage : script
 * `scripts/_test-mail-fin-formation.ts` (envoi témoin sur l'adresse de Laurent).
 *
 * Les pièces jointes (PDF attestation, PDF facture) sont passées par le caller
 * à `sendMail` ; ici on ne rend que subject/html/text et on adapte le texte
 * selon `hasInvoice`.
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

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export interface FinFormationEmailInput {
  learnerFirstName: string;
  learnerLastName: string;
  trainingTitle: string;
  sessionCode: string;
  startDate: Date | null;
  endDate: Date | null;
  durationHours: number | null;
  /** Numéro de facture jointe — null si le stagiaire n'est pas le payeur. */
  invoiceNumber: string | null;
  /** Noms de fichiers joints, pour les lister dans le corps du mail. */
  attachmentNames: string[];
}

function formatPeriod(start: Date | null, end: Date | null): string {
  if (start && end) {
    const s = fmtDate.format(start);
    const e = fmtDate.format(end);
    return s === e ? `le ${s}` : `du ${s} au ${e}`;
  }
  if (end) return `le ${fmtDate.format(end)}`;
  if (start) return `le ${fmtDate.format(start)}`;
  return '';
}

export function renderFinFormationEmail(
  input: FinFormationEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const {
    learnerFirstName,
    learnerLastName,
    trainingTitle,
    sessionCode,
    startDate,
    endDate,
    durationHours,
    invoiceNumber,
    attachmentNames,
  } = input;

  const hasInvoice = Boolean(invoiceNumber);
  const period = formatPeriod(startDate, endDate);
  const hours = durationHours ? `${durationHours} h` : null;

  const subject = hasInvoice
    ? `Votre attestation de formation et votre facture — ${trainingTitle}`
    : `Votre attestation de formation — ${trainingTitle}`;

  const piecesPhrase = hasInvoice
    ? `votre attestation de fin de formation ainsi que la facture ${invoiceNumber}`
    : `votre attestation de fin de formation`;

  const text = [
    `Bonjour ${learnerFirstName},`,
    ``,
    `Merci d'avoir suivi la formation « ${trainingTitle} »${period ? ` ${period}` : ''}${hours ? ` (${hours})` : ''}.`,
    ``,
    `Vous trouverez en pièce jointe ${piecesPhrase}.`,
    ...attachmentNames.map((n) => `  - ${n}`),
    ``,
    `Conservez l'attestation : elle justifie de votre formation auprès de votre financeur et dans le cadre de vos obligations professionnelles.`,
    hasInvoice ? `La facture est à régler par virement selon les conditions indiquées sur le document.` : '',
    ``,
    `Pour toute question, répondez simplement à ce message.`,
    ``,
    `Cordialement,`,
    `${of.name}`,
    `Référence session : ${sessionCode}`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1F2937;line-height:1.5;">
  <div style="max-width:600px;margin:24px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:${BRAND_DARK};padding:28px 32px;text-align:center;color:white;">
      <h1 style="margin:0;font-size:18pt;font-weight:700;letter-spacing:1px;">${escapeHtml(of.name)}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px 0;font-size:16pt;color:${BRAND_DARK};">Votre formation est terminée</h2>
      <p style="margin:0 0 16px 0;">Bonjour <strong>${escapeHtml(learnerFirstName)} ${escapeHtml(learnerLastName)}</strong>,</p>
      <p style="margin:0 0 16px 0;">Merci d'avoir suivi la formation <strong>« ${escapeHtml(trainingTitle)} »</strong>${period ? ` ${escapeHtml(period)}` : ''}${hours ? ` (${escapeHtml(hours)})` : ''}.</p>
      <p style="margin:0 0 8px 0;">Vous trouverez en pièce jointe ${escapeHtml(piecesPhrase)} :</p>
      <div style="background:${BRAND_LIGHT_BG};border-radius:6px;padding:16px;margin:8px 0 16px 0;">
        ${attachmentNames.map((n) => `<div style="font-family:monospace;font-size:10pt;">📎 ${escapeHtml(n)}</div>`).join('')}
      </div>
      <p style="margin:0 0 16px 0;">Conservez l'attestation : elle justifie de votre formation auprès de votre financeur et dans le cadre de vos obligations professionnelles.</p>
      ${hasInvoice ? `<p style="margin:0 0 16px 0;">La facture est à régler par virement selon les conditions indiquées sur le document.</p>` : ''}
      <p style="margin:24px 0 0 0;font-size:10pt;color:#64748B;">Pour toute question, répondez simplement à ce message.<br><br>Cordialement,<br>L'équipe ${escapeHtml(of.name)}<br><span style="font-family:monospace;">Réf. ${escapeHtml(sessionCode)}</span></p>
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

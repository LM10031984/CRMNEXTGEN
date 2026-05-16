/**
 * Template email — lead assigné (Phase 9 Plan 09-01 Task 3, LEAD-01 D-03).
 *
 * CLONE STRICT de `user-invitation.ts` (Phase 8) :
 *  - HTML inline CSS compatible tous clients mail
 *  - escapeHtml sur toutes les valeurs interpolées (Pitfall 6 RESEARCH.md)
 *  - OfConfig pour la marque (name, addressFull, siret, rnq) — header + footer
 *  - texte fallback pour clients non-HTML
 *
 * Le `leadUrl` doit être construit côté caller (Plan 09-02) :
 *   `${process.env.APP_URL ?? ''}/app/leads/${leadId}`
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

export interface LeadAssignedEmailInput {
  commercialFirstName: string;
  prospectName: string;
  leadSource: string | null;
  productTitle: string | null;
  leadUrl: string;
}

export function renderLeadAssignedEmail(
  input: LeadAssignedEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const { commercialFirstName, prospectName, leadSource, productTitle, leadUrl } = input;
  const subject = `Nouveau lead à traiter — ${prospectName}`;

  const text = [
    `Bonjour ${commercialFirstName},`,
    ``,
    `Un nouveau lead vient de vous être assigné :`,
    `- Prospect : ${prospectName}`,
    leadSource ? `- Source : ${leadSource}` : null,
    productTitle ? `- Formation d'intérêt : ${productTitle}` : null,
    ``,
    `Pour le consulter et le qualifier :`,
    leadUrl,
    ``,
    `Bon suivi.`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const detailsHtml = [
    leadSource
      ? `<li><strong>Source :</strong> ${escapeHtml(leadSource)}</li>`
      : '',
    productTitle
      ? `<li><strong>Formation d'intérêt :</strong> ${escapeHtml(productTitle)}</li>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#F1F5F9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1F2937; line-height:1.5;">
  <div style="max-width:600px; margin:24px auto; background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:${BRAND_DARK}; padding:28px 32px; text-align:center; color:white;">
      <h1 style="margin:0; font-size:18pt; font-weight:700; letter-spacing:1px;">${escapeHtml(of.name)}</h1>
    </div>

    <div style="padding:32px;">
      <h2 style="margin:0 0 16px 0; font-size:16pt; color:${BRAND_DARK};">Nouveau lead à traiter</h2>

      <p style="margin:0 0 16px 0;">Bonjour <strong>${escapeHtml(commercialFirstName)}</strong>,</p>

      <p style="margin:0 0 16px 0;">
        Un nouveau lead vient de vous être assigné :
      </p>

      <div style="background:${BRAND_LIGHT_BG}; border-radius:6px; padding:16px; margin:16px 0;">
        <strong style="font-size:12pt; color:${BRAND_DARK};">${escapeHtml(prospectName)}</strong>
        ${detailsHtml ? `<ul style="margin:8px 0 0 0; padding-left:18px; font-size:10pt;">${detailsHtml}</ul>` : ''}
      </div>

      <div style="text-align:center; margin:32px 0;">
        <a href="${escapeHtml(leadUrl)}" style="display:inline-block; background:${BRAND_DARK}; color:white; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:600; font-size:11pt;">
          Voir le lead
        </a>
      </div>

      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        Bon suivi,<br>
        L'équipe ${escapeHtml(of.name)}
      </p>
    </div>

    <div style="background:#F8FAFC; padding:16px 32px; border-top:1px solid #E2E8F0; font-size:9pt; color:#64748B; text-align:center;">
      <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong>${of.addressFull ? ` — ${escapeHtml(of.addressFull)}` : ''}<br>
      ${of.siret ? `SIRET : ${escapeHtml(of.siret)}` : ''}${of.siret && of.rnq ? ' — ' : ''}${of.rnq ? `NDA : ${escapeHtml(of.rnq)}` : ''}
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

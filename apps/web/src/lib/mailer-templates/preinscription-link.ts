/**
 * Template email — envoi du lien de pré-inscription à un apprenant.
 *
 * Pattern clone de `invoice-reminder.ts` :
 *  - HTML inline CSS compatible tous clients mail
 *  - escapeHtml sur toutes les valeurs interpolées (anti-XSS)
 *  - OfConfig pour la marque (name, addressFull, siret, rnq)
 *  - texte fallback pour clients non-HTML
 *
 * Déclenché côté server action `createPreEnrollmentLink` quand un email est
 * fourni par Laurent à la création du lien.
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

export interface PreinscriptionLinkEmailInput {
  firstName: string | null;
  lastName: string | null;
  formUrl: string;
  expiresAt: Date;
}

export function renderPreinscriptionLinkEmail(
  input: PreinscriptionLinkEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const { firstName, lastName, formUrl, expiresAt } = input;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const greeting = fullName ? `Bonjour ${fullName}` : 'Bonjour';

  const subject = `${of.name} — Finalise ton dossier de pré-inscription`;

  const text = [
    greeting + ',',
    '',
    `Pour finaliser ton dossier d'inscription à une formation ${of.name}, dépose tes pièces`,
    'justificatives (pièce d\'identité, RIB, attestation CFP) via le lien sécurisé ci-dessous.',
    '',
    `Ça ne te prendra que 2 minutes.`,
    '',
    `Lien : ${formUrl}`,
    '',
    `Ce lien est valable jusqu'au ${fmtDate.format(expiresAt)}.`,
    '',
    'Cordialement,',
    of.name,
  ].join('\n');

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
      <h2 style="margin:0 0 16px 0;font-size:16pt;color:${BRAND_DARK};">${escapeHtml(greeting)} 👋</h2>
      <p style="margin:0 0 16px 0;">
        Pour finaliser ton dossier d'inscription à une formation <strong>${escapeHtml(of.name)}</strong>,
        dépose tes pièces justificatives via le lien sécurisé ci-dessous.
      </p>
      <div style="background:${BRAND_LIGHT_BG};border-radius:6px;padding:16px;margin:16px 0;font-size:11pt;">
        <div style="margin:4px 0;"><strong>📎 Ce dont tu as besoin :</strong></div>
        <ul style="margin:8px 0 0 16px;padding:0;">
          <li>Une copie de ta pièce d'identité (CNI, passeport, titre de séjour)</li>
          <li>Un RIB</li>
          <li>Ton attestation CFP AGEFICE (recommandée)</li>
        </ul>
        <div style="margin-top:12px;font-size:10pt;color:#475569;">⏱️ Ça ne te prendra que 2 minutes.</div>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="${escapeHtml(formUrl)}" style="display:inline-block;background:${BRAND_DARK};color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:11pt;">
          Déposer mes pièces →
        </a>
      </div>
      <p style="margin:24px 0 0 0;font-size:10pt;color:#64748B;">
        Ce lien est valable jusqu'au <strong>${escapeHtml(fmtDate.format(expiresAt))}</strong>.<br>
        Si tu as une question, réponds simplement à ce mail.<br><br>
        À bientôt,<br>
        L'équipe ${escapeHtml(of.name)}
      </p>
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

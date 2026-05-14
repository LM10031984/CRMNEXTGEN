/**
 * Template HTML du mail de relance pré-inscription Start Academy.
 *
 * Tonalité bienveillante. CTA principal = lien public vers le formulaire.
 * Pas d'images embed pour rester compatible avec tous les clients mail.
 */

import type { OfConfig } from './of-config';

const BRAND_DARK = '#00527A';
const BRAND_LIGHT_BG = '#F0F9FF';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface PreEnrollmentReminderInput {
  firstName: string | null;
  lastName: string | null;
  publicUrl: string;
  reminderNumber: number; // 1, 2, 3…
  daysSinceSent: number;
  formationTitre?: string | null;
}

export function renderReminderHtml(
  input: PreEnrollmentReminderInput,
  of: OfConfig,
): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = input.firstName
    ? `Bonjour ${escapeHtml(input.firstName)}`
    : 'Bonjour';

  const insistanceText =
    input.reminderNumber === 1
      ? "Nous remarquons que vous n'avez pas encore finalisé votre dossier."
      : input.reminderNumber === 2
        ? "Une dernière relance avant l'expiration de votre lien."
        : "Votre lien arrive à expiration sous peu.";

  const subject =
    input.reminderNumber === 1
      ? `Finalisez votre pré-inscription Start Academy`
      : input.reminderNumber === 2
        ? `Relance : votre dossier de pré-inscription`
        : `Dernier rappel : votre lien expire bientôt`;

  const formationLine = input.formationTitre
    ? `<p style="margin: 0 0 16px 0;">Formation : <strong>${escapeHtml(input.formationTitre)}</strong></p>`
    : '';

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
      <p style="margin:0 0 16px 0; font-size:11pt;">${greeting},</p>

      <p style="margin:0 0 16px 0;">${insistanceText}</p>

      ${formationLine}

      <p style="margin:0 0 24px 0;">
        Vous avez reçu il y a ${input.daysSinceSent} jour${input.daysSinceSent > 1 ? 's' : ''} un lien
        pour compléter votre pré-inscription. Il vous suffit de quelques minutes pour le finaliser :
      </p>

      <div style="text-align:center; margin:32px 0;">
        <a href="${input.publicUrl}" style="display:inline-block; background:${BRAND_DARK}; color:white; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:600; font-size:11pt;">
          Finaliser ma pré-inscription
        </a>
      </div>

      <div style="background:${BRAND_LIGHT_BG}; border-radius:6px; padding:16px; margin:24px 0; font-size:10pt;">
        <strong>Documents à fournir :</strong><br>
        • Pièce d'identité (CNI / passeport)<br>
        • RIB (pour le remboursement OPCO le cas échéant)<br>
        • Attestation de versement de la Contribution à la Formation Professionnelle (CFP)
      </div>

      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        Si vous rencontrez un problème ou si vous n'êtes plus intéressé(e), répondez simplement à ce mail.
      </p>

      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        À très vite,<br>
        L'équipe ${escapeHtml(of.name)}
      </p>
    </div>

    <div style="background:#F8FAFC; padding:16px 32px; border-top:1px solid #E2E8F0; font-size:9pt; color:#64748B; text-align:center;">
      <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong> — Siège social : ${escapeHtml(of.addressFull)}<br>
      SIRET : ${escapeHtml(of.siret)} — NDA : ${escapeHtml(of.rnq)}
    </div>
  </div>
</body>
</html>`;

  const text = `${greeting},

${insistanceText}
${input.formationTitre ? `\nFormation : ${input.formationTitre}\n` : ''}
Vous avez reçu il y a ${input.daysSinceSent} jour${input.daysSinceSent > 1 ? 's' : ''} un lien pour compléter votre pré-inscription.

Pour finaliser votre dossier : ${input.publicUrl}

Documents à fournir : CNI / passeport, RIB, attestation CFP.

Si vous rencontrez un problème, répondez simplement à ce mail.

À très vite,
L'équipe ${of.name}`;

  return { subject, html, text };
}

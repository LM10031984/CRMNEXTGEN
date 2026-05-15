/**
 * Template email — réinitialisation de mot de passe (Phase 8 D-06).
 *
 * Déclenché par l'admin via la server action `resetUserPassword`. Génère un
 * nouveau `UserInvitation` (token 32 hex, expiration 7 jours) et envoie ce
 * mail à l'utilisateur qui pourra redéfinir son mot de passe via la même
 * route publique `/invitation/{token}` que pour l'invitation initiale.
 *
 * Réplique le style brand de `user-invitation.ts` — wording adapté au reset.
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

function formatExpiry(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(d);
}

export interface PasswordResetEmailInput {
  firstName: string;
  publicUrl: string;
  expiresAt: Date;
}

export function renderPasswordResetEmail(
  input: PasswordResetEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const { firstName, publicUrl, expiresAt } = input;
  const subject = `Réinitialisation de votre mot de passe QualiOF`;

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `Vous avez demandé (ou un administrateur a demandé pour vous) la réinitialisation de votre mot de passe sur QualiOF (${of.name}).`,
    `Pour définir un nouveau mot de passe, cliquez sur ce lien :`,
    publicUrl,
    ``,
    `Ce lien est valable jusqu'au ${formatExpiry(expiresAt)}.`,
    ``,
    `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre mot de passe actuel reste inchangé.`,
    ``,
    `À bientôt sur QualiOF.`,
  ].join('\n');

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
      <h2 style="margin:0 0 16px 0; font-size:16pt; color:${BRAND_DARK};">Réinitialisation de mot de passe</h2>

      <p style="margin:0 0 16px 0;">Bonjour ${escapeHtml(firstName)},</p>

      <p style="margin:0 0 16px 0;">
        Vous avez demandé (ou un administrateur a demandé pour vous) la réinitialisation
        de votre mot de passe sur QualiOF (<strong>${escapeHtml(of.name)}</strong>).
      </p>

      <p style="margin:0 0 24px 0;">
        Pour définir un nouveau mot de passe, cliquez sur le bouton ci-dessous.
      </p>

      <div style="text-align:center; margin:32px 0;">
        <a href="${escapeHtml(publicUrl)}" style="display:inline-block; background:${BRAND_DARK}; color:white; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:600; font-size:11pt;">
          Réinitialiser mon mot de passe
        </a>
      </div>

      <div style="background:${BRAND_LIGHT_BG}; border-radius:6px; padding:16px; margin:24px 0; font-size:10pt;">
        Ce lien est valable jusqu'au <strong>${escapeHtml(formatExpiry(expiresAt))}</strong>.<br>
        Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :<br>
        <span style="word-break:break-all; color:${BRAND_DARK};">${escapeHtml(publicUrl)}</span>
      </div>

      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message —
        votre mot de passe actuel reste inchangé.
      </p>

      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        À très vite sur QualiOF,<br>
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

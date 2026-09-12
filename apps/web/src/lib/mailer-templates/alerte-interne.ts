/**
 * Gabarit des alertes internes de la chaîne (spec §11.1) — A-1, A-2, A-3.
 *
 * UN gabarit pour les trois, et pas trois fichiers, parce que les trois disent
 * la même chose sous une forme identique : un titre, une phrase, un encadré de
 * faits, un bouton. Trois fichiers auraient divergé au premier ajustement de
 * marque, et on aurait découvert la divergence en regardant sa boîte mail.
 *
 * Ce qui CHANGE d'une alerte à l'autre — le ton de l'urgence, ce qu'on demande
 * de faire — est passé en paramètre, pas dupliqué.
 *
 * Template pur : aucun accès réseau ni base, donc testable sans SMTP.
 * Toute valeur interpolée passe par `escapeHtml` (un nom de prospect peut
 * contenir n'importe quoi, et il vient d'un formulaire public).
 */

import type { OfConfig } from '@/lib/of-config';

const BRAND_DARK = '#00527A';
const BRAND_LIGHT_BG = '#F0F9FF';
/** Ambre : « ça traîne », jamais rouge — un lead en retard n'est pas une panne. */
const BRAND_WARN_BG = '#FFFBEB';
const BRAND_WARN = '#B45309';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface AlerteInterneInput {
  /** Objet de l'email ET titre du bloc. */
  subject: string;
  titre: string;
  /** La phrase qui explique pourquoi cet email arrive maintenant. */
  intro: string;
  /** Ce qui est mis en avant dans l'encadré — un nom, un libellé de campagne. */
  vedette: string;
  /** Faits complémentaires, en « clé : valeur ». Vide = encadré sans liste. */
  details?: { label: string; value: string }[];
  ctaLabel: string;
  ctaUrl: string;
  /** true → encadré ambre : quelque chose attend depuis trop longtemps. */
  urgent?: boolean;
}

export function renderAlerteInterne(
  input: AlerteInterneInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const details = input.details ?? [];
  const bg = input.urgent ? BRAND_WARN_BG : BRAND_LIGHT_BG;
  const accent = input.urgent ? BRAND_WARN : BRAND_DARK;

  const text = [
    input.titre,
    '',
    input.intro,
    '',
    `- ${input.vedette}`,
    ...details.map((d) => `- ${d.label} : ${d.value}`),
    '',
    `${input.ctaLabel} :`,
    input.ctaUrl,
    '',
    `L'équipe ${of.name}`,
  ].join('\n');

  const detailsHtml = details
    .map(
      (d) =>
        `<li><strong>${escapeHtml(d.label)} :</strong> ${escapeHtml(d.value)}</li>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0; padding:0; background:#F1F5F9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1F2937; line-height:1.5;">
  <div style="max-width:600px; margin:24px auto; background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:${BRAND_DARK}; padding:28px 32px; text-align:center; color:white;">
      <h1 style="margin:0; font-size:18pt; font-weight:700; letter-spacing:1px;">${escapeHtml(of.name)}</h1>
    </div>

    <div style="padding:32px;">
      <h2 style="margin:0 0 16px 0; font-size:16pt; color:${accent};">${escapeHtml(input.titre)}</h2>

      <p style="margin:0 0 16px 0;">${escapeHtml(input.intro)}</p>

      <div style="background:${bg}; border-radius:6px; padding:16px; margin:16px 0;">
        <strong style="font-size:12pt; color:${accent};">${escapeHtml(input.vedette)}</strong>
        ${detailsHtml ? `<ul style="margin:8px 0 0 0; padding-left:18px; font-size:10pt;">${detailsHtml}</ul>` : ''}
      </div>

      <div style="text-align:center; margin:32px 0;">
        <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block; background:${BRAND_DARK}; color:white; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:600; font-size:11pt;">
          ${escapeHtml(input.ctaLabel)}
        </a>
      </div>

      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
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

  return { subject: input.subject, html, text };
}

/**
 * Email de remise de la proposition au client (D-21, 10/09/2026).
 *
 * CE QU'IL NE CONTIENT PAS, ET C'EST LE POINT
 *
 * Ni PDF en pièce jointe, ni montant, ni nom de participant. Il porte le LIEN
 * de lecture public, et rien d'autre. Trois raisons, dans l'ordre où elles
 * comptent :
 *
 *  1. la proposition contient la grille équipe et le chiffrage par bénéficiaire
 *     — des données nominatives qui ne doivent pas voyager en pièce jointe dans
 *     une boîte mail qu'on transfère sans y penser (§7.2, doctrine PII) ;
 *  2. un lien reste à jour ; un PDF joint fige une version qu'on ne peut plus
 *     corriger, et c'est celle-là que le client rouvrira dans trois semaines ;
 *  3. le lien expire avec la validité de la proposition, ce qu'une pièce jointe
 *     ne sait pas faire.
 *
 * L'email dit donc juste assez pour qu'on ait envie de cliquer, et le reste se
 * lit sur la page.
 *
 * Template pur : ni réseau ni base, testable sans SMTP.
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

export interface PropositionRemiseInput {
  /** Prénom du destinataire, ou null si on ne le connaît pas. */
  destinataireFirstName: string | null;
  /** Titre de la proposition — ce qu'on a proposé, en une ligne. */
  titre: string;
  /** Lien public de lecture, fraîchement émis. */
  lienUrl: string;
  /** Date de fin de validité, déjà formatée. */
  validiteTexte: string | null;
  /** Prénom du commercial qui envoie — l'email vient de quelqu'un. */
  commercialFirstName: string | null;
}

export function renderPropositionRemise(
  input: PropositionRemiseInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const subject = `Votre proposition de formation — ${input.titre}`;
  const bonjour = input.destinataireFirstName ? `Bonjour ${input.destinataireFirstName},` : 'Bonjour,';
  const signature = input.commercialFirstName
    ? `${input.commercialFirstName}\n${of.name}`
    : `L'équipe ${of.name}`;

  const text = [
    bonjour,
    '',
    'Comme convenu, voici la proposition dont nous avons parlé. Elle détaille le',
    'parcours, le calendrier et le financement mobilisable.',
    '',
    'À consulter ici :',
    input.lienUrl,
    '',
    ...(input.validiteTexte ? [`Cette proposition est valable jusqu'au ${input.validiteTexte}.`, ''] : []),
    'Je reste à votre disposition pour en reparler.',
    '',
    signature,
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
      <h2 style="margin:0 0 16px 0; font-size:16pt; color:${BRAND_DARK};">Votre proposition de formation</h2>

      <p style="margin:0 0 16px 0;">${escapeHtml(bonjour)}</p>

      <p style="margin:0 0 16px 0;">
        Comme convenu, voici la proposition dont nous avons parlé. Elle détaille le parcours,
        le calendrier et le financement mobilisable.
      </p>

      <div style="background:${BRAND_LIGHT_BG}; border-radius:6px; padding:16px; margin:16px 0;">
        <strong style="font-size:12pt; color:${BRAND_DARK};">${escapeHtml(input.titre)}</strong>
        ${
          input.validiteTexte
            ? `<div style="margin-top:6px; font-size:10pt; color:#475569;">Valable jusqu'au ${escapeHtml(input.validiteTexte)}</div>`
            : ''
        }
      </div>

      <div style="text-align:center; margin:32px 0;">
        <a href="${escapeHtml(input.lienUrl)}" style="display:inline-block; background:${BRAND_DARK}; color:white; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:600; font-size:11pt;">
          Consulter la proposition
        </a>
      </div>

      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        Je reste à votre disposition pour en reparler.<br>
        ${escapeHtml(input.commercialFirstName ?? '')}${input.commercialFirstName ? '<br>' : ''}${escapeHtml(of.name)}
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

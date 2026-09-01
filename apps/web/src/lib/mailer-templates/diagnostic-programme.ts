/**
 * Template email — programme issu du diagnostic express du stand.
 *
 * CLONE STRICT de `lead-assigned.ts` : HTML inline, escapeHtml sur toute valeur
 * interpolée, OfConfig pour la marque, texte de repli. Template PUR : aucun
 * side-effect réseau, testable sans SMTP.
 *
 * Destinataire : un PROSPECT, pas un collègue. D'où deux différences de fond
 * avec les autres templates :
 *  - aucun lien vers l'application (il n'y a pas de compte à ouvrir) ;
 *  - aucun prix. Le tarif dépend du payeur et des droits AGEFICE restants ;
 *    l'annoncer dans un email automatique, c'est s'engager à l'aveugle.
 */

import type { OfConfig } from '@/lib/of-config';
import { PROBLEMATIQUES, type ProblematiqueKey } from '@/lib/diagnostic/questions';
import { TRAMES, formatDuree } from '@/lib/diagnostic/programmes';

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

export interface DiagnosticProgrammeEmailInput {
  firstName: string;
  dominante: ProblematiqueKey;
  secondaire: ProblematiqueKey | null;
}

export function renderDiagnosticProgrammeEmail(
  input: DiagnosticProgrammeEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const { firstName, dominante, secondaire } = input;
  const probl = PROBLEMATIQUES[dominante];
  const trame = TRAMES[dominante];
  const suite = secondaire ? PROBLEMATIQUES[secondaire] : null;
  const duree = formatDuree(trame.dureeHeures);

  const subject = `Votre programme — ${trame.intitule}`;

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `Merci d'avoir pris 90 secondes sur notre stand.`,
    ``,
    `Ce que vous nous avez dit : ${probl.accroche}`,
    ``,
    `LA JOURNÉE QU'ON VOUS PROPOSE`,
    trame.intitule,
    `Durée : ${duree}`,
    `Public : ${trame.public}`,
    ``,
    `Objectifs :`,
    ...trame.objectifs.map((o) => `- ${o}`),
    ``,
    `Déroulé :`,
    ...trame.sequences.map((s, i) => `${i + 1}. ${s}`),
    ``,
    suite ? `En prolongement, un second axe ressort : ${suite.titre}.` : null,
    suite ? `` : null,
    `Le tarif dépend de qui finance la formation (votre structure, ou vous-même`,
    `avec vos droits AGEFICE). On regarde ça ensemble : c'est souvent pris en`,
    `charge en totalité.`,
    ``,
    `On vous rappelle dans les jours qui viennent.`,
    ``,
    `${of.name}`,
    of.addressFull ?? '',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const objectifsHtml = trame.objectifs
    .map((o) => `<li style="margin-bottom:6px;">${escapeHtml(o)}</li>`)
    .join('');

  const sequencesHtml = trame.sequences
    .map((s) => `<li style="margin-bottom:6px;">${escapeHtml(s)}</li>`)
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
      <p style="margin:0 0 16px 0;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>

      <p style="margin:0 0 16px 0;">
        Merci d'avoir pris 90 secondes sur notre stand. Voici ce que votre diagnostic fait
        ressortir, et la journée qu'on vous propose en face.
      </p>

      <div style="background:${BRAND_LIGHT_BG}; border-radius:6px; padding:16px; margin:16px 0;">
        <strong style="font-size:12pt; color:${BRAND_DARK};">${escapeHtml(probl.titre)}</strong>
        <p style="margin:8px 0 0 0; font-size:10pt;">${escapeHtml(probl.accroche)}</p>
      </div>

      <h2 style="margin:28px 0 4px 0; font-size:14pt; color:${BRAND_DARK};">${escapeHtml(trame.intitule)}</h2>
      <p style="margin:0 0 16px 0; font-size:10pt; color:#64748B;">
        ${escapeHtml(duree)} — ${escapeHtml(trame.public)}
      </p>

      <h3 style="margin:20px 0 8px 0; font-size:11pt; color:${BRAND_DARK};">À l'issue de la journée, vous saurez</h3>
      <ul style="margin:0; padding-left:18px; font-size:10pt;">${objectifsHtml}</ul>

      <h3 style="margin:20px 0 8px 0; font-size:11pt; color:${BRAND_DARK};">Déroulé</h3>
      <ol style="margin:0; padding-left:18px; font-size:10pt;">${sequencesHtml}</ol>

      ${
        suite
          ? `<p style="margin:20px 0 0 0; font-size:10pt; color:#64748B;">En prolongement, un second axe ressort de vos réponses : « ${escapeHtml(suite.titre)} ».</p>`
          : ''
      }

      <div style="background:#F8FAFC; border-left:3px solid ${BRAND_DARK}; padding:14px 16px; margin:24px 0; font-size:10pt;">
        <strong style="color:${BRAND_DARK};">Et le financement ?</strong><br>
        Le tarif dépend de qui finance : votre structure, ou vous-même avec vos droits de
        formation AGEFICE. On regarde ça ensemble — c'est souvent pris en charge en totalité.
      </div>

      <p style="margin:24px 0 0 0; font-size:10pt; color:#64748B;">
        On vous rappelle dans les jours qui viennent.<br>
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

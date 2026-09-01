/**
 * Template email — la journée proposée à l'issue du diagnostic du stand.
 *
 * CLONE STRICT de `lead-assigned.ts` : HTML inline, escapeHtml sur toute valeur
 * interpolée, OfConfig pour la marque, texte de repli. Template PUR : aucun
 * side-effect réseau, testable sans SMTP.
 *
 * Destinataire : un PROSPECT, pas un collègue. D'où deux différences de fond :
 *  - aucun lien vers l'application (il n'y a pas de compte à ouvrir) ;
 *  - aucun prix. Le tarif dépend du payeur et des droits AGEFICE restants ;
 *    l'annoncer dans un email automatique, c'est s'engager à l'aveugle.
 *
 * Deux rendus possibles :
 *  1. `surMesure` fourni → la journée assemblée pour ce prospect à partir du
 *     programme du catalogue (chaque point ancré, cf. programme-sur-mesure.ts) ;
 *  2. `surMesure` null → le programme du catalogue TEL QUEL. Moins flatteur,
 *     mais toujours vrai. Un repli lisible vaut mieux qu'un email raté.
 */

import type { OfConfig } from '@/lib/of-config';
import { PROBLEMATIQUES, type ProblematiqueKey } from '@/lib/diagnostic/questions';
import type { ProgrammeSurMesure } from '@/lib/diagnostic/programme-sur-mesure';

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

/** « 8 h / 1 jour » — convention projet : 8 h = 1 jour (9h-13h / 14h-18h). */
export function formatDuree(heures: number): string {
  const jours = heures / 8;
  const j = Number.isInteger(jours) ? `${jours}` : jours.toFixed(1).replace('.', ',');
  return `${heures} h / ${j} jour${jours > 1 ? 's' : ''}`;
}

export interface ProduitPropose {
  title: string;
  dureeHeures: number;
  objectifs: string[];
  /** Programme du catalogue, utilisé en repli si le sur-mesure a échoué. */
  programmeMd: string;
}

export interface DiagnosticProgrammeEmailInput {
  firstName: string;
  dominante: ProblematiqueKey;
  secondaire: ProblematiqueKey | null;
  produit: ProduitPropose;
  surMesure: ProgrammeSurMesure | null;
}

const MOMENTS: Record<'MATIN' | 'APRES_MIDI', string> = {
  MATIN: 'Matinée (9h - 13h)',
  APRES_MIDI: 'Après-midi (14h - 18h)',
};

export function renderDiagnosticProgrammeEmail(
  input: DiagnosticProgrammeEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const { firstName, dominante, secondaire, produit, surMesure } = input;
  const probl = PROBLEMATIQUES[dominante];
  const suite = secondaire ? PROBLEMATIQUES[secondaire] : null;
  const duree = formatDuree(produit.dureeHeures);

  const subject = `Votre journée — ${produit.title}`;
  const accroche = surMesure?.accroche ?? probl.accroche;
  const objectifs = surMesure?.objectifs ?? produit.objectifs;

  // ── version texte ────────────────────────────────────────────────────────
  const texteSequences = surMesure
    ? surMesure.sequences.flatMap((s) => [
        ``,
        `${MOMENTS[s.moment]} — ${s.titre}`,
        `  ${s.pourquoiVous}`,
        ...s.points.map((p) => `  - ${p.texte}`),
      ])
    : ['', 'PROGRAMME', produit.programmeMd];

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `Merci d'avoir pris 90 secondes sur notre stand.`,
    ``,
    accroche,
    ``,
    `LA JOURNÉE QU'ON VOUS PROPOSE`,
    produit.title,
    `Durée : ${duree}`,
    ``,
    `À l'issue de la journée, vous saurez :`,
    ...objectifs.map((o) => `- ${o}`),
    ...texteSequences,
    ``,
    suite ? `En prolongement, un second axe ressort : ${suite.titre}.` : null,
    ``,
    `Le tarif dépend de qui finance la formation (votre structure, ou vous-même`,
    `avec vos droits AGEFICE). On regarde ça ensemble : c'est souvent pris en`,
    `charge en totalité.`,
    ``,
    `On vous rappelle dans les jours qui viennent.`,
    ``,
    `${of.name}`,
    of.addressFull ?? '',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  // ── version HTML ─────────────────────────────────────────────────────────
  const objectifsHtml = objectifs
    .map((o) => `<li style="margin-bottom:6px;">${escapeHtml(o)}</li>`)
    .join('');

  const sequencesHtml = surMesure
    ? surMesure.sequences
        .map(
          (s) => `
      <div style="margin:18px 0; padding-left:14px; border-left:3px solid ${BRAND_DARK};">
        <div style="font-size:9pt; text-transform:uppercase; letter-spacing:0.5px; color:#94A3B8;">${escapeHtml(MOMENTS[s.moment])}</div>
        <div style="font-weight:600; color:${BRAND_DARK}; margin-top:2px;">${escapeHtml(s.titre)}</div>
        <div style="font-size:10pt; color:#475569; font-style:italic; margin:4px 0 8px 0;">${escapeHtml(s.pourquoiVous)}</div>
        <ul style="margin:0; padding-left:18px; font-size:10pt;">
          ${s.points.map((p) => `<li style="margin-bottom:4px;">${escapeHtml(p.texte)}</li>`).join('')}
        </ul>
      </div>`,
        )
        .join('')
    : `<div style="font-size:10pt; white-space:pre-wrap; margin:16px 0;">${escapeHtml(produit.programmeMd)}</div>`;

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
        Merci d'avoir pris 90 secondes sur notre stand. Voici la journée que votre diagnostic
        fait ressortir — construite sur vos réponses, pas sur un catalogue générique.
      </p>

      <div style="background:${BRAND_LIGHT_BG}; border-radius:6px; padding:16px; margin:16px 0;">
        <div style="font-size:9pt; text-transform:uppercase; letter-spacing:0.5px; color:${BRAND_DARK};">Votre priorité</div>
        <strong style="font-size:12pt; color:${BRAND_DARK};">${escapeHtml(probl.titre)}</strong>
        <p style="margin:8px 0 0 0; font-size:10pt;">${escapeHtml(accroche)}</p>
      </div>

      <h2 style="margin:28px 0 4px 0; font-size:14pt; color:${BRAND_DARK};">${escapeHtml(produit.title)}</h2>
      <p style="margin:0 0 16px 0; font-size:10pt; color:#64748B;">${escapeHtml(duree)}</p>

      <h3 style="margin:20px 0 8px 0; font-size:11pt; color:${BRAND_DARK};">À l'issue de la journée, vous saurez</h3>
      <ul style="margin:0; padding-left:18px; font-size:10pt;">${objectifsHtml}</ul>

      <h3 style="margin:24px 0 8px 0; font-size:11pt; color:${BRAND_DARK};">Le déroulé de votre journée</h3>
      ${sequencesHtml}

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

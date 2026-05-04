/**
 * Questionnaire de positionnement — template HTML.
 *
 * Document Qualiopi indicateur 4 (recueil amont). Auto-évaluation du
 * stagiaire sur N compétences, sur une échelle de 4 niveaux :
 *   1 = Je ne maîtrise pas
 *   2 = Je dois approfondir
 *   3 = Je maîtrise partiellement
 *   4 = Je maîtrise complètement
 *
 * Rendu en double colonne "Avant la formation" / "Après la formation" pour
 * matérialiser la progression. Cases pré-cochées par Ollama (avant = niveaux
 * 1-2, après = niveaux 3-4 majoritairement).
 *
 * Données attendues :
 *   {
 *     objectifs_formation?: string,
 *     demande_specifique?: string,
 *     prerequis?: string,
 *     competences: [{ label: string, avant: 1|2|3|4, apres: 1|2|3|4 }],
 *     commentaires?: string,
 *   }
 */

import {
  type ClosureContext,
  BRAND_DARK,
  escapeHtml,
  renderBrandHeader,
  renderInfoBox,
  renderStagiaireBlock,
  wrapHtml,
} from './shared-template';

export interface PositionnementCompetence {
  label: string;
  avant: 1 | 2 | 3 | 4;
  apres: 1 | 2 | 3 | 4;
}

export interface PositionnementContent {
  objectifs_formation?: string | null;
  demande_specifique?: string | null;
  prerequis?: string | null;
  competences: PositionnementCompetence[];
  commentaires?: string | null;
}

const NIVEAUX = [
  'Je ne maîtrise pas',
  'Je dois approfondir',
  'Je maîtrise partiellement',
  'Je maîtrise complètement',
];

function checkbox(checked: boolean, color: string): string {
  return `<span style="display:inline-block; width:10px; height:10px; border:1.2px solid #94A3B8; background:${checked ? color : 'transparent'};"></span>`;
}

export function renderPositionnementHtml(
  ctx: ClosureContext,
  content: PositionnementContent,
): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();

  const competenceRows = content.competences
    .map((comp) => {
      const avantCells = [1, 2, 3, 4]
        .map((n) => `<td style="text-align: center;">${checkbox(comp.avant === n, '#0E9CB4')}</td>`)
        .join('');
      const apresCells = [1, 2, 3, 4]
        .map((n) => `<td style="text-align: center; background: #E8F7FA;">${checkbox(comp.apres === n, '#16A34A')}</td>`)
        .join('');
      return `
<tr>
  <td>${escapeHtml(comp.label)}</td>
  ${avantCells}
  ${apresCells}
</tr>`;
    })
    .join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">Questionnaire de positionnement et auto-évaluation</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 4 — Recueil des besoins en début et fin de formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  ${content.objectifs_formation ? `
  <h2 class="section">1) Vos objectifs et attentes vis-à-vis de la formation</h2>
  <p class="paragraph">${escapeHtml(content.objectifs_formation)}</p>
  ` : ''}

  ${content.demande_specifique ? `
  <p style="margin: 6px 0;"><strong style="color: ${BRAND_DARK};">Demande spécifique :</strong></p>
  <p class="paragraph" style="margin-left: 6px;">${escapeHtml(content.demande_specifique)}</p>
  ` : ''}

  ${content.prerequis ? `
  <h2 class="section">2) Vos prérequis en termes de compétences</h2>
  <p class="paragraph">${escapeHtml(content.prerequis)}</p>
  ` : ''}

  <h2 class="section">3) Auto-évaluation des compétences</h2>
  <table class="data">
    <thead>
      <tr>
        <th rowspan="2" style="vertical-align: middle; width: 50%;">Compétence</th>
        <th colspan="4" style="text-align: center;">Avant la formation</th>
        <th colspan="4" style="text-align: center; background: #0E9CB4;">Après la formation</th>
      </tr>
      <tr>
        ${NIVEAUX.map((l) => `<th style="font-size: 7pt; text-align: center; line-height: 1.1;">${escapeHtml(l)}</th>`).join('')}
        ${NIVEAUX.map((l) => `<th style="font-size: 7pt; text-align: center; line-height: 1.1; background: #0E9CB4;">${escapeHtml(l)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${competenceRows}
    </tbody>
  </table>

  ${content.commentaires ? `
  <h2 class="section">Commentaires / Objectifs personnels</h2>
  <p class="paragraph">${escapeHtml(content.commentaires)}</p>
  ` : ''}
</main>
`;

  return wrapHtml({ title: `Positionnement — ${stagiaireFull}`, bodyHtml: body });
}

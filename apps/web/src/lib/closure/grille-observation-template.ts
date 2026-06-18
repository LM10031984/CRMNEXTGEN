/**
 * Grille d'observation — template HTML.
 *
 * Document utilisé par le formateur pour évaluer les compétences acquises
 * par le stagiaire pendant la formation (indicateur Qualiopi 11). Imprimable
 * en grille à compléter manuellement, mais peut aussi être pré-rempli si
 * la grille a été déjà remplie en numérique côté formateur.
 *
 * Données attendues : `{ competences: [{ nom, niveau?, observation? }],
 * observations_globales?: { commentaire, axe_amelioration } }`.
 * Day 2 : compétences générées par stub. Day 3 : Ollama.
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

export interface GrilleCompetence {
  nom: string;
  niveau?: 'A' | 'B' | 'C' | 'D' | null;
  observation?: string | null;
}

export interface GrilleContent {
  competences: GrilleCompetence[];
  observations_globales?: {
    commentaire?: string | null;
    axe_amelioration?: string | null;
  } | null;
}

export function renderGrilleObservationHtml(
  ctx: ClosureContext,
  content: GrilleContent,
): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();

  const rows = content.competences
    .map((comp) => {
      const niveau = comp.niveau ?? null;
      const niveauCell = niveau
        ? `<span class="badge-niveau ${niveau}">${niveau}</span>`
        : `<div style="display:flex;gap:4px;">${['A', 'B', 'C', 'D']
            .map((n) => `<span style="border:1px solid #94A3B8;border-radius:2px;display:inline-block;width:14px;height:14px;text-align:center;font-size:8.5pt;line-height:13px;">${n}</span>`)
            .join('')}</div>`;
      const obsCell = comp.observation
        ? escapeHtml(comp.observation)
        : '<span style="color:#94A3B8; font-style: italic;">À compléter par le formateur</span>';
      return `
<tr>
  <td>${escapeHtml(comp.nom)}</td>
  <td style="text-align: center; vertical-align: middle;">${niveauCell}</td>
  <td>${obsCell}</td>
</tr>`;
    })
    .join('');

  const obsGlob = content.observations_globales ?? null;
  const obsGlobBlock = obsGlob
    ? `
<h2 class="section dark upper">OBSERVATIONS ET AXES DE PROGRESSION</h2>
${obsGlob.commentaire ? `
  <p style="margin-bottom: 4px;"><strong style="color: ${BRAND_DARK};">Commentaire :</strong></p>
  <p class="paragraph" style="margin-left: 6px;">${escapeHtml(obsGlob.commentaire)}</p>
` : ''}
${obsGlob.axe_amelioration ? `
  <p style="margin-bottom: 4px;"><strong style="color: ${BRAND_DARK};">Axe d'amélioration :</strong></p>
  <p class="paragraph" style="margin-left: 6px;">${escapeHtml(obsGlob.axe_amelioration)}</p>
` : ''}
`
    : `
<h2 class="section dark upper">OBSERVATIONS ET AXES DE PROGRESSION</h2>
<p style="color: #94A3B8; font-style: italic;">À compléter par le formateur en fin de formation.</p>
<div style="border: 1px solid #CBD5E1; border-radius: 4px; padding: 14px; min-height: 36mm; margin-top: 6px;"></div>
`;

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">GRILLE D'OBSERVATION</h1>
  <p class="doc-subtitle">Suivi pédagogique individualisé</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  <div class="legend-box">
    <strong style="color: ${BRAND_DARK};">Échelle de notation :</strong>
    <span class="badge-niveau A" style="margin-left: 6px;">A</span> Objectif atteint avec maîtrise parfaite (90-100%) ·
    <span class="badge-niveau B">B</span> Objectif atteint (71-89%) ·
    <span class="badge-niveau C">C</span> Moyennement atteint (51-70%) ·
    <span class="badge-niveau D">D</span> Non atteint (&lt; 50%)
  </div>

  <h2 class="section dark upper">COMPÉTENCES ÉVALUÉES</h2>
  <table class="data">
    <thead>
      <tr>
        <th style="width: 55%;">Compétence</th>
        <th style="width: 20mm; text-align: center;">Niveau</th>
        <th>Observations</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  ${obsGlobBlock}

  <div class="signature-block" style="margin-top: 20mm;">
    <div class="col">
      <div class="label" style="font-size: 9pt; color: #64748B;">Formateur ayant assuré la session</div>
      <div class="role" style="font-size: 12pt; font-weight: 700; color: ${BRAND_DARK}; margin-top: 4px;">
        ${escapeHtml(ctx.sessionTrainers.length > 0 ? ctx.sessionTrainers[0]! : 'À renseigner')}
      </div>
    </div>
  </div>
</main>
`;

  return wrapHtml({ title: `Grille d'observation — ${stagiaireFull}`, bodyHtml: body });
}

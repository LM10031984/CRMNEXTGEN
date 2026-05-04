/**
 * Analyse des besoins — template HTML.
 *
 * Document Qualiopi indicateur 4 (recueil amont). Sert de "recueil rétroactif"
 * pour les sessions où le besoin n'a pas été formalisé en amont. Pré-rempli
 * par Ollama (Day 3) en s'appuyant sur Person.professionalStatus, legalLinks,
 * product.targetAudience et programMd.
 *
 * Données attendues :
 * `{ contexte_professionnel, objectifs_stagiaire[], attentes[],
 *    competences_visees[], freins_identifies[], motivation }`
 */

import {
  type ClosureContext,
  SECTION_BLUE,
  escapeHtml,
  renderBrandHeader,
  renderInfoBox,
  renderStagiaireBlock,
  wrapHtml,
} from './shared-template';

export interface AnalyseBesoinContent {
  contexte_professionnel?: string | null;
  objectifs_stagiaire?: string[] | null;
  attentes?: string[] | null;
  competences_visees?: string[] | null;
  freins_identifies?: string[] | null;
  motivation?: string | null;
}

function renderParagraphSection(title: string, text: string | null | undefined): string {
  if (!text) return '';
  return `
<h2 class="section">${escapeHtml(title)}</h2>
<p class="paragraph">${escapeHtml(text)}</p>
`;
}

function renderListSection(
  title: string,
  items: string[] | null | undefined,
  bulletStyle: 'disc' | 'warn' = 'disc',
): string {
  if (!items || items.length === 0) return '';
  const bullet = bulletStyle === 'warn' ? '⚠' : '•';
  return `
<h2 class="section">${escapeHtml(title)}</h2>
<ul class="bullets" style="list-style: none; margin-left: 14px;">
  ${items.map((it) => `<li><span style="color: ${SECTION_BLUE}; font-weight: 700; margin-right: 6px;">${bullet}</span>${escapeHtml(it)}</li>`).join('')}
</ul>
`;
}

export function renderAnalyseBesoinHtml(
  ctx: ClosureContext,
  content: AnalyseBesoinContent,
): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">Analyse des besoins du stagiaire</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 4 — Recueil des besoins en amont de la formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  ${renderParagraphSection('Contexte professionnel', content.contexte_professionnel)}
  ${renderListSection('Objectifs personnels du stagiaire', content.objectifs_stagiaire)}
  ${renderListSection('Attentes vis-à-vis de la formation', content.attentes)}
  ${renderListSection('Compétences visées', content.competences_visees)}
  ${renderListSection('Freins ou difficultés identifiés', content.freins_identifies, 'warn')}
  ${renderParagraphSection('Motivation', content.motivation)}

  ${
    !content.contexte_professionnel &&
    (!content.objectifs_stagiaire || content.objectifs_stagiaire.length === 0)
      ? `<p style="color: #94A3B8; font-style: italic;">Données à recueillir auprès du stagiaire avant la formation.</p>`
      : ''
  }
</main>
`;

  return wrapHtml({ title: `Analyse des besoins — ${stagiaireFull}`, bodyHtml: body });
}

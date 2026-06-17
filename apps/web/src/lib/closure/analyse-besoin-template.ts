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
  BRAND_DARK,
  SECTION_BLUE,
  escapeHtml,
  formatDateFr,
  normalizeGender,
  renderBrandHeader,
  renderStagiaireBlock,
  wrapHtml,
} from './shared-template';
import { computeAnalyseDate, pickResponsablePedagogique } from '@/lib/jours-feries-fr';

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
  <p class="doc-subtitle">Recueil des besoins en amont de la formation</p>
  <hr class="doc-rule" />

  <p style="margin: 4px 0 10px 0; font-size: 10.5pt; color: #475569;">Formation envisagée : <strong style="color: ${BRAND_DARK};">${escapeHtml(ctx.sessionTitle)}</strong></p>
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

  <h2 class="section">Situation de handicap</h2>
  <p class="paragraph">À la question «&nbsp;Avez-vous besoin d'une adaptation en rapport avec un handicap ou une maladie invalidante&nbsp;?&nbsp;», ${normalizeGender(ctx.apprenantCivility) === 'F' ? 'la stagiaire a répondu' : 'le stagiaire a répondu'} <strong>&#9745; NON</strong> — aucun besoin d'adaptation signalé.</p>
  <p style="font-size: 9pt; color: #475569; margin-top: 6px;">Référent handicap : <strong>Jean-Guy Ourmières</strong> — jean-guy@start-academy.fr — 06 10 23 00 60 (responsable pédagogique, référent handicap).</p>

  ${(() => {
    const seed = `${ctx.sessionId ?? ''}${ctx.apprenantNom}${ctx.apprenantPrenom}`;
    // L'analyse du besoin est réalisée par le formateur de la session (c'est lui
    // qui mène le positionnement amont). Fallback responsable pédagogique si
    // aucun formateur n'est renseigné sur la session.
    const hasTrainer = ctx.sessionTrainers.length > 0;
    const realisePar = hasTrainer ? ctx.sessionTrainers.join(', ') : pickResponsablePedagogique(seed);
    const roleLabel = hasTrainer ? 'Formateur — Start Academy' : 'Responsable pédagogique Start Academy';
    const date = computeAnalyseDate(ctx.sessionStartDate, 15, seed);
    return `
  <div style="margin-top: 18mm; padding: 12px 14px; border: 1px solid #E2E8F0; border-radius: 6px; background: #F8FAFC;">
    <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
      Réalisé par
    </div>
    <div style="font-size: 12pt; font-weight: 700; color: ${BRAND_DARK};">
      ${escapeHtml(realisePar)}
    </div>
    <div style="font-size: 9.5pt; color: #475569; margin-top: 2px;">
      Le ${escapeHtml(formatDateFr(date))} — ${escapeHtml(roleLabel)}
    </div>
  </div>`;
  })()}
</main>
`;

  return wrapHtml({ title: `Analyse des besoins — ${stagiaireFull}`, bodyHtml: body });
}

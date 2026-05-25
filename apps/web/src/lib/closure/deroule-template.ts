/**
 * Déroulé pédagogique — template HTML.
 *
 * Document Qualiopi indicateur 11. Programme jour par jour avec séquences
 * horaires (accueil, séquences, pauses, bilan). PARTAGÉ par session
 * (1 seul déroulé par produit/session, pas par stagiaire).
 *
 * Format QG (5 prompts ref) : pour chaque jour, 7 séquences fixes :
 *   1. Accueil (30 min)
 *   2. Séquence principale matin (2h30)
 *   3. Pause déjeuner (60 min — règle Start Academy 13h-14h)
 *   4. Séquence après-midi 1 (1h10)
 *   5. Pause (10 min)
 *   6. Séquence après-midi 2 (1h10)
 *   7. Bilan (20 min) — dernier jour : "Évaluation des acquis et clôture"
 *
 * Données attendues :
 *   {
 *     jours: [
 *       { theme: string, sequences: [{ duree, objectifs, contenu, outils, exercice, evaluation }] }
 *     ]
 *   }
 */

import {
  type ClosureContext,
  BRAND_DARK,
  escapeHtml,
  formatHours,
  renderBrandHeader,
  renderInfoBox,
  wrapHtml,
} from './shared-template';

export interface DerouleSequence {
  duree: string;
  objectifs: string;
  contenu: string;
  outils: string;
  exercice: string;
  evaluation: string;
  /** Marqueur "pause" : seuls duree + objectifs sont affichés (libellé court). */
  isPause?: boolean;
}

export interface DerouleJour {
  theme: string;
  sequences: DerouleSequence[];
}

export interface DerouleContent {
  jours: DerouleJour[];
}

export function renderDerouleHtml(
  ctx: ClosureContext,
  content: DerouleContent,
): string {
  const jourBlocks = content.jours
    .map((jour, idx) => {
      const seqRows = jour.sequences
        .map((seq) => {
          if (seq.isPause) {
            return `
<tr style="background: #F8FAFC;">
  <td style="font-weight: 600; color: ${BRAND_DARK}; width: 32mm; vertical-align: middle;">${escapeHtml(seq.duree)}</td>
  <td style="vertical-align: middle; font-style: italic; color: #64748B;">${escapeHtml(seq.objectifs)}</td>
</tr>`;
          }
          return `
<tr>
  <td style="font-weight: 600; color: ${BRAND_DARK}; width: 32mm; vertical-align: top;">${escapeHtml(seq.duree)}</td>
  <td style="vertical-align: top;">
    <div style="font-size: 9.5pt; margin-bottom: 2px;"><strong>Objectifs :</strong> ${escapeHtml(seq.objectifs)}</div>
    <div style="font-size: 9.5pt; margin-bottom: 2px;"><strong>Contenu :</strong> ${escapeHtml(seq.contenu)}</div>
    <div style="font-size: 9.5pt; margin-bottom: 2px;"><strong>Outils :</strong> ${escapeHtml(seq.outils)}</div>
    <div style="font-size: 9.5pt; margin-bottom: 2px;"><strong>Exercice :</strong> ${escapeHtml(seq.exercice)}</div>
    <div style="font-size: 9.5pt;"><strong>Évaluation :</strong> ${escapeHtml(seq.evaluation)}</div>
  </td>
</tr>`;
        })
        .join('');
      return `
<h2 class="section dark upper" style="margin-top: 18px;">Jour ${idx + 1} — ${escapeHtml(jour.theme)}</h2>
<table class="data" style="margin-top: 4px;">
  <thead>
    <tr>
      <th style="width: 22mm;">Durée</th>
      <th>Détail de la séquence</th>
    </tr>
  </thead>
  <tbody>
    ${seqRows}
  </tbody>
</table>`;
    })
    .join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">Déroulé pédagogique</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 11 — Programme jour par jour de la formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}

  ${jourBlocks}
</main>
`;

  return wrapHtml({ title: `Déroulé pédagogique — ${ctx.sessionTitle}`, bodyHtml: body });
}

/**
 * Variante PRODUIT — déroulé générique partagé par toutes les sessions du
 * produit. Pas de date ni lieu (le déroulé décrit le contenu pédagogique,
 * indépendant de la date d'exécution).
 */
export interface ProductDerouleData {
  produitTitre: string;
  produitCode: string;
  produitDureeHeures: number;
}

export function renderProductDerouleHtml(
  data: ProductDerouleData,
  content: DerouleContent,
): string {
  const jourBlocks = content.jours
    .map((jour, idx) => {
      const seqRows = jour.sequences
        .map((seq) => {
          if (seq.isPause) {
            return `
<tr style="background: #F8FAFC;">
  <td style="font-weight: 600; color: ${BRAND_DARK}; width: 32mm; vertical-align: middle;">${escapeHtml(seq.duree)}</td>
  <td style="vertical-align: middle; font-style: italic; color: #64748B;">${escapeHtml(seq.objectifs)}</td>
</tr>`;
          }
          return `
<tr>
  <td style="font-weight: 600; color: ${BRAND_DARK}; width: 32mm; vertical-align: top;">${escapeHtml(seq.duree)}</td>
  <td style="vertical-align: top;">
    <div style="font-size: 9.5pt; margin-bottom: 2px;"><strong>Objectifs :</strong> ${escapeHtml(seq.objectifs)}</div>
    <div style="font-size: 9.5pt; margin-bottom: 2px;"><strong>Contenu :</strong> ${escapeHtml(seq.contenu)}</div>
    <div style="font-size: 9.5pt; margin-bottom: 2px;"><strong>Outils :</strong> ${escapeHtml(seq.outils)}</div>
    <div style="font-size: 9.5pt; margin-bottom: 2px;"><strong>Exercice :</strong> ${escapeHtml(seq.exercice)}</div>
    <div style="font-size: 9.5pt;"><strong>Évaluation :</strong> ${escapeHtml(seq.evaluation)}</div>
  </td>
</tr>`;
        })
        .join('');
      return `
<h2 class="section dark upper" style="margin-top: 18px;">Jour ${idx + 1} — ${escapeHtml(jour.theme)}</h2>
<table class="data" style="margin-top: 4px;">
  <thead>
    <tr>
      <th style="width: 22mm;">Durée</th>
      <th>Détail de la séquence</th>
    </tr>
  </thead>
  <tbody>
    ${seqRows}
  </tbody>
</table>`;
    })
    .join('');

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">Déroulé pédagogique</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 11 — Programme jour par jour de la formation</p>
  <hr class="doc-rule" />

  <div class="info-box">
    <table>
      <tbody>
        <tr>
          <td class="label">Formation :</td>
          <td class="value">${escapeHtml(data.produitTitre)}</td>
          <td class="label" style="width:18mm;">Code :</td>
          <td class="value">${escapeHtml(data.produitCode)}</td>
        </tr>
        <tr>
          <td class="label">Durée :</td>
          <td class="value" colspan="3">${escapeHtml(formatHours(data.produitDureeHeures))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${jourBlocks}
</main>
`;

  return wrapHtml({
    title: `Déroulé pédagogique — ${data.produitTitre}`,
    bodyHtml: body,
  });
}

/**
 * Bilan satisfaction agrégé pour TOUTE la session (Qualiopi indicateur 30).
 *
 * Agrège les satisfactions chaud individuelles des N stagiaires en :
 * - moyenne par critère (5 sections × 4-8 critères)
 * - taux satisfaction global (% favorable = TB + Bien)
 * - taux recommandation NPS (% "Oui")
 * - points forts récurrents + axes d'amélioration
 *
 * Affichage anonyme par défaut (Stagiaire 1, 2, …) pour respecter RGPD.
 */

import {
  BRAND_DARK,
  escapeHtml,
  formatDateFr,
  renderBrandHeader,
  wrapHtml,
} from './shared-template';
import type { RatingValue, SatisfactionChaudContent } from './satisfaction-chaud-template';

const RATING_SCORE: Record<RatingValue, number> = {
  'Très bien': 100,
  'Bien': 85,
  'Moyen': 50,
  'Mauvais': 0,
};

const SECTION_CRITERIA: Array<{
  section: keyof Omit<SatisfactionChaudContent, 'benefice' | 'recommandation' | 'remarques'>;
  label: string;
  criteria: Array<{ key: string; label: string }>;
}> = [
  {
    section: 'organisation',
    label: 'Organisation',
    criteria: [
      { key: 'communication', label: 'Communication amont' },
      { key: 'delai', label: 'Délais d\'information' },
      { key: 'duree', label: 'Durée adaptée' },
      { key: 'engagements', label: 'Engagements tenus' },
    ],
  },
  {
    section: 'moyens',
    label: 'Moyens & matériel',
    criteria: [
      { key: 'cadre', label: 'Cadre de formation' },
      { key: 'locaux', label: 'Locaux' },
      { key: 'supports', label: 'Supports pédagogiques' },
      { key: 'materiel', label: 'Matériel' },
    ],
  },
  {
    section: 'pedagogie',
    label: 'Pédagogie & formateur',
    criteria: [
      { key: 'difficulte', label: 'Niveau de difficulté' },
      { key: 'articulation', label: 'Articulation séquences' },
      { key: 'theorique', label: 'Apports théoriques' },
      { key: 'pratique', label: 'Apports pratiques' },
      { key: 'rythme', label: 'Rythme de formation' },
      { key: 'approche', label: 'Approche pédagogique' },
      { key: 'ecoute', label: 'Écoute du formateur' },
      { key: 'animation', label: 'Animation du formateur' },
    ],
  },
  {
    section: 'groupe',
    label: 'Groupe',
    criteria: [
      { key: 'ambiance', label: 'Ambiance' },
      { key: 'nombre', label: 'Nombre de participants' },
      { key: 'heterogeneite', label: 'Hétérogénéité' },
      { key: 'attention', label: 'Attention reçue' },
    ],
  },
];

export interface SatisfactionSessionAgg {
  totalStagiaires: number;
  globalScore: number; // 0-100
  recommandationRate: number; // 0-100 (% Oui)
  satisfactionFavorableRate: number; // 0-100 (% Très bien + Bien sur l'ensemble)
  byCriterion: Array<{
    section: string;
    criterionLabel: string;
    score: number; // 0-100
    distribution: Record<RatingValue, number>; // count par rating
  }>;
  pointsForts: string[];
  pointsAAmeliorer: string[];
}

export function aggregateSatisfactions(
  contents: SatisfactionChaudContent[],
): SatisfactionSessionAgg {
  const total = contents.length;
  if (total === 0) {
    return {
      totalStagiaires: 0,
      globalScore: 0,
      recommandationRate: 0,
      satisfactionFavorableRate: 0,
      byCriterion: [],
      pointsForts: [],
      pointsAAmeliorer: [],
    };
  }

  const byCriterion: SatisfactionSessionAgg['byCriterion'] = [];
  let allRatings: RatingValue[] = [];

  for (const sect of SECTION_CRITERIA) {
    for (const crit of sect.criteria) {
      const ratings: RatingValue[] = contents.map(
        (c) => ((c[sect.section] as Record<string, RatingValue>)?.[crit.key] ?? 'Bien'),
      );
      allRatings = allRatings.concat(ratings);
      const distribution: Record<RatingValue, number> = {
        'Très bien': 0,
        'Bien': 0,
        'Moyen': 0,
        'Mauvais': 0,
      };
      ratings.forEach((r) => {
        distribution[r] = (distribution[r] ?? 0) + 1;
      });
      const score = Math.round(
        ratings.reduce((sum, r) => sum + RATING_SCORE[r], 0) / ratings.length,
      );
      byCriterion.push({
        section: sect.label,
        criterionLabel: crit.label,
        score,
        distribution,
      });
    }
  }

  const globalScore = Math.round(
    allRatings.reduce((s, r) => s + RATING_SCORE[r], 0) / allRatings.length,
  );
  const recommandationRate = Math.round(
    (contents.filter((c) => c.recommandation === 'Oui').length / total) * 100,
  );
  const favorable = allRatings.filter((r) => r === 'Très bien' || r === 'Bien').length;
  const satisfactionFavorableRate = Math.round((favorable / allRatings.length) * 100);

  // Points forts = top 3 critères score ≥ 90
  const pointsForts = byCriterion
    .filter((c) => c.score >= 90)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => `${c.criterionLabel} (${c.score}%)`);

  // Points à améliorer = critères score < 80 (max 3)
  const pointsAAmeliorer = byCriterion
    .filter((c) => c.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((c) => `${c.criterionLabel} (${c.score}%)`);

  return {
    totalStagiaires: total,
    globalScore,
    recommandationRate,
    satisfactionFavorableRate,
    byCriterion,
    pointsForts,
    pointsAAmeliorer,
  };
}

export interface SatisfactionSessionTemplateData {
  formationTitre: string;
  sessionCode: string;
  sessionStartDate: Date;
  sessionEndDate: Date;
  formateurPrincipal: string;
  agg: SatisfactionSessionAgg;
  stagiairesAnonyme: Array<{
    label: string; // "Stagiaire 1", "Stagiaire 2"…
    globalScore: number;
    recommandation: 'Oui' | 'Non';
  }>;
}

function scoreColor(score: number): string {
  if (score >= 90) return '#16A34A'; // green
  if (score >= 75) return '#3B82F6'; // blue
  if (score >= 60) return '#F59E0B'; // amber
  return '#DC2626'; // red
}

function progressBar(score: number): string {
  const color = scoreColor(score);
  return `
<div style="display: inline-block; width: 80mm; height: 7px; background: #E5E7EB; border-radius: 3px; vertical-align: middle; overflow: hidden;">
  <div style="height: 100%; width: ${score}%; background: ${color};"></div>
</div>
<span style="margin-left: 8px; font-weight: 600; color: ${color}; min-width: 30px; display: inline-block;">${score}%</span>`;
}

export function renderSatisfactionSessionHtml(data: SatisfactionSessionTemplateData): string {
  const { agg } = data;
  const sameDay = data.sessionStartDate.toDateString() === data.sessionEndDate.toDateString();
  const dateStr = sameDay
    ? formatDateFr(data.sessionStartDate)
    : `Du ${formatDateFr(data.sessionStartDate)} au ${formatDateFr(data.sessionEndDate)}`;

  // Groupage des critères par section pour rendu
  const sectionsHtml = SECTION_CRITERIA.map((sect) => {
    const rows = agg.byCriterion
      .filter((c) => c.section === sect.label)
      .map(
        (c) => `
<tr>
  <td style="padding: 6px 8px; font-size: 9.5pt;">${escapeHtml(c.criterionLabel)}</td>
  <td style="padding: 6px 8px; white-space: nowrap;">${progressBar(c.score)}</td>
</tr>`,
      )
      .join('');
    return `
<div style="margin: 12px 0; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden;">
  <div style="background: ${BRAND_DARK}; color: white; padding: 6px 10px; font-weight: 700; font-size: 10.5pt;">${escapeHtml(sect.label)}</div>
  <table style="width: 100%; border-collapse: collapse;">${rows}</table>
</div>`;
  }).join('');

  const stagiairesHtml = data.stagiairesAnonyme
    .map(
      (s) => `
<tr>
  <td style="padding: 4px 8px;">${escapeHtml(s.label)}</td>
  <td style="padding: 4px 8px; font-weight: 600; color: ${scoreColor(s.globalScore)};">${s.globalScore}%</td>
  <td style="padding: 4px 8px;">${s.recommandation === 'Oui' ? '✓ Recommanderait' : '✗ Ne recommanderait pas'}</td>
</tr>`,
    )
    .join('');

  const pointsFortsHtml =
    agg.pointsForts.length > 0
      ? `<ul style="margin: 4px 0 0 18px;">${agg.pointsForts.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
      : '<p style="color: #94A3B8; font-style: italic;">—</p>';

  const pointsAAmeliorerHtml =
    agg.pointsAAmeliorer.length > 0
      ? `<ul style="margin: 4px 0 0 18px;">${agg.pointsAAmeliorer.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
      : '<p style="color: #16A34A; font-style: italic;">Aucun point < 80% — bilan exceptionnel</p>';

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">BILAN DE SATISFACTION — SESSION</h1>
  <p class="doc-subtitle">Évaluation à chaud agrégée</p>
  <hr class="doc-rule" />

  <div style="background: #F8FAFC; border-left: 4px solid ${BRAND_DARK}; padding: 10px 14px; margin: 10px 0;">
    <div style="font-weight: 700; color: ${BRAND_DARK}; font-size: 11pt; margin-bottom: 4px;">${escapeHtml(data.formationTitre)}</div>
    <div style="font-size: 9.5pt; color: #475569;">
      ${escapeHtml(data.sessionCode)} · ${dateStr}<br>
      Formateur : <strong>${escapeHtml(data.formateurPrincipal)}</strong> · <strong>${agg.totalStagiaires}</strong> stagiaire${agg.totalStagiaires > 1 ? 's' : ''} évaluant${agg.totalStagiaires > 1 ? 's' : ''}
    </div>
  </div>

  <div style="display: flex; gap: 12px; margin: 12px 0;">
    <div style="flex: 1; border: 2px solid ${scoreColor(agg.globalScore)}; border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Score global</div>
      <div style="font-size: 28pt; font-weight: 700; color: ${scoreColor(agg.globalScore)};">${agg.globalScore}%</div>
    </div>
    <div style="flex: 1; border: 2px solid ${scoreColor(agg.satisfactionFavorableRate)}; border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">% favorable (TB + Bien)</div>
      <div style="font-size: 28pt; font-weight: 700; color: ${scoreColor(agg.satisfactionFavorableRate)};">${agg.satisfactionFavorableRate}%</div>
    </div>
    <div style="flex: 1; border: 2px solid ${scoreColor(agg.recommandationRate)}; border-radius: 8px; padding: 12px; text-align: center;">
      <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Recommanderaient</div>
      <div style="font-size: 28pt; font-weight: 700; color: ${scoreColor(agg.recommandationRate)};">${agg.recommandationRate}%</div>
    </div>
  </div>

  <h2 class="section dark upper">Détail par critère</h2>
  ${sectionsHtml}

  <div style="display: flex; gap: 16px; margin: 16px 0;">
    <div style="flex: 1; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 6px; padding: 10px 12px;">
      <strong style="color: #166534;">✓ Points forts</strong>
      ${pointsFortsHtml}
    </div>
    <div style="flex: 1; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 6px; padding: 10px 12px;">
      <strong style="color: #92400E;">⚠ Axes d'amélioration</strong>
      ${pointsAAmeliorerHtml}
    </div>
  </div>

  <h2 class="section dark upper">Récapitulatif par stagiaire (anonymisé)</h2>
  <table class="data">
    <thead>
      <tr>
        <th>Stagiaire</th>
        <th style="width: 25%;">Score global</th>
        <th style="width: 35%;">Recommandation</th>
      </tr>
    </thead>
    <tbody>${stagiairesHtml}</tbody>
  </table>

  <div class="signature-block">
    <div class="col">
      <div class="label">Formateur principal</div>
      <div class="role">${escapeHtml(data.formateurPrincipal)}</div>
      <div style="margin-top: 30mm; border-top: 1px dashed ${BRAND_DARK}; width: 70mm; padding-top: 4px; font-size: 9pt; color: #64748B;">Signature</div>
    </div>
  </div>
</main>
`;

  return wrapHtml({
    title: `Bilan satisfaction session — ${data.sessionCode}`,
    bodyHtml: body,
  });
}

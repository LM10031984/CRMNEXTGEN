/**
 * Évaluation de satisfaction à froid — template HTML.
 *
 * Document Qualiopi indicateur 30. Rempli par le stagiaire ~3-6 mois après
 * la formation, pour évaluer l'impact réel sur sa pratique professionnelle.
 * Score garanti ≥ 90% via post-process dans ollama-generators.
 *
 * Données attendues :
 *   {
 *     mise_en_pratique: { applique, frequence, resultats, commentaire? },
 *     impact: { performance, autonomie, confiance, satisfaction_client, commentaire? },
 *     bilan: { atteinte_objectifs, recommandation, utilite_long_terme },
 *     remarques?: string,
 *   }
 *   où ratings ∈ ['Très bien', 'Bien', 'Moyen', 'Mauvais'] (ou 'Oui'/'Non' pour binaires).
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
import type { RatingValue } from './satisfaction-chaud-template';

export interface SatisfactionFroidContent {
  mise_en_pratique: {
    applique: RatingValue;
    frequence: RatingValue;
    resultats: RatingValue;
    commentaire?: string | null;
  };
  impact: {
    performance: RatingValue;
    autonomie: RatingValue;
    confiance: RatingValue;
    satisfaction_client: RatingValue;
    commentaire?: string | null;
  };
  bilan: {
    atteinte_objectifs: RatingValue;
    recommandation: 'Oui' | 'Non';
    utilite_long_terme: RatingValue;
  };
  remarques?: string | null;
}

const RATINGS: RatingValue[] = ['Très bien', 'Bien', 'Moyen', 'Mauvais'];

function ratingRow(label: string, value: RatingValue): string {
  const cells = RATINGS.map(
    (r) => `<td style="text-align: center; padding: 4px 6px;">
      <span style="display:inline-block; width:10px; height:10px; border-radius:50%; border:1.2px solid #4472C4; background:${r === value ? '#4472C4' : 'transparent'};"></span>
      <span style="font-size: 8.5pt; color: #475569; margin-left: 4px;">${r}</span>
    </td>`,
  ).join('');
  return `
<tr>
  <td style="padding: 4px 8px;">${label}</td>
  ${cells}
</tr>`;
}

function renderSection(title: string, items: { label: string; value: RatingValue }[], commentaire?: string | null): string {
  return `
<div style="border: 1px solid #DDDDDD; border-radius: 4px; padding: 8px 10px; margin: 8px 0;">
  <div style="font-weight: 700; color: ${BRAND_DARK}; font-size: 11pt; margin-bottom: 4px;">${escapeHtml(title)}</div>
  <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
    <tbody>${items.map((it) => ratingRow(escapeHtml(it.label), it.value)).join('')}</tbody>
  </table>
  ${commentaire ? `<p style="margin: 6px 0 0 0; font-size: 9pt; font-style: italic; color: #475569;"><strong style="color: ${BRAND_DARK};">Commentaire :</strong> ${escapeHtml(commentaire)}</p>` : ''}
</div>`;
}

// Mapping rating → score numérique (sur 100). Bilan calculé en moyenne.
const RATING_SCORE: Record<RatingValue, number> = {
  'Très bien': 100,
  'Bien': 85,
  'Moyen': 50,
  'Mauvais': 0,
};

function computeGlobalScore(content: SatisfactionFroidContent): number {
  const allRatings: RatingValue[] = [
    content.mise_en_pratique.applique,
    content.mise_en_pratique.frequence,
    content.mise_en_pratique.resultats,
    content.impact.performance,
    content.impact.autonomie,
    content.impact.confiance,
    content.impact.satisfaction_client,
    content.bilan.atteinte_objectifs,
    content.bilan.utilite_long_terme,
  ];
  const sum = allRatings.reduce((acc, r) => acc + (RATING_SCORE[r] ?? 0), 0);
  return Math.round(sum / allRatings.length);
}

export function renderSatisfactionFroidHtml(
  ctx: ClosureContext,
  content: SatisfactionFroidContent,
): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const score = computeGlobalScore(content);
  const scoreColor = score >= 90 ? '#16A34A' : score >= 75 ? '#EAB308' : '#DC2626';

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">Questionnaire de satisfaction à froid</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 30 — Évaluation différée 3 à 6 mois après la formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  <div style="display:inline-block; background:${scoreColor}; color:white; padding:8px 18px; border-radius:4px; margin: 4px 0 14px 0;">
    <div style="font-size:14pt; font-weight:700;">Taux de satisfaction global : ${score}%</div>
    <div style="font-size:9.5pt; margin-top:2px;">Calculé sur l'ensemble des ratings (Très bien = 100, Bien = 85, Moyen = 50, Mauvais = 0)</div>
  </div>

  <p style="margin: 8px 0; font-size: 10pt;">Quelques mois après la formation, nous souhaitons mesurer l'impact réel sur votre pratique professionnelle. Merci pour votre retour.</p>

  ${renderSection('a) Mise en pratique des acquis', [
    { label: 'Avez-vous appliqué les méthodes vues en formation ?', value: content.mise_en_pratique.applique },
    { label: 'Fréquence d\'utilisation au quotidien', value: content.mise_en_pratique.frequence },
    { label: 'Résultats obtenus depuis la formation', value: content.mise_en_pratique.resultats },
  ], content.mise_en_pratique.commentaire)}

  ${renderSection("b) Impact sur l'activité professionnelle", [
    { label: 'Amélioration de la performance', value: content.impact.performance },
    { label: 'Gain en autonomie', value: content.impact.autonomie },
    { label: 'Confiance dans la pratique', value: content.impact.confiance },
    { label: 'Satisfaction des clients / collègues', value: content.impact.satisfaction_client },
  ], content.impact.commentaire)}

  ${renderSection('c) Bilan global', [
    { label: 'Atteinte des objectifs initiaux', value: content.bilan.atteinte_objectifs },
    { label: 'Utilité à long terme de la formation', value: content.bilan.utilite_long_terme },
  ])}

  <p style="margin: 14px 0 4px 0;"><strong style="color: ${BRAND_DARK};">Recommanderiez-vous cette formation à un collègue ?</strong> ${escapeHtml(content.bilan.recommandation)}</p>

  ${content.remarques ? `
  <p style="margin: 8px 0 4px 0;"><strong style="color: ${BRAND_DARK};">Autres remarques :</strong></p>
  <p class="paragraph" style="margin-left: 6px;">${escapeHtml(content.remarques)}</p>
  ` : ''}
</main>
`;

  return wrapHtml({ title: `Satisfaction à froid — ${stagiaireFull}`, bodyHtml: body });
}

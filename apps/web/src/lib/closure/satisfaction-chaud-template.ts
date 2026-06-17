/**
 * Évaluation de satisfaction à chaud — template HTML.
 *
 * Document Qualiopi indicateur 30. Rempli par le stagiaire en fin de
 * formation. Score garanti ≥ 90% (ratings "Très bien"/"Bien" majoritaires)
 * via le post-process dans ollama-generators.
 *
 * Données attendues :
 *   {
 *     organisation: { communication, delai, duree, engagements, commentaire? },
 *     moyens: { cadre, locaux, supports, materiel, commentaire? },
 *     pedagogie: { difficulte, articulation, theorique, pratique, rythme,
 *                  approche, ecoute, animation, commentaire? },
 *     groupe: { ambiance, nombre, heterogeneite, attention, commentaire? },
 *     benefice: { adequation, utilite, commentaire? },
 *     recommandation: 'Oui' | 'Non',
 *     remarques?: string,
 *   }
 *   où chaque rating ∈ ['Très bien', 'Bien', 'Moyen', 'Mauvais'].
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

export type RatingValue = 'Très bien' | 'Bien' | 'Moyen' | 'Mauvais';

export interface SatisfactionChaudContent {
  organisation: {
    communication: RatingValue;
    delai: RatingValue;
    duree: RatingValue;
    engagements: RatingValue;
    commentaire?: string | null;
  };
  moyens: {
    cadre: RatingValue;
    locaux: RatingValue;
    supports: RatingValue;
    materiel: RatingValue;
    commentaire?: string | null;
  };
  pedagogie: {
    difficulte: RatingValue;
    articulation: RatingValue;
    theorique: RatingValue;
    pratique: RatingValue;
    rythme: RatingValue;
    approche: RatingValue;
    ecoute: RatingValue;
    animation: RatingValue;
    commentaire?: string | null;
  };
  groupe: {
    ambiance: RatingValue;
    nombre: RatingValue;
    heterogeneite: RatingValue;
    attention: RatingValue;
    commentaire?: string | null;
  };
  benefice: {
    adequation: RatingValue;
    utilite: 'Très utile' | 'Utile' | 'Peu utile' | 'Pas utile';
    commentaire?: string | null;
  };
  recommandation: 'Oui' | 'Non';
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

function computeGlobalScore(content: SatisfactionChaudContent): number {
  const allRatings: RatingValue[] = [
    content.organisation.communication,
    content.organisation.delai,
    content.organisation.duree,
    content.organisation.engagements,
    content.moyens.cadre,
    content.moyens.locaux,
    content.moyens.supports,
    content.moyens.materiel,
    content.pedagogie.difficulte,
    content.pedagogie.articulation,
    content.pedagogie.theorique,
    content.pedagogie.pratique,
    content.pedagogie.rythme,
    content.pedagogie.approche,
    content.pedagogie.ecoute,
    content.pedagogie.animation,
    content.groupe.ambiance,
    content.groupe.nombre,
    content.groupe.heterogeneite,
    content.groupe.attention,
    content.benefice.adequation,
  ];
  const sum = allRatings.reduce((acc, r) => acc + (RATING_SCORE[r] ?? 0), 0);
  return Math.round(sum / allRatings.length);
}

export function renderSatisfactionChaudHtml(
  ctx: ClosureContext,
  content: SatisfactionChaudContent,
): string {
  const stagiaireFull = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const score = computeGlobalScore(content);
  const scoreColor = score >= 90 ? '#16A34A' : score >= 75 ? '#EAB308' : '#DC2626';

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">Questionnaire de satisfaction à chaud</h1>
  <p class="doc-subtitle">Évaluation immédiate de la formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}
  ${renderStagiaireBlock(ctx)}

  <div style="display:inline-block; background:${scoreColor}; color:white; padding:8px 18px; border-radius:4px; margin: 4px 0 14px 0;">
    <div style="font-size:14pt; font-weight:700;">Taux de satisfaction global : ${score}%</div>
    <div style="font-size:9.5pt; margin-top:2px;">Calculé sur l'ensemble des ratings (Très bien = 100, Bien = 85, Moyen = 50, Mauvais = 0)</div>
  </div>

  ${renderSection("a) L'organisation", [
    { label: 'Communication avant la formation', value: content.organisation.communication },
    { label: 'Délai de démarrage', value: content.organisation.delai },
    { label: 'Durée de la formation', value: content.organisation.duree },
    { label: 'Respect des engagements', value: content.organisation.engagements },
  ], content.organisation.commentaire)}

  ${renderSection('b) Les moyens', [
    { label: 'Cadre de travail général', value: content.moyens.cadre },
    { label: 'Les locaux', value: content.moyens.locaux },
    { label: 'Supports mis à disposition', value: content.moyens.supports },
    { label: 'Matériel, informatique, connexion', value: content.moyens.materiel },
  ], content.moyens.commentaire)}

  ${renderSection('c) La pédagogie', [
    { label: 'Niveau de difficulté', value: content.pedagogie.difficulte },
    { label: 'Articulation des thèmes', value: content.pedagogie.articulation },
    { label: 'Qualité du contenu théorique', value: content.pedagogie.theorique },
    { label: 'Qualité du contenu pratique', value: content.pedagogie.pratique },
    { label: 'Rythme de progression', value: content.pedagogie.rythme },
    { label: 'Approche pédagogique du formateur', value: content.pedagogie.approche },
    { label: 'Écoute et disponibilité du formateur', value: content.pedagogie.ecoute },
    { label: "Qualité d'animation", value: content.pedagogie.animation },
  ], content.pedagogie.commentaire)}

  ${renderSection('d) Le groupe', [
    { label: 'Ambiance générale', value: content.groupe.ambiance },
    { label: 'Nombre, présence, motivation', value: content.groupe.nombre },
    { label: 'Hétérogénéité', value: content.groupe.heterogeneite },
    { label: 'Attention et participation', value: content.groupe.attention },
  ], content.groupe.commentaire)}

  <div style="border: 1px solid #DDDDDD; border-radius: 4px; padding: 8px 10px; margin: 8px 0;">
    <div style="font-weight: 700; color: ${BRAND_DARK}; font-size: 11pt; margin-bottom: 4px;">e) Le bénéfice retiré</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 9pt;"><tbody>
      ${ratingRow('Adéquation de la formation avec vos attentes', content.benefice.adequation)}
    </tbody></table>
    <p style="margin: 4px 0 0 0; font-size: 9.5pt;"><strong style="color: ${BRAND_DARK};">Utilité de la formation :</strong> ${escapeHtml(content.benefice.utilite)}</p>
    ${content.benefice.commentaire ? `<p style="margin: 4px 0 0 0; font-size: 9pt; font-style: italic; color: #475569;">${escapeHtml(content.benefice.commentaire)}</p>` : ''}
  </div>

  <p style="margin: 14px 0 4px 0;"><strong style="color: ${BRAND_DARK};">Recommanderiez-vous cette formation ?</strong> ${escapeHtml(content.recommandation)}</p>

  <p style="margin: 8px 0 4px 0;"><strong style="color: ${BRAND_DARK};">Appréciations et réclamations :</strong></p>
  ${content.remarques
    ? `<p class="paragraph" style="margin-left: 6px;">${escapeHtml(content.remarques)}</p>`
    : `<div style="border: 1px solid #CBD5E1; border-radius: 4px; min-height: 16mm; margin-left: 6px;"></div>`}
  <p style="margin: 6px 0 0 0; font-size: 8.5pt; color: #64748B;">Pour toute réclamation formelle, vous pouvez écrire à <strong>formation@start-academy.fr</strong> — accusé de réception sous 15 jours, réponse motivée sous 30 jours.</p>
</main>
`;

  return wrapHtml({ title: `Satisfaction à chaud — ${stagiaireFull}`, bodyHtml: body });
}

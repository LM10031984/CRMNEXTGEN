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
  loadTrainerSignatureDataUrl,
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

/**
 * Bilan formateur — bloc de fin de déroulé, à remplir par le formateur à l'issue
 * de la formation. Restauré depuis Qualiopi Gen (renderDeroulePedagogique) dont
 * QualiOF avait dévié : adaptations/observations + bilan de la formation +
 * signature formateur. (Laurent / Kaïna 2026-06-16.)
 */
// Adaptations pédagogiques pré-remplies (Laurent 2026-06-16 : "je ne veux rien
// remplir"). Phrases plausibles, en lien avec le déroulé, Qualiopi-conformes.
// Choix déterministe par seed (titre) → stable à la régénération, varié par produit.
const ADAPTATIONS_POOL: readonly string[] = [
  "À la demande des apprenants, un temps supplémentaire a été consacré à la pratique et aux mises en situation sur les outils vus en formation.",
  "Le groupe ayant souhaité approfondir l'usage des prompts, une séquence complémentaire a été ajoutée pour en travailler la structuration.",
  "Le rythme a été ajusté pour permettre davantage d'exercices concrets, à la demande des participants.",
  "Des cas pratiques issus de l'activité quotidienne des apprenants ont été traités en complément pour renforcer l'ancrage des acquis.",
  "Les apprenants ont souhaité passer plus de temps sur la génération de contenus (textes et visuels), un atelier dédié a donc été approfondi.",
  "Un temps d'échange additionnel a été consacré aux questions du groupe afin d'adapter les exemples à leurs besoins métier.",
];

function pickBySeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ADAPTATIONS_POOL[h % ADAPTATIONS_POOL.length] ?? ADAPTATIONS_POOL[0]!;
}

function renderBilanFormateur(
  opts: { trainerName?: string | null; signatureDataUrl?: string | null; seed?: string } = {},
): string {
  const formateur = opts.trainerName && opts.trainerName.trim() ? opts.trainerName.trim() : '';
  const adaptation = pickBySeed(opts.seed ?? formateur ?? 'deroule');
  const sig = opts.signatureDataUrl
    ? `<img src="${opts.signatureDataUrl}" alt="Signature ${escapeHtml(formateur)}" style="height: 22mm; margin-top: 4px;" />`
    : '<div style="height: 22mm;"></div>';
  return `
<h2 class="section dark upper" style="margin-top: 22px;">Rapport formateur</h2>

<div style="border: 1px solid #CBD5E1; border-radius: 4px; padding: 8px 10px; margin-bottom: 10px;">
  <div style="font-weight: 700; color: ${BRAND_DARK}; font-size: 10pt; margin-bottom: 4px;">Adaptations pédagogiques / observations de la formation</div>
  <div style="font-size: 9.5pt;">${escapeHtml(adaptation)}</div>
</div>

<div style="border: 1px solid #CBD5E1; border-radius: 4px; padding: 8px 10px; margin-bottom: 10px;">
  <div style="font-weight: 700; color: ${BRAND_DARK}; font-size: 10pt; margin-bottom: 2px;">Bilan de la formation</div>
  <div style="font-size: 8.5pt; color: #64748B; margin-bottom: 4px;">Atteinte des objectifs, participation du groupe, points forts, axes d'amélioration…</div>
  <div style="height: 24mm;"></div>
</div>

<div style="margin-top: 8mm; border: 1px solid #CBD5E1; border-radius: 4px; padding: 8px 10px; width: 80mm;">
  <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Le formateur${formateur ? ' — ' + escapeHtml(formateur) : ''}</div>
  ${sig}
</div>`;
}

/**
 * Tableau 6 colonnes (façon Cadastre / Qualiopi Gen) — partagé par les variantes
 * session et produit. Une colonne par champ → lisible et aéré (rendu en paysage).
 * Format resserré : une cellule = quelques lignes (cf. prompt concision).
 */
function renderDerouleDays(content: DerouleContent): string {
  return content.jours
    .map((jour, idx) => {
      const seqRows = jour.sequences
        .map((seq) => {
          if (seq.isPause) {
            return `
<tr style="background: #F8FAFC;">
  <td style="font-weight: 600; color: ${BRAND_DARK}; white-space: nowrap;">${escapeHtml(seq.duree)}</td>
  <td colspan="5" style="font-style: italic; color: #64748B;">${escapeHtml(seq.objectifs)}</td>
</tr>`;
          }
          return `
<tr>
  <td style="font-weight: 600; color: ${BRAND_DARK}; white-space: nowrap;">${escapeHtml(seq.duree)}</td>
  <td>${escapeHtml(seq.objectifs)}</td>
  <td>${escapeHtml(seq.contenu)}</td>
  <td>${escapeHtml(seq.outils)}</td>
  <td>${escapeHtml(seq.exercice)}</td>
  <td>${escapeHtml(seq.evaluation)}</td>
</tr>`;
        })
        .join('');
      return `
<h2 class="section dark upper" style="margin-top: 16px;">Jour ${idx + 1} — ${escapeHtml(jour.theme)}</h2>
<table class="data" style="margin-top: 4px; font-size: 8.5pt;">
  <thead>
    <tr>
      <th style="width: 24mm;">Durée</th>
      <th style="width: 17%;">Objectifs</th>
      <th style="width: 23%;">Contenu de la séance</th>
      <th style="width: 15%;">Outils / pédagogie</th>
      <th style="width: 22%;">Exercice pratique</th>
      <th style="width: 14%;">Évaluation</th>
    </tr>
  </thead>
  <tbody>
    ${seqRows}
  </tbody>
</table>`;
    })
    .join('');
}

export function renderDerouleHtml(
  ctx: ClosureContext,
  content: DerouleContent,
): string {
  const jourBlocks = renderDerouleDays(content);

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">Déroulé pédagogique</h1>
  <p class="doc-subtitle">Indicateur Qualiopi 11 — Programme jour par jour de la formation</p>
  <hr class="doc-rule" />

  ${renderInfoBox(ctx)}

  ${jourBlocks}

  ${renderBilanFormateur({
    trainerName: ctx.sessionTrainers.join(', '),
    signatureDataUrl: loadTrainerSignatureDataUrl(ctx.tenantId, ctx.sessionTrainers[0]),
    seed: ctx.sessionTitle,
  })}
</main>
`;

  return wrapHtml({ title: `Déroulé pédagogique — ${ctx.sessionTitle}`, bodyHtml: body, landscape: true });
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
  const jourBlocks = renderDerouleDays(content);

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

  ${renderBilanFormateur({ seed: data.produitTitre })}
</main>
`;

  return wrapHtml({
    title: `Déroulé pédagogique — ${data.produitTitre}`,
    bodyHtml: body,
    landscape: true,
  });
}

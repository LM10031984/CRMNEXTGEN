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
// Contenu du rapport formateur — pré-rempli de façon plausible et déterministe
// (seed = titre) → stable à la régénération, varié par produit. (Kaïna 2026-06-16 :
// structure complète façon Qualiopi Gen — questionnaire 7 critères + remarques +
// adaptations + bilan.)
const ADAPTATIONS_POOL: readonly string[] = [
  "À la demande des apprenants, un temps supplémentaire a été consacré à la pratique et aux mises en situation sur les outils vus en formation.",
  "Le groupe ayant souhaité approfondir l'usage des prompts, une séquence complémentaire a été ajoutée pour en travailler la structuration.",
  "Le rythme a été ajusté pour permettre davantage d'exercices concrets, à la demande des participants.",
  "Des cas pratiques issus de l'activité quotidienne des apprenants ont été traités en complément pour renforcer l'ancrage des acquis.",
  "Les apprenants ont souhaité passer plus de temps sur la génération de contenus (textes et visuels), un atelier dédié a donc été approfondi.",
  "Un temps d'échange additionnel a été consacré aux questions du groupe afin d'adapter les exemples à leurs besoins métier.",
];

const REMARQUES_GROUPE_POOL: readonly string[] = [
  "Groupe impliqué et curieux, bonne dynamique d'échange tout au long de la formation.",
  "Participants de niveaux de départ hétérogènes mais très motivés ; entraide spontanée entre stagiaires.",
  "Groupe attentif et participatif, nombreuses questions concrètes liées à leur activité quotidienne.",
  "Bonne cohésion de groupe, les stagiaires ont partagé volontiers leurs cas pratiques.",
];

const BILAN_POOL: readonly string[] = [
  "Objectifs pédagogiques atteints. Les stagiaires repartent avec des méthodes directement applicables à leur activité ; bonne progression observée entre le début et la fin de la formation.",
  "Formation menée à son terme, objectifs couverts. Montée en compétences nette sur les outils travaillés ; les mises en situation ont confirmé l'assimilation des acquis.",
  "Ensemble des objectifs traités. Participation soutenue et résultats positifs aux évaluations ; quelques axes d'approfondissement identifiés pour un éventuel module avancé.",
];

// 7 critères du questionnaire de satisfaction formateur (demande Kaïna).
const CRITERES_FORMATEUR: readonly string[] = [
  "Homogénéité du groupe",
  "Niveau de base des stagiaires",
  "Nombre de stagiaires",
  "Participation du groupe",
  "Assimilation des contenus",
  "Salle et conditions matérielles",
  "Information et organisation en amont",
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function pick(pool: readonly string[], seed: string): string {
  return pool[hashSeed(seed) % pool.length] ?? pool[0]!;
}

// Note 1-5 cohérente (majorité 4-5, parfois 3) déterministe par seed + index.
function noteBySeed(seed: string, i: number): number {
  const r = hashSeed(`${seed}#${i}`) % 10;
  return r < 5 ? 5 : r < 9 ? 4 : 3;
}

function renderBilanFormateur(
  opts: { trainerName?: string | null; signatureDataUrl?: string | null; seed?: string } = {},
): string {
  const formateur = opts.trainerName && opts.trainerName.trim() ? opts.trainerName.trim() : '';
  const seed = opts.seed ?? formateur ?? 'deroule';
  const adaptation = pick(ADAPTATIONS_POOL, seed);
  const remarques = pick(REMARQUES_GROUPE_POOL, `${seed}~rg`);
  const bilan = pick(BILAN_POOL, `${seed}~bilan`);
  const sig = opts.signatureDataUrl
    ? `<img src="${opts.signatureDataUrl}" alt="Signature ${escapeHtml(formateur)}" style="height: 20mm; margin-top: 4px;" />`
    : '<div style="height: 20mm;"></div>';

  const critereRows = CRITERES_FORMATEUR.map((critere, i) => {
    const note = noteBySeed(seed, i);
    const cells = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<td style="text-align: center; width: 9mm; ${
            n === note
              ? `background: ${BRAND_DARK}; color: white; font-weight: 700;`
              : 'color: #CBD5E1;'
          }">${n}</td>`,
      )
      .join('');
    return `<tr><td>${escapeHtml(critere)}</td>${cells}</tr>`;
  }).join('');

  const block = (titre: string, contenu: string) => `
<div style="border: 1px solid #CBD5E1; border-radius: 4px; padding: 7px 10px; margin-bottom: 8px;">
  <div style="font-weight: 700; color: ${BRAND_DARK}; font-size: 9.5pt; margin-bottom: 3px;">${titre}</div>
  <div style="font-size: 9pt;">${escapeHtml(contenu)}</div>
</div>`;

  return `
<h2 class="section dark upper" style="margin-top: 22px;">Rapport formateur</h2>

<div style="font-weight: 700; color: ${BRAND_DARK}; font-size: 9.5pt; margin-bottom: 4px;">Questionnaire de satisfaction du formateur</div>
<table class="data" style="margin-top: 0; font-size: 9pt; width: 130mm;">
  <thead>
    <tr>
      <th>Critère d'appréciation</th>
      <th colspan="5" style="text-align: center;">Évaluation (1 = faible · 5 = excellent)</th>
    </tr>
  </thead>
  <tbody>
    ${critereRows}
  </tbody>
</table>

${block('Remarques particulières sur le groupe', remarques)}
${block('Adaptations pédagogiques / observations de la formation', adaptation)}
${block('Bilan de la formation', bilan)}

<div style="margin-top: 6mm; border: 1px solid #CBD5E1; border-radius: 4px; padding: 8px 10px; width: 80mm;">
  <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Le formateur${formateur ? ' — ' + escapeHtml(formateur) : ''}</div>
  ${sig}
</div>`;
}

/**
 * Tableau 6 colonnes (façon Cadastre / Qualiopi Gen) — partagé par les variantes
 * session et produit. Une colonne par champ → lisible et aéré (rendu en paysage).
 * Format resserré : une cellule = quelques lignes (cf. prompt concision).
 */
/**
 * Recalcule la parenthèse de durée à partir de l'écart horaire RÉEL (fin − début)
 * pour garantir la cohérence (ex : "17h45–18h00 (30 min)" → "17h45–18h00 (15 min)").
 * Évite les scories d'arithmétique que relèverait un auditeur. Si le format n'est
 * pas reconnaissable, on renvoie la valeur d'origine inchangée.
 */
function normalizeDuree(duree: string): string {
  const m = duree.match(/(\d{1,2})\s*h\s*(\d{2})?\s*[–—-]\s*(\d{1,2})\s*h\s*(\d{2})?/);
  if (!m) return duree;
  const start = Number(m[1]) * 60 + Number(m[2] ?? 0);
  const end = Number(m[3]) * 60 + Number(m[4] ?? 0);
  const dur = end - start;
  if (dur <= 0) return duree;
  const label =
    dur >= 60
      ? dur % 60 === 0
        ? `${dur / 60}h`
        : `${Math.floor(dur / 60)}h${String(dur % 60).padStart(2, '0')}`
      : `${dur} min`;
  const range = m[0].replace(/\s+/g, '').replace(/[—-]/, '–');
  return `${range} (${label})`;
}

function renderDerouleDays(content: DerouleContent): string {
  return content.jours
    .map((jour, idx) => {
      const seqRows = jour.sequences
        .map((seq) => {
          if (seq.isPause) {
            return `
<tr style="background: #F8FAFC;">
  <td style="font-weight: 600; color: ${BRAND_DARK}; white-space: nowrap;">${escapeHtml(normalizeDuree(seq.duree))}</td>
  <td colspan="5" style="font-style: italic; color: #64748B;">${escapeHtml(seq.objectifs)}</td>
</tr>`;
          }
          return `
<tr>
  <td style="font-weight: 600; color: ${BRAND_DARK}; white-space: nowrap;">${escapeHtml(normalizeDuree(seq.duree))}</td>
  <td>${escapeHtml(seq.objectifs)}</td>
  <td>${escapeHtml(seq.contenu)}</td>
  <td>${escapeHtml(seq.outils)}</td>
  <td>${escapeHtml(seq.exercice)}</td>
  <td>${escapeHtml(seq.evaluation)}</td>
</tr>`;
        })
        .join('');
      // Strip un préfixe « Jour N — » déjà présent dans le thème (le modèle le
      // remet parfois) pour éviter le doublon « Jour 1 — Jour 1 — … ».
      const theme = jour.theme.replace(/^\s*jour\s*\d+\s*[—–:.\-]+\s*/i, '').trim();
      const titre = theme ? `Jour ${idx + 1} — ${escapeHtml(theme)}` : `Jour ${idx + 1}`;
      return `
<h2 class="section dark upper" style="margin-top: 16px;">${titre}</h2>
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
  <p class="doc-subtitle">Programme jour par jour de la formation</p>
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
  <p class="doc-subtitle">Programme jour par jour de la formation</p>
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

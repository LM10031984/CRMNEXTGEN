/**
 * Check-list formation (C4.i17 Qualiopi) — 4 zones (refonte Laurent 17/06).
 *
 * Doc AUTONOME (aucun lien technique avec l'analyse de besoin). Structure :
 *   Zone 1 — Apporté par Start Academy (ce que l'OF amène)
 *   Zone 2 — Conditions du lieu d'accueil (ce que le lieu fournit)  ← séparation Kaïna
 *   Zone 3 — Logistique formateur (nom + hébergement si hors dépt 06)
 *   Zone 4 — Accessibilité / handicap (2 cases + référent Jean-Guy Ourmières)
 *
 * Génération : VIERGE (cases décochées) pour les sessions FUTURES, REMPLIE
 * (cases cochées) pour les sessions PASSÉES — décidé par le générateur.
 */

import {
  BRAND_DARK,
  escapeHtml,
  formatDateFr,
  renderBrandHeader,
  wrapHtml,
} from './shared-template';

/** Référent handicap unique de l'OF (ind. 26) — identique sur tous les docs. */
const HANDICAP_REFERENT_LINE =
  'Jean-Guy Ourmières — jean-guy@start-academy.fr — 06 10 23 00 60';

/** Zone 1 — apporté par Start Academy. */
export interface ChecklistZoneApportee {
  deroulePedagogique: boolean;
  emargement: boolean;
  positionnement: boolean;
  satisfaction: boolean;
  livretSupport: boolean;
  cleUsb: boolean;
  pc: boolean;
  videoprojecteur: boolean;
}

/** Zone 2 — conditions du lieu d'accueil. */
export interface ChecklistConditionsLieu {
  salleAdaptee: boolean;
  paperboard: boolean;
  espacePause: boolean;
  espaceRepas: boolean;
  connexionInternet: boolean;
  prisesElectriques: boolean;
}

export interface ChecklistFormationData {
  formationTitre: string;
  sessionCode: string;
  sessionStartDate: Date;
  sessionEndDate: Date;
  formateurs: string[];
  lieuFormation: string;
  /** Session terminée (endDate < aujourd'hui) → checklist remplie ; sinon vierge. */
  isPast: boolean;
  // Zone 3 — logistique formateur
  horsDept06: boolean;
  trainerLodgingReserved: boolean;
  trainerLodgingPlace: string | null;
  trainerLodgingDates: string | null;
  // Zone 4 — accessibilité / handicap
  hasDisabledLearner: boolean;
  disabilityAdaptations: string | null;
  // Zones de coches
  apportee: ChecklistZoneApportee;
  conditionsLieu: ChecklistConditionsLieu;
}

function checkbox(checked: boolean): string {
  return checked
    ? `<span style="display:inline-block;width:11px;height:11px;border:1.2px solid ${BRAND_DARK};background:${BRAND_DARK};color:white;text-align:center;line-height:11px;font-size:9pt;border-radius:2px;">✓</span>`
    : `<span style="display:inline-block;width:11px;height:11px;border:1.2px solid #94A3B8;border-radius:2px;"></span>`;
}

function row(label: string, checked: boolean): string {
  return `<li style="margin: 3px 0; display:flex; align-items:flex-start; gap:8px; font-size:10pt;">
    ${checkbox(checked)}
    <span>${escapeHtml(label)}</span>
  </li>`;
}

function ul(items: string): string {
  return `<ul style="list-style: none; padding: 0; margin: 4px 0 12px 0;">${items}</ul>`;
}

export function renderChecklistFormationHtml(data: ChecklistFormationData): string {
  const sameDay =
    data.sessionStartDate.toDateString() === data.sessionEndDate.toDateString();
  const dateStr = sameDay
    ? formatDateFr(data.sessionStartDate)
    : `Du ${formatDateFr(data.sessionStartDate)} au ${formatDateFr(data.sessionEndDate)}`;
  const formateurStr = data.formateurs.length > 0 ? data.formateurs.join(', ') : 'À renseigner';
  const a = data.apportee;
  const c = data.conditionsLieu;

  // Zone 1 — Apporté par Start Academy
  const zone1 = ul(`
    ${row('Déroulé pédagogique', a.deroulePedagogique)}
    ${row("Feuilles d'émargement", a.emargement)}
    ${row('Questionnaire de positionnement', a.positionnement)}
    ${row('Questionnaires de satisfaction', a.satisfaction)}
    ${row('Livret / support de formation', a.livretSupport)}
    ${row('Clé USB (support de cours / présentation)', a.cleUsb)}
    ${row('PC', a.pc)}
    ${row('Vidéoprojecteur', a.videoprojecteur)}
  `);

  // Zone 2 — Conditions du lieu d'accueil
  const zone2 = ul(`
    ${row("Salle adaptée au nombre d'inscrits", c.salleAdaptee)}
    ${row('Paperboard', c.paperboard)}
    ${row('Espace pause', c.espacePause)}
    ${row('Espace repas', c.espaceRepas)}
    ${row('Connexion internet', c.connexionInternet)}
    ${row('Prises électriques', c.prisesElectriques)}
  `);

  // Zone 3 — Logistique formateur
  const lodgingDetail = [
    data.trainerLodgingDates ? `Dates : ${escapeHtml(data.trainerLodgingDates)}` : null,
    data.trainerLodgingPlace ? `Lieu : ${escapeHtml(data.trainerLodgingPlace)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const zone3 = `
    <p style="font-size:10pt; margin: 4px 0;">
      <strong>Formateur de la session :</strong> ${escapeHtml(formateurStr)}
    </p>
    <li style="margin: 3px 0; display:flex; align-items:flex-start; gap:8px; font-size:10pt; list-style:none;">
      ${checkbox(data.trainerLodgingReserved)}
      <span>Réservation hébergement formateur ${data.horsDept06 ? '<strong>(formation hors département 06)</strong>' : '(si formation hors département 06)'}${lodgingDetail ? ` — ${lodgingDetail}` : ''}</span>
    </li>`;

  // Zone 4 — Accessibilité / handicap (2 cases). Comme les zones 1-2 : cochée pour
  // une session passée (par défaut « pas d'accueil PSH » si aucune PSH enregistrée),
  // vierge pour une session future. Une PSH connue est cochée même en amont.
  const zone4 = `
    <li style="margin: 3px 0; display:flex; align-items:flex-start; gap:8px; font-size:10pt; list-style:none;">
      ${checkbox(data.isPast && !data.hasDisabledLearner)}
      <span>Pas d'accueil de personne en situation de handicap pour cette session.</span>
    </li>
    <li style="margin: 3px 0; display:flex; align-items:flex-start; gap:8px; font-size:10pt; list-style:none;">
      ${checkbox(data.hasDisabledLearner)}
      <span>Accueil d'une personne en situation de handicap — adaptations à prévoir : ${escapeHtml(
        data.hasDisabledLearner ? data.disabilityAdaptations ?? '— à compléter par le référent —' : '…',
      )}</span>
    </li>
    <p style="font-size:10pt; margin: 6px 0 0 0; color:#475569;">
      <strong>Référent handicap :</strong> ${escapeHtml(HANDICAP_REFERENT_LINE)}
    </p>`;

  const body = `
${renderBrandHeader()}
<main class="body">
  <h1 class="doc-title">CHECK-LIST FORMATION</h1>
  <p class="doc-subtitle">Préparation logistique de la session</p>
  <hr class="doc-rule" />

  <div class="info-box">
    <table>
      <tbody>
        <tr>
          <td class="label">Formation :</td>
          <td class="value" colspan="3">${escapeHtml(data.formationTitre)} <span style="color:#94A3B8;">(${escapeHtml(data.sessionCode)})</span></td>
        </tr>
        <tr>
          <td class="label">Date(s) :</td>
          <td class="value">${escapeHtml(dateStr)}</td>
          <td class="label" style="width:22mm;">Formateur(s) :</td>
          <td class="value">${escapeHtml(formateurStr)}</td>
        </tr>
        <tr>
          <td class="label">Lieu :</td>
          <td class="value" colspan="3">${escapeHtml(data.lieuFormation)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <h2 class="section dark upper">1 · Apporté par Start Academy</h2>
  ${zone1}

  <h2 class="section dark upper">2 · Conditions du lieu d'accueil</h2>
  ${zone2}

  <h2 class="section dark upper">3 · Logistique formateur</h2>
  ${zone3}

  <h2 class="section dark upper" style="margin-top: 14px;">4 · Accessibilité / situation de handicap</h2>
  ${zone4}
</main>
`;

  return wrapHtml({ title: `Check-list — ${data.sessionCode}`, bodyHtml: body });
}

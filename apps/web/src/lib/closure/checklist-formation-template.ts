/**
 * Check-list formation (C4.i17 Qualiopi).
 *
 * 1 doc par session — pré-rempli IA selon : lieu, hébergement formateur,
 * accessibilité PSH. Coches :
 *   - ADMINISTRATIF (déroulé péda, convention formateur, émargement,
 *     règlement intérieur, certificat, lien QCM, livret stagiaires…)
 *   - REPAS / PAUSE (machine à café, eau, multiprise…)
 *   - MATÉRIEL (PC, paperboard, projecteur, internet…)
 *   - Accessibilité PSH
 */

import {
  BRAND_DARK,
  escapeHtml,
  formatDateFr,
  renderBrandHeader,
  wrapHtml,
} from './shared-template';

export interface ChecklistAdministratif {
  derouleP: boolean;
  conventionFormateur: boolean;
  emargement: boolean;
  reglementInterieur: boolean;
  positionnementAutoEval: boolean;
  certificatRealisation: boolean;
  lienQcm: boolean;
  livretStagiaires: boolean;
  evaluationChaud: boolean;
  grilleAmelioration: boolean;
  cleUsbSupport: boolean;
}

export interface ChecklistRepas {
  machineCafe: boolean;
  cafe: boolean;
  bouilloire: boolean;
  the: boolean;
  rallongeElectrique: boolean;
  eau: boolean;
  multiprise: boolean;
}

export interface ChecklistMateriel {
  pc: boolean;
  paperboard: boolean;
  projecteur: boolean;
  ecranAdapte: boolean;
  connexionInternet: boolean;
}

export interface ChecklistFormationData {
  formationTitre: string;
  sessionCode: string;
  sessionStartDate: Date;
  sessionEndDate: Date;
  formateurs: string[];
  lieuFormation: string;
  lieuContact: string | null;
  // Hébergement formateur
  needsTrainerLodging: boolean;
  trainerLodgingPlace: string | null;
  trainerLodgingDates: string | null;
  // Accessibilité PSH
  hasDisabledLearner: boolean;
  disabilityAdaptations: string | null;
  handicapReferent: string;
  // Coches IA
  administratif: ChecklistAdministratif;
  repas: ChecklistRepas;
  materiel: ChecklistMateriel;
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

export function renderChecklistFormationHtml(data: ChecklistFormationData): string {
  const sameDay =
    data.sessionStartDate.toDateString() === data.sessionEndDate.toDateString();
  const dateStr = sameDay
    ? formatDateFr(data.sessionStartDate)
    : `Du ${formatDateFr(data.sessionStartDate)} au ${formatDateFr(data.sessionEndDate)}`;
  const formateurStr = data.formateurs.length > 0 ? data.formateurs.join(', ') : 'À renseigner';

  const administratifList = `
    ${row('Déroulé pédagogique – rapport formateur', data.administratif.derouleP)}
    ${row('Convention Formateur', data.administratif.conventionFormateur)}
    ${row("Feuilles d'émargement", data.administratif.emargement)}
    ${row('Règlement intérieur', data.administratif.reglementInterieur)}
    ${row('Questionnaire de positionnement / auto-évaluation', data.administratif.positionnementAutoEval)}
    ${row('Certificat de réalisation', data.administratif.certificatRealisation)}
    ${row('Lien QCM', data.administratif.lienQcm)}
    ${row('Livret stagiaires', data.administratif.livretStagiaires)}
    ${row('Évaluation à chaud stagiaire', data.administratif.evaluationChaud)}
    ${row('Grille amélioration stagiaire', data.administratif.grilleAmelioration)}
    ${row('Clé USB – support de cours / présentation', data.administratif.cleUsbSupport)}
  `;

  const repasList = `
    ${row('Machine à café', data.repas.machineCafe)}
    ${row('Café', data.repas.cafe)}
    ${row('Bouilloire', data.repas.bouilloire)}
    ${row('Thé', data.repas.the)}
    ${row('Rallonge électrique', data.repas.rallongeElectrique)}
    ${row('Eau', data.repas.eau)}
    ${row('Multiprise', data.repas.multiprise)}
  `;

  const materielList = `
    ${row('PC', data.materiel.pc)}
    ${row('Paperboard', data.materiel.paperboard)}
    ${row('Projecteur', data.materiel.projecteur)}
    ${row('Écran ou mur adapté', data.materiel.ecranAdapte)}
    ${row('Connexion internet', data.materiel.connexionInternet)}
  `;

  const lodgingBlock = data.needsTrainerLodging
    ? `
    <p style="font-size:10pt; margin: 4px 0;">
      <strong>Hébergement formateur :</strong>
      ${checkbox(true)} OUI
      ${data.trainerLodgingDates ? `· Dates : ${escapeHtml(data.trainerLodgingDates)}` : ''}
      ${data.trainerLodgingPlace ? `· Lieu : ${escapeHtml(data.trainerLodgingPlace)}` : ''}
    </p>`
    : `<p style="font-size:10pt; margin: 4px 0;">
      <strong>Hébergement formateur :</strong> ${checkbox(false)} NON
    </p>`;

  const handicapBlock = data.hasDisabledLearner
    ? `
    <p style="font-size:10pt; margin: 4px 0;">
      ${checkbox(true)} <strong>Accueil d'une personne en situation de handicap.</strong>
    </p>
    <p style="font-size:10pt; margin: 2px 0 4px 22px; color:#475569;">
      Adaptations à prévoir : ${escapeHtml(data.disabilityAdaptations ?? '— à compléter par le référent —')}
    </p>`
    : `
    <p style="font-size:10pt; margin: 4px 0;">
      ${checkbox(true)} <strong>Pas d'accueil de personne en situation de handicap pour cette session.</strong>
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
          <td class="value" colspan="3">${escapeHtml(data.lieuFormation)}${data.lieuContact ? ` — Contact : ${escapeHtml(data.lieuContact)}` : ''}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${lodgingBlock}

  <h2 class="section dark upper">Administratif</h2>
  <ul style="list-style: none; padding: 0; margin: 4px 0 12px 0;">
    ${administratifList}
  </ul>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
    <div>
      <h2 class="section dark upper">Repas / Pause</h2>
      <ul style="list-style: none; padding: 0; margin: 4px 0 12px 0;">
        ${repasList}
      </ul>
    </div>
    <div>
      <h2 class="section dark upper">Matériel</h2>
      <ul style="list-style: none; padding: 0; margin: 4px 0 12px 0;">
        ${materielList}
      </ul>
    </div>
  </div>

  <h2 class="section dark upper">Accueil d'un public en situation de handicap</h2>
  ${handicapBlock}
  <p style="font-size:10pt; margin: 4px 0 0 0; color:#475569;">
    <strong>Référent handicap interne :</strong> ${escapeHtml(data.handicapReferent)}
  </p>
</main>
`;

  return wrapHtml({ title: `Check-list — ${data.sessionCode}`, bodyHtml: body });
}

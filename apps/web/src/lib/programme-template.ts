/**
 * Template HTML du programme de formation Start Academy.
 * Charte : couleur primaire #00527A, typographie sobre, format A4.
 */

import { marked } from 'marked';

export interface ProgrammeData {
  // Apprenant
  apprenantPrenom: string;
  apprenantNom: string;
  apprenantEmail: string | null;

  // Session
  sessionCode: string;
  sessionName: string;
  sessionStartDate: Date;
  sessionEndDate: Date;
  sessionLieu: string | null;
  sessionModalite: string;
  sessionFormateurs: string[]; // noms des formateurs

  // Produit (programme officiel)
  produitTitre: string;
  produitCode: string;
  produitDureeHeures: number;
  produitPriceHT: number;
  produitObjectifs: string[];
  produitProgrammeMd: string;
  produitPrerequisites: string | null;
  produitTargetAudience: string | null;
  produitPedagogicalMethods: string | null;
  produitEvaluationMethods: string | null;
  produitAccessibility: string | null;
  produitAccessConditions: string | null;
  produitTrainerProfile: string | null;
  produitPedagogicalSupport: string | null;

  // OF (Start Academy)
  ofName: string;
  ofSiret: string;
  ofAddress: string;
  ofRnq: string;
  ofPhone: string;
  ofEmail: string;
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const STYLES = `
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #0F172A;
    line-height: 1.5;
    margin: 0;
  }
  header.cover {
    border-bottom: 4px solid #00527A;
    padding-bottom: 18px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  header.cover .brand {
    font-size: 22pt;
    font-weight: 700;
    color: #00527A;
    letter-spacing: -0.5px;
  }
  header.cover .meta {
    font-size: 9pt;
    color: #64748B;
    text-align: right;
  }
  h1.title {
    font-size: 18pt;
    color: #00527A;
    margin: 0 0 8px 0;
    line-height: 1.2;
  }
  .subtitle {
    color: #64748B;
    font-size: 10pt;
    margin-bottom: 22px;
  }
  .badge {
    display: inline-block;
    background: #E0F2FE;
    color: #0C4A6E;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 9pt;
    font-weight: 600;
    margin-right: 6px;
  }
  section { margin-bottom: 18px; page-break-inside: avoid; }
  h2 {
    font-size: 12pt;
    color: #00527A;
    margin: 18px 0 8px 0;
    border-left: 3px solid #00527A;
    padding-left: 8px;
  }
  h3 {
    font-size: 10.5pt;
    color: #0F172A;
    margin: 14px 0 6px 0;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 18px;
    font-size: 10pt;
  }
  .grid .row { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px dotted #E2E8F0; }
  .grid .row strong { color: #475569; min-width: 110px; }
  ul, ol { margin: 6px 0 10px 18px; padding: 0; }
  li { margin-bottom: 3px; }
  .programme-md p { margin: 6px 0; }
  .programme-md h2, .programme-md h3 { color: #00527A; }
  table.summary {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 16px 0;
    font-size: 10pt;
  }
  table.summary td {
    padding: 6px 10px;
    border-bottom: 1px solid #E2E8F0;
  }
  table.summary td:first-child {
    color: #64748B;
    width: 35%;
  }
  table.summary td:last-child { font-weight: 500; }
  footer.signature {
    margin-top: 30px;
    border-top: 1px solid #E2E8F0;
    padding-top: 14px;
    font-size: 9pt;
    color: #64748B;
    display: flex;
    justify-content: space-between;
  }
  footer.signature .place { font-style: italic; }
  .signature-block {
    margin-top: 22px;
    border: 1px dashed #94A3B8;
    border-radius: 6px;
    padding: 14px;
    font-size: 10pt;
  }
  .signature-block .label { color: #64748B; font-size: 9pt; }
  .signature-block .name { font-weight: 600; }
</style>
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderProgrammeHtml(data: ProgrammeData): string {
  const programmeHtml = data.produitProgrammeMd
    ? marked.parse(data.produitProgrammeMd, { async: false }) as string
    : '<em>Programme à compléter dans la fiche produit.</em>';

  const objectifsHtml = data.produitObjectifs.length > 0
    ? `<ul>${data.produitObjectifs.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>`
    : '<em>Objectifs à compléter dans la fiche produit.</em>';

  const formateurs = data.sessionFormateurs.length > 0
    ? data.sessionFormateurs.join(', ')
    : 'À confirmer';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Programme — ${escapeHtml(data.produitTitre)}</title>
${STYLES}
</head>
<body>

<header class="cover">
  <div>
    <div class="brand">${escapeHtml(data.ofName)}</div>
    <div style="font-size: 9pt; color: #64748B; margin-top: 2px;">Organisme de formation Qualiopi</div>
  </div>
  <div class="meta">
    <div><strong>${escapeHtml(data.sessionCode)}</strong></div>
    <div>${escapeHtml(data.produitCode)}</div>
    <div>${fmtDate.format(new Date())}</div>
  </div>
</header>

<h1 class="title">Programme de formation</h1>
<div class="subtitle">
  Document remis à l'apprenant en application de l'indicateur Qualiopi 2.4.
</div>

<div>
  <span class="badge">${data.produitDureeHeures} heures</span>
  <span class="badge">${escapeHtml(data.sessionModalite)}</span>
  <span class="badge">${fmtEUR.format(data.produitPriceHT)} HT</span>
</div>

<section>
  <h2>Récapitulatif de la session</h2>
  <table class="summary">
    <tr><td>Intitulé</td><td>${escapeHtml(data.produitTitre)}</td></tr>
    <tr><td>Code session</td><td>${escapeHtml(data.sessionCode)}</td></tr>
    <tr><td>Apprenant</td><td>${escapeHtml(`${data.apprenantPrenom} ${data.apprenantNom}`)}</td></tr>
    <tr><td>Dates</td><td>du ${fmtDate.format(data.sessionStartDate)} au ${fmtDate.format(data.sessionEndDate)}</td></tr>
    <tr><td>Durée totale</td><td>${data.produitDureeHeures} heures</td></tr>
    <tr><td>Modalité</td><td>${escapeHtml(data.sessionModalite)}</td></tr>
    <tr><td>Lieu</td><td>${escapeHtml(data.sessionLieu ?? 'À préciser')}</td></tr>
    <tr><td>Formateur(s)</td><td>${escapeHtml(formateurs)}</td></tr>
    <tr><td>Tarif HT / apprenant</td><td>${fmtEUR.format(data.produitPriceHT)}</td></tr>
  </table>
</section>

<section>
  <h2>Public visé</h2>
  <p>${escapeHtml(data.produitTargetAudience ?? "Professionnels de l'immobilier souhaitant développer leurs compétences.")}</p>
</section>

<section>
  <h2>Prérequis</h2>
  <p>${escapeHtml(data.produitPrerequisites ?? "Aucun prérequis spécifique.")}</p>
</section>

<section>
  <h2>Objectifs pédagogiques</h2>
  ${objectifsHtml}
</section>

<section>
  <h2>Programme détaillé</h2>
  <div class="programme-md">${programmeHtml}</div>
</section>

<section>
  <h2>Méthodes pédagogiques</h2>
  <p>${escapeHtml(data.produitPedagogicalMethods ?? "Apports théoriques alternés avec mises en situation pratiques, cas concrets, exercices et échanges entre participants.")}</p>
</section>

<section>
  <h2>Modalités d'évaluation</h2>
  <p>${escapeHtml(data.produitEvaluationMethods ?? "Évaluation continue par le formateur · QCM final · Grille d'observation · Questionnaire de satisfaction.")}</p>
</section>

<section>
  <h2>Profil du formateur</h2>
  <p>${escapeHtml(data.produitTrainerProfile ?? "Formateur expérimenté du secteur immobilier, qualifié et habilité à dispenser cette formation.")}</p>
</section>

<section>
  <h2>Supports pédagogiques</h2>
  <p>${escapeHtml(data.produitPedagogicalSupport ?? "Supports remis aux apprenants : présentation, fiches synthèse, ressources numériques.")}</p>
</section>

<section>
  <h2>Accessibilité aux personnes en situation de handicap</h2>
  <p>${escapeHtml(data.produitAccessibility ?? `${data.ofName} est attentif à l'accessibilité de ses formations. Pour toute situation particulière, merci de nous contacter en amont à ${data.ofEmail} pour étudier ensemble les adaptations nécessaires.`)}</p>
</section>

<section>
  <h2>Conditions d'accès et délais</h2>
  <p>${escapeHtml(data.produitAccessConditions ?? "Inscription ouverte jusqu'à 7 jours avant le démarrage de la session, sous réserve des places disponibles.")}</p>
</section>

<div class="signature-block">
  <div class="label">Apprenant — Lu et approuvé</div>
  <div class="name" style="margin-top: 4px;">${escapeHtml(`${data.apprenantPrenom} ${data.apprenantNom}`)}</div>
  <div style="height: 30px;"></div>
  <div class="label">Date et signature</div>
</div>

<footer class="signature">
  <div>
    <strong>${escapeHtml(data.ofName)}</strong> — SIRET ${escapeHtml(data.ofSiret)} — Déclaration ${escapeHtml(data.ofRnq)}
    <br>${escapeHtml(data.ofAddress)} · ${escapeHtml(data.ofPhone)} · ${escapeHtml(data.ofEmail)}
  </div>
</footer>

</body>
</html>`;
}

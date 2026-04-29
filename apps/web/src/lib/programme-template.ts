/**
 * Template HTML du programme de formation Start Academy.
 *
 * Structure alignée sur le DOCX de référence (Maîtriser l'IA…) :
 * en-tête avec logo Start Academy, titre formation, sections OBJECTIFS /
 * PUBLIC VISÉ / NIVEAU PRÉREQUIS / DURÉE / MOYENS PÉDAGOGIQUES /
 * CONTENU DÉTAILLÉ. Footer corporate Start Academy.
 *
 * Charte : couleur primaire #00B4E6 (bleu logo) + #00527A (texte titres).
 */

import { marked } from 'marked';
import path from 'node:path';
import fs from 'node:fs';

import { getOfConfig } from './of-config';

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
  sessionFormateurs: string[];

  // Produit
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

  // OF (gardé pour compatibilité, mais lu depuis getOfConfig() en interne)
  ofName: string;
  ofSiret: string;
  ofAddress: string;
  ofRnq: string;
  ofPhone: string;
  ofEmail: string;
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

let logoCache: string | null = null;
function loadLogoDataUrl(): string {
  if (logoCache) return logoCache;
  try {
    const p = path.join(process.cwd(), 'src', 'assets', 'logo-start-academy.png');
    const b = fs.readFileSync(p);
    logoCache = `data:image/png;base64,${b.toString('base64')}`;
  } catch {
    logoCache = '';
  }
  return logoCache;
}

const BRAND_BLUE = '#00B4E6';
const BRAND_DARK = '#00527A';

const STYLES = `
<style>
  @page { size: A4; margin: 18mm 18mm 22mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #0F172A;
    line-height: 1.55;
    margin: 0;
  }
  header.top {
    border-bottom: 3px solid ${BRAND_BLUE};
    padding-bottom: 12px;
    margin-bottom: 22px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  header.top img.logo { height: 56px; width: auto; }
  header.top .meta {
    font-size: 8.5pt;
    color: #64748B;
    text-align: right;
  }
  h1.title {
    font-size: 20pt;
    color: ${BRAND_DARK};
    margin: 0 0 18px 0;
    line-height: 1.25;
    font-weight: 700;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 22px;
  }
  .badge {
    display: inline-block;
    background: ${BRAND_BLUE};
    color: white;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 9pt;
    font-weight: 600;
  }
  h2.section {
    font-size: 11pt;
    color: ${BRAND_DARK};
    margin: 22px 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 700;
    border-bottom: 2px solid ${BRAND_BLUE};
    padding-bottom: 4px;
  }
  h3 {
    font-size: 10.5pt;
    color: ${BRAND_DARK};
    margin: 14px 0 4px 0;
    font-weight: 600;
  }
  p { margin: 4px 0 8px 0; }
  ul { margin: 4px 0 10px 18px; padding: 0; }
  li { margin-bottom: 4px; }
  table.summary {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 16px 0;
    font-size: 10pt;
  }
  table.summary td {
    padding: 6px 10px;
    border-bottom: 1px solid #E2E8F0;
    vertical-align: top;
  }
  table.summary td:first-child {
    color: #64748B;
    width: 36%;
    font-size: 9pt;
  }
  table.summary td:last-child { font-weight: 500; }
  .programme-md { font-size: 10.5pt; }
  .programme-md p { margin: 6px 0; }
  .programme-md h2 {
    font-size: 11pt;
    color: ${BRAND_DARK};
    margin: 14px 0 6px 0;
    border: none;
    text-transform: none;
    padding: 0;
    letter-spacing: 0;
  }
  .programme-md h3 {
    font-size: 10pt;
    color: ${BRAND_DARK};
    margin: 12px 0 4px 0;
  }
  section { page-break-inside: avoid; }
  .signature-block {
    margin-top: 26px;
    border: 1px dashed #94A3B8;
    border-radius: 6px;
    padding: 14px;
    font-size: 10pt;
  }
  .signature-block .label { color: #64748B; font-size: 8.5pt; }
  .signature-block .name { font-weight: 600; margin-top: 4px; }
  footer.corp {
    position: fixed;
    bottom: 6mm;
    left: 18mm;
    right: 18mm;
    border-top: 1px solid #CBD5E1;
    padding-top: 5px;
    font-size: 7.5pt;
    color: #64748B;
    text-align: center;
    line-height: 1.45;
  }
  footer.corp strong { color: ${BRAND_DARK}; }
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
  const of = getOfConfig();
  const logoDataUrl = loadLogoDataUrl();
  const programmeHtml = data.produitProgrammeMd
    ? (marked.parse(data.produitProgrammeMd, { async: false }) as string)
    : '<em>Programme à compléter dans la fiche produit.</em>';

  const objectifsHtml =
    data.produitObjectifs.length > 0
      ? `<ul>${data.produitObjectifs.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>`
      : '<em>Objectifs à compléter dans la fiche produit.</em>';

  const formateurs = data.sessionFormateurs.length > 0 ? data.sessionFormateurs.join(', ') : 'À confirmer';

  const respFullName = `${of.resp.prenom} ${of.resp.nom}`.trim();
  const today = new Date();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Programme — ${escapeHtml(data.produitTitre)}</title>
${STYLES}
</head>
<body>

<header class="top">
  ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="${escapeHtml(of.name)}" />` : `<div style="font-size:18pt;font-weight:700;color:${BRAND_DARK};">${escapeHtml(of.name)}</div>`}
  <div class="meta">
    <div><strong>${escapeHtml(data.sessionCode)}</strong></div>
    <div>${escapeHtml(data.produitCode)}</div>
    <div>${fmtDate.format(today)}</div>
  </div>
</header>

<h1 class="title">${escapeHtml(data.produitTitre)}</h1>

<div class="badges">
  <span class="badge">${data.produitDureeHeures} heures</span>
  <span class="badge">${escapeHtml(data.sessionModalite)}</span>
  <span class="badge">${fmtEUR.format(data.produitPriceHT)} HT</span>
</div>

<section>
  <h2 class="section">Récapitulatif de la session</h2>
  <table class="summary">
    <tr><td>Intitulé</td><td>${escapeHtml(data.produitTitre)}</td></tr>
    <tr><td>Code session</td><td>${escapeHtml(data.sessionCode)}</td></tr>
    <tr><td>Apprenant</td><td>${escapeHtml(`${data.apprenantPrenom} ${data.apprenantNom}`)}</td></tr>
    <tr><td>Dates</td><td>du ${fmtDate.format(data.sessionStartDate)} au ${fmtDate.format(data.sessionEndDate)}</td></tr>
    <tr><td>Durée totale</td><td>${data.produitDureeHeures} heures</td></tr>
    <tr><td>Modalité</td><td>${escapeHtml(data.sessionModalite)}</td></tr>
    <tr><td>Lieu</td><td>${escapeHtml(data.sessionLieu ?? of.addressFull)}</td></tr>
    <tr><td>Formateur(s)</td><td>${escapeHtml(formateurs)}</td></tr>
    <tr><td>Tarif HT / apprenant</td><td>${fmtEUR.format(data.produitPriceHT)}</td></tr>
  </table>
</section>

<section>
  <h2 class="section">Les objectifs pédagogiques de la formation</h2>
  <p>À l'issue de la formation, le stagiaire sera capable de :</p>
  ${objectifsHtml}
</section>

<section>
  <h2 class="section">Public visé</h2>
  <p>${escapeHtml(data.produitTargetAudience ?? "Professionnels de l'immobilier (agents commerciaux, conseillers, négociateurs, gérants d'agences) souhaitant développer leurs compétences.")}</p>
</section>

<section>
  <h2 class="section">Niveau de connaissances préalables requis</h2>
  <p>${escapeHtml(data.produitPrerequisites ?? "Aucun prérequis spécifique.")}</p>
</section>

<section>
  <h2 class="section">La durée de formation</h2>
  <p>${data.produitDureeHeures} heures.</p>
</section>

<section>
  <h2 class="section">Les moyens pédagogiques et techniques</h2>
  <p>${escapeHtml(data.produitPedagogicalMethods ?? "Apports théoriques alternés avec mises en situation pratiques, cas concrets, exercices et échanges entre participants.")}</p>
  <p>${escapeHtml(data.produitPedagogicalSupport ?? "Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.")}</p>
</section>

<section>
  <h2 class="section">Contenu détaillé de la formation</h2>
  <div class="programme-md">${programmeHtml}</div>
</section>

<section>
  <h2 class="section">Modalités d'évaluation</h2>
  <p>${escapeHtml(data.produitEvaluationMethods ?? "Évaluation continue par le formateur · QCM final · Grille d'observation · Questionnaire de satisfaction.")}</p>
</section>

<section>
  <h2 class="section">Profil du formateur</h2>
  <p>${escapeHtml(data.produitTrainerProfile ?? `Formateur expérimenté du secteur immobilier, qualifié et habilité à dispenser cette formation. Formateur(s) de cette session : ${formateurs}.`)}</p>
</section>

<section>
  <h2 class="section">Accessibilité aux personnes en situation de handicap</h2>
  <p>${escapeHtml(data.produitAccessibility ?? `${of.name} est attentif à l'accessibilité de ses formations. Pour toute situation particulière, merci de nous contacter en amont à ${of.email} pour étudier ensemble les adaptations nécessaires.`)}</p>
</section>

<section>
  <h2 class="section">Conditions d'accès et délais</h2>
  <p>${escapeHtml(data.produitAccessConditions ?? "Inscription ouverte jusqu'à 7 jours avant le démarrage de la session, sous réserve des places disponibles.")}</p>
</section>

<div class="signature-block">
  <div class="label">Apprenant — Lu et approuvé</div>
  <div class="name">${escapeHtml(`${data.apprenantPrenom} ${data.apprenantNom}`)}</div>
  <div style="height: 36px;"></div>
  <div class="label">Date et signature</div>
</div>

<footer class="corp">
  <strong>${escapeHtml(of.name)}</strong> – siège social ${escapeHtml(of.addressFull)} – N° SIRET ${escapeHtml(of.siret)}<br>
  NDA ${escapeHtml(of.rnq)} – Coordonnées de contact : ${escapeHtml(respFullName)} – E-mail : ${escapeHtml(of.email)} – ${escapeHtml(of.phone)}
</footer>

</body>
</html>`;
}

/**
 * Template HTML du programme de formation Start Academy.
 *
 * Structure ALIGNÉE STRICTEMENT sur les 3 modèles DOCX fournis par Laurent
 * (Maitrisez l'IA en 3 jours, Management & performance, Immobilier 2h/jour) :
 * 11 sections en MAJUSCULES, formulations exactes des phrases standard,
 * footer corporate fixe identique au DOCX.
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

  // OF (gardé pour compatibilité)
  ofName: string;
  ofSiret: string;
  ofAddress: string;
  ofRnq: string;
  ofPhone: string;
  ofEmail: string;
}

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
  @page { size: A4; margin: 22mm 18mm 22mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Calibri', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #1F2937;
    line-height: 1.5;
    margin: 0;
  }

  /* Logo en haut centré */
  header.cover {
    text-align: center;
    margin-bottom: 14px;
    padding-bottom: 10px;
  }
  header.cover img.logo { height: 70px; width: auto; }

  /* Titre principal */
  h1.title {
    font-size: 22pt;
    color: ${BRAND_DARK};
    text-align: center;
    margin: 8px 0 24px 0;
    line-height: 1.25;
    font-weight: 700;
  }

  /* Sections : MAJUSCULES, gras, soulignées dans le DOCX */
  h2.section {
    font-size: 12pt;
    color: ${BRAND_DARK};
    margin: 20px 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
    border-bottom: 1.5px solid ${BRAND_BLUE};
    padding-bottom: 3px;
  }

  /* Sous-sections (Jour 1, Matin, etc.) */
  h3.day {
    font-size: 11pt;
    color: ${BRAND_DARK};
    font-weight: 700;
    margin: 14px 0 4px 0;
  }
  h4.timeslot {
    font-size: 10.5pt;
    font-weight: 600;
    color: #334155;
    margin: 10px 0 3px 0;
  }

  p { margin: 4px 0 8px 0; }
  ul {
    margin: 4px 0 10px 22px;
    padding: 0;
    list-style-type: disc;
  }
  ul ul { list-style-type: circle; margin-top: 2px; }
  li { margin-bottom: 3px; }

  /* Markdown rendu pour le contenu détaillé */
  .programme-md p { margin: 4px 0; }
  .programme-md h2 {
    font-size: 11pt;
    color: ${BRAND_DARK};
    font-weight: 700;
    text-transform: none;
    border: none;
    padding: 0;
    letter-spacing: 0;
    margin: 14px 0 4px 0;
  }
  .programme-md h3 {
    font-size: 10.5pt;
    color: #334155;
    font-weight: 600;
    margin: 10px 0 3px 0;
  }
  .programme-md strong { color: ${BRAND_DARK}; }

  /* Tarif final */
  .tarif {
    margin-top: 12px;
    padding: 10px 14px;
    border-left: 3px solid ${BRAND_BLUE};
    background: #F0F9FF;
    font-size: 11pt;
  }
  .tarif strong { color: ${BRAND_DARK}; }

  /* Récap produit (encart bleu en début) */
  .produit-recap {
    margin-top: 8px;
    margin-bottom: 18px;
    padding: 10px 14px;
    background: #F8FAFC;
    border-left: 3px solid ${BRAND_BLUE};
    font-size: 9.5pt;
  }
  .produit-recap div { margin: 2px 0; }
  .produit-recap .label { color: #64748B; display: inline-block; min-width: 110px; }

  /* Bloc contact en fin de doc */
  .contact-block {
    margin-top: 18px;
    padding: 10px 14px;
    background: #F0F9FF;
    border-left: 3px solid ${BRAND_BLUE};
    font-size: 10pt;
  }
  .contact-block p { margin: 0; }

  /* Pagination : evite de couper les sections au milieu si possible */
  section { page-break-inside: avoid; }
  /* Le programmeMd peut etre long, on autorise la coupure mais on garde
     les titres avec leur premier paragraphe */
  .programme-md { page-break-inside: auto; }
  .programme-md h2, .programme-md h3 { page-break-after: avoid; }

  /* Le footer corporate est gere par Gotenberg footerHtml — pas inline ici */
</style>
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DEFAULT_TARGET_AUDIENCE =
  "Professionnels de l'immobilier (agents commerciaux, conseillers, négociateurs, gérants d'agences) souhaitant développer leurs compétences.";
const DEFAULT_PREREQUISITES = "Aucun prérequis spécifique.";
const DEFAULT_PEDAGOGICAL_METHODS =
  "La formation se déroule en présentiel.\nLes formateurs proposeront des mises en situation professionnelles sur les techniques de prospection, les discours et la posture ainsi que des échanges sur les pratiques actuelles.";
const DEFAULT_PEDAGOGICAL_SUPPORT =
  "Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.";
const DEFAULT_TRAINER_PROFILE =
  "Tous les formateurs de l'équipe Start Academy ont minimum 8 années d'expérience dans l'immobilier, notamment dans le domaine de la vente de biens, de formation d'agents et de coaching d'équipes commerciales.";
const DEFAULT_EVALUATION_METHODS =
  "- Une liste d'émargement est à signer à la demi-journée.\n- Un certificat de réalisation sera délivré à chaque participant à la fin de la formation.\n- Une évaluation sous forme de QCM aura lieu en fin de formation.\n- Évaluation de la satisfaction stagiaire et évaluation de la montée en compétences étape par étape par des mises en situation pratiques.";
const DEFAULT_ACCESS_CONDITIONS =
  "Afin de vous inscrire à notre formation, merci de contacter minimum 14 jours avant le début de la formation.\nUne fois votre inscription validée, nous vous adresserons une convention de formation et une convocation vous sera envoyée par mail 7 jours avant le début de la formation.\nEn cas de subrogation de paiement, un accord du financeur doit nous être parvenu avec le début de la formation.";
const DEFAULT_ACCESSIBILITY =
  "La loi du 5 septembre 2018 pour la « liberté de choisir son avenir professionnel » a pour objectif de faciliter l'accès à l'emploi des personnes en situation de handicap.\nNotre organisme tente de donner à tous les mêmes chances d'accéder ou de maintenir l'emploi.\nNous pouvons adapter certaines de nos modalités de formation, pour cela, nous étudierons ensemble vos besoins.";

/**
 * Convertit "70" en "70 heures (1 journée de 7 heures)" / "21" en
 * "21 heures (3 journées de 7 heures)". Heuristique simple basée sur 7h/jour.
 */
function formatDuree(heures: number): string {
  if (heures <= 0) return '—';
  if (heures === 7) return '7 heures (1 journée)';
  if (heures % 7 === 0) {
    const j = heures / 7;
    return `${heures} heures (${j} journée${j > 1 ? 's' : ''} de 7 heures)`;
  }
  if (heures === 8) return '8 heures (1 journée)';
  if (heures % 8 === 0) {
    const j = heures / 8;
    return `${heures} heures (${j} journée${j > 1 ? 's' : ''} de 8 heures)`;
  }
  return `${heures} heures`;
}

export function renderProgrammeHtml(data: ProgrammeData): string {
  const of = getOfConfig();
  const logoDataUrl = loadLogoDataUrl();

  const objectifs = data.produitObjectifs.length > 0
    ? data.produitObjectifs
    : ['Objectifs à définir dans la fiche produit.'];

  const programmeHtml = data.produitProgrammeMd
    ? (marked.parse(data.produitProgrammeMd, { async: false }) as string)
    : '<p><em>Programme à compléter dans la fiche produit (champ Programme détaillé).</em></p>';

  const formateurs = data.sessionFormateurs.length > 0 ? data.sessionFormateurs.join(', ') : 'À confirmer';
  const respFullName = `${of.resp.prenom} ${of.resp.nom}`.trim();

  // Méthodes pédagogiques : on s'assure que la phrase générique livret/Canva
  // apparaît toujours en dernière ligne (pattern Start Academy)
  let methods = (data.produitPedagogicalMethods ?? DEFAULT_PEDAGOGICAL_METHODS).trim();
  let support = (data.produitPedagogicalSupport ?? DEFAULT_PEDAGOGICAL_SUPPORT).trim();
  if (!methods.toLowerCase().includes('livret') && !support.toLowerCase().includes('livret')) {
    support = DEFAULT_PEDAGOGICAL_SUPPORT;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Programme — ${escapeHtml(data.produitTitre)}</title>
${STYLES}
</head>
<body>

<header class="cover">
  ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="${escapeHtml(of.name)}" />` : `<div style="font-size:18pt;font-weight:700;color:${BRAND_DARK};">${escapeHtml(of.name)}</div>`}
</header>

<h1 class="title">${escapeHtml(data.produitTitre)}</h1>

<div class="produit-recap">
  <div><span class="label">Code produit :</span> <strong>${escapeHtml(data.produitCode)}</strong></div>
  <div><span class="label">Durée :</span> ${formatDuree(data.produitDureeHeures)}</div>
</div>

<section>
  <h2 class="section">Les objectifs pédagogiques de formation</h2>
  <p>À l'issue de la formation, le stagiaire sera capable de :</p>
  <ul>${objectifs.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>
</section>

<section>
  <h2 class="section">Public visé</h2>
  ${escapeHtml(data.produitTargetAudience ?? DEFAULT_TARGET_AUDIENCE)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('')}
</section>

<section>
  <h2 class="section">Niveau de connaissances préalables requis</h2>
  ${escapeHtml(data.produitPrerequisites ?? DEFAULT_PREREQUISITES)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('')}
</section>

<section>
  <h2 class="section">La durée de formation</h2>
  <p>${formatDuree(data.produitDureeHeures)}</p>
</section>

<section>
  <h2 class="section">Les moyens pédagogiques et techniques</h2>
  ${escapeHtml(methods)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('')}
  <p>${escapeHtml(support)}</p>
</section>

<section>
  <h2 class="section">Contenu détaillé de la formation</h2>
  <div class="programme-md">${programmeHtml}</div>
</section>

<section>
  <h2 class="section">L'encadrement de l'action de formation</h2>
  <p>${escapeHtml(data.produitTrainerProfile ?? DEFAULT_TRAINER_PROFILE)}</p>
  ${formateurs && formateurs !== 'À confirmer' ? `<p>Formateur(s) de cette session : <strong>${escapeHtml(formateurs)}</strong>.</p>` : ''}
</section>

<section>
  <h2 class="section">Les moyens d'évaluation mise en œuvre et suivi</h2>
  ${escapeHtml(data.produitEvaluationMethods ?? DEFAULT_EVALUATION_METHODS)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('')}
</section>

<section>
  <h2 class="section">Modalités d'inscription et délai d'accès à notre formation</h2>
  ${escapeHtml(data.produitAccessConditions ?? DEFAULT_ACCESS_CONDITIONS)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('')}
</section>

<section>
  <h2 class="section">Accessibilité aux personnes en situation de handicap</h2>
  ${escapeHtml(data.produitAccessibility ?? DEFAULT_ACCESSIBILITY)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('')}
</section>

<section class="contact-block">
  <p>Pour toute question : <strong>${escapeHtml(respFullName)}</strong> — ${escapeHtml(of.email)} — ${escapeHtml(of.phone)}.</p>
</section>

<section>
  <h2 class="section">Tarif</h2>
  <div class="tarif">
    <strong>${fmtEUR.format(data.produitPriceHT)}</strong> HT par stagiaire
    <span style="color:#64748B; font-size: 9.5pt;">— TVA non applicable en vertu de l'article 261-4-4° du CGI.</span>
  </div>
</section>

</body>
</html>`;
}

/**
 * Footer HTML répété par Gotenberg sur chaque page (passé en footer.html
 * dans le multipart). Doit etre un document HTML autonome, le styling vient
 * inline (Gotenberg ignore les <style> externes et CSS @page).
 */
export function renderProgrammeFooterHtml(): string {
  const of = getOfConfig();
  const respFullName = `${of.resp.prenom} ${of.resp.nom}`.trim();
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: Calibri, Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #475569; margin: 0; padding: 0;">
  <div style="border-top: 1px solid #94A3B8; padding: 4px 18mm 0 18mm; text-align: center; line-height: 1.45;">
    <strong style="color: ${BRAND_DARK};">${escapeHtml(of.name)}</strong> – siège social ${escapeHtml(of.addressFull)} – N° SIRET ${escapeHtml(of.siret)}<br>
    NDA ${escapeHtml(of.rnq)} – Coordonnées de contact : ${escapeHtml(respFullName)} – E-mail : ${escapeHtml(of.email)} – Tél : ${escapeHtml(of.phone)}
  </div>
</body></html>`;
}

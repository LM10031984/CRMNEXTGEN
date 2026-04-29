// Test isolé du form-fill AGEFICE V2 sur les vraies données de Caroline VESCOVI.
// Usage : node apps/web/scripts/test-agefice-fill.mjs
// Sortie : /tmp/agefice-test-caroline.pdf à comparer avec le PDF de référence.

import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE = path.resolve(__dirname, '../src/assets/agefice-template.pdf');
const SIGNATURE = path.resolve(__dirname, '../src/assets/signature-laurent.png');

// Données extraites de la base pour Caroline (sp.id = 59025fda-...)
const data = {
  pa: {
    name: 'AGEFICE 06',
    number: '370',
    contactName: 'Virginie BEHIN',
    address: '17 RUE PAGANINI',
    postalCode: '06000',
    city: 'NICE',
    phone: '04 93 16 29 64',
    email: 'info.agefice@orange.fr',
  },
  entreprise: {
    raisonSociale: 'VESCOVI Caroline',
    nomCommercial: null,
    naf: '4619 B',
    siret: '82202434500016',
    activite: 'immobilier',
    formeJuridique: 'EI',
    address: '116 CHEM LOU COULOMBIE',
    postalCode: '06510',
    city: 'CARROS',
  },
  stagiaire: {
    civilite: 'MME',
    nom: 'Vescovi',
    prenom: 'Caroline',
    nomNaissance: 'Malavard',
    dateNaissance: new Date('1987-04-28'),
    securiteSociale: null,
    phone: '0610542863',
    email: 'caroline@conceptpatrimoine.fr',
    diplome: null,
    experience: '4_10_ANS',
  },
  of: {
    name: 'START ACADEMY',
    siret: '95131909400011',
    rnq: '93 06 10481 06',
    addressStreet: '618 bd Jean Maurel inférieur',
    addressCp: '06140',
    addressVille: 'Vence',
    addressFull: '618 bd Jean Maurel inférieur, 06140 Vence',
    phone: '0631056390',
    email: 'formation@start-academy.fr',
    tvaIntra: '',
    iban: '',
    bic: '',
    resp: {
      civilite: 'MR',
      nom: 'MARX',
      prenom: 'Laurent',
      titre: 'PDG',
      phone: '0631056390',
      email: 'formation@start-academy.fr',
    },
    contact: {
      civilite: 'MR',
      nom: 'MARX',
      prenom: 'Laurent',
      titre: 'PDG',
      phone: '0631056390',
      email: 'formation@start-academy.fr',
    },
  },
  formationType: 'ACTION',
  obligatoire: false,
  reconversion: false,
  formation: {
    intitule: "L'intelligence artificielle au service des conseillers immobiliers",
    thematique: 'immobilier',
    niveau: 'PERFECTIONNEMENT',
    certif: 'SANS_QUALIFICATION',
    dateDebut: new Date('2025-06-29'),
    dateFin: new Date('2025-07-09'),
    dureePresentielIndividuel: 0,
    dureePresentielCollectif: 72,
    dureeFoadSynchrone: 0,
    dureeFoadAsynchrone: 0,
    formateur: 'Laurent MARX',
    lieuPostalCode: '06140',
    lieuVille: 'Vence',
    lieuAdresseComplete: '618 bd Jean Maurel inférieur, 06140 Vence',
    prixHT: 3024,
    enEntreprise: false,
    deroulementPedago:
      'Les formateurs proposeront des mises en situation professionnelles sur les techniques de prospection, les discours et la posture ainsi que des échanges sur les pratiques actuelles.\n\n' +
      'Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.',
  },
  evaluations: ['QUIZ', 'FEUILLES_PRESENCE'],
  evaluationAutreDetail: null,
  attestation: 'ATTESTATION_STAGE',
  mandat: true,
  signature: { lieu: 'Vence', date: new Date() },
};

// ── Inline minimal port de fillAgeficePdf (pour exécution Node directe) ──────
const fmtDateFr = (d) => {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};
const fmtNumber = (n, dec = 0) =>
  n == null || Number.isNaN(n) ? '' : dec > 0 ? n.toFixed(dec).replace('.', ',') : String(Math.round(n));
const fmtPhone = (s) => (s ? s.replace(/\D/g, '').slice(0, 10) : '');
const fmtSecu = (s) => (s ? s.replace(/\D/g, '').slice(0, 13) : '');

const FORME = {
  EI: 'ENTREPRISE INDIVIDUELLE',
  AUTO_ENTREPRENEUR: 'MICRO-ENTREPRISE / AUTO-ENTREPRISE',
  MICRO_ENTREPRISE: 'MICRO-ENTREPRISE / AUTO-ENTREPRISE',
  EIRL: 'EIRL',
  SARL: 'SARL',
  SA: 'SA',
  SAS: 'SAS',
  SASU: 'SASU',
};

const bytes = await fs.readFile(TEMPLATE);
const pdf = await PDFDocument.load(bytes);
const form = pdf.getForm();
const fields = new Map(form.getFields().map((f) => [f.getName(), f]));

const setText = (name, v) => {
  const f = fields.get(name);
  if (f instanceof PDFTextField && v != null) f.setText(String(v));
};
const setCheck = (name, on) => {
  const f = fields.get(name);
  if (f instanceof PDFCheckBox) (on ? f.check() : f.uncheck());
};
const setSelect = (name, v) => {
  const f = fields.get(name);
  if (f instanceof PDFDropdown && v) {
    try { f.select(v); } catch { /* ignore */ }
  }
};

// PA
setText('Nom du PTA', data.pa.name);
setText('N° de PTA', data.pa.number);
setText('Interlocuteur PTA', data.pa.contactName);
setText('Adresse PTA', data.pa.address);
setText('Code Postal (PTA)', data.pa.postalCode);
setText('Ville (PTA)', data.pa.city);
setText('N° de Téléphone PTA', fmtPhone(data.pa.phone));
setText('Adresse Email PTA', data.pa.email);

// Entreprise
setText("Nom / Raison Sociale de L'entreprise (Entreprise)", data.entreprise.raisonSociale);
setText("Nom commercial de l'entreprise (Entreprise)", data.entreprise.nomCommercial);
setText('Code APE - NAF (Entreprise)', data.entreprise.naf);
setText('N° SIRET (Entreprise)', data.entreprise.siret);
setText('Activité Professionnelle (Entreprise)', data.entreprise.activite);
setSelect('Forme juridique (Entreprise)', FORME[data.entreprise.formeJuridique] ?? 'AUTRE');
setText('Adresse Entreprise', data.entreprise.address);
setText('Code Postal (Entreprise)', data.entreprise.postalCode);
setText('Ville (Entreprise)', data.entreprise.city);

// Stagiaire
setCheck('MR (Stagiaire)', data.stagiaire.civilite === 'MR');
setCheck('MME (Stagiaire)', data.stagiaire.civilite === 'MME');
setText('Nom (Stagiaire)', data.stagiaire.nom);
setText('Prénom  (Stagiaire)', data.stagiaire.prenom);
setText('Nom de naissance  (Stagiaire)', data.stagiaire.nomNaissance);
setText('Date de Naissance  (Stagiaire)', fmtDateFr(data.stagiaire.dateNaissance));
setText('N° de Sécurité Sociale  (Stagiaire)', fmtSecu(data.stagiaire.securiteSociale));
setText('N° de Téléphone  (Stagiaire)', fmtPhone(data.stagiaire.phone));
setText('Adresse Email  (Stagiaire)', data.stagiaire.email);
setCheck('< 1an', data.stagiaire.experience === 'MOINS_1_AN');
setCheck('1 à 3 ans', data.stagiaire.experience === '1_3_ANS');
setCheck('4-10 ans', data.stagiaire.experience === '4_10_ANS');
setCheck('+ de 10 ans', data.stagiaire.experience === 'PLUS_10_ANS');

// OF
setText('Raison Sociale ( OF)', data.of.name);
setText('NDA (OF)', data.of.rnq);
setText('N° SIRET (OF)', data.of.siret);
setText('Adresse (OF)', data.of.addressStreet);
setText('Code Postal (OF)', data.of.addressCp);
setText('Ville (OF)', data.of.addressVille);
setCheck('MR (Resp.OF)', data.of.resp.civilite === 'MR');
setCheck('MME (Resp.OF)', data.of.resp.civilite === 'MME');
setText('Nom Responsable (OF)', data.of.resp.nom);
setText('Prénom Responsable (OF)', data.of.resp.prenom);
setText('N° de Téléphone - Responsable (OF)', fmtPhone(data.of.resp.phone));
setText('Adresse Email - Responsable (OF)', data.of.resp.email);
setCheck('MR (Contact OF)', data.of.contact.civilite === 'MR');
setCheck('MME (Contact OF)', data.of.contact.civilite === 'MME');
setText('Nom - Contact (OF)', data.of.contact.nom);
setText('Prénom - Contact (OF)', data.of.contact.prenom);
setText('N° de Téléphone - Contact (OF)', fmtPhone(data.of.contact.phone));
setText('Adresse Email - Contact (OF)', data.of.contact.email);

// Type formation
setCheck('Action de Formation', data.formationType === 'ACTION');
setCheck('Bilan de Compétences', data.formationType === 'BILAN');
setCheck('VAE', data.formationType === 'VAE');
setCheck('obligatoire (Oui)', data.obligatoire === true);
setCheck('Obligatoire (Non)', data.obligatoire === false);
setCheck('Reconversion (Oui)', data.reconversion === true);
setCheck('reconversion ( Non)', data.reconversion === false);

// Formation
setText('Intitulé Exact ( Formation)', data.formation.intitule);
setText('Thématique (Formation)', data.formation.thematique);
setCheck('Initiation', data.formation.niveau === 'INITIATION');
setCheck('Mise à jour', data.formation.niveau === 'MISE_A_JOUR');
setCheck('Perfectionnement', data.formation.niveau === 'PERFECTIONNEMENT');
setCheck('Titre Homologué', data.formation.certif === 'TITRE_HOMOLOGUE');
setCheck('Qualif Branche', data.formation.certif === 'QUALIF_BRANCHE');
setCheck('CQP', data.formation.certif === 'CQP');
setCheck('Sans Qualification', data.formation.certif === 'SANS_QUALIFICATION');
setText('Date de Début (Formation)', fmtDateFr(data.formation.dateDebut));
setText('Date de Fin (Formation)', fmtDateFr(data.formation.dateFin));
setText('Durée ( Présentiel Individuel - Formation)', fmtNumber(data.formation.dureePresentielIndividuel));
setText('Durée ( Présentiel Collectif - Formation)', fmtNumber(data.formation.dureePresentielCollectif));
setText('Durée ( FOAD Synchrone - Formation)', fmtNumber(data.formation.dureeFoadSynchrone));
setText('Durée ( FOAD Asynchrone - Formation)', fmtNumber(data.formation.dureeFoadAsynchrone));
setText('Nom du formateur', data.formation.formateur);
setText('Code Postal (Lieu de Formation)', data.formation.lieuPostalCode);
setText('Ville (Lieu de Formation)', data.formation.lieuVille);
setText('Prix Ht (Formation)', fmtNumber(data.formation.prixHT, 2));
setCheck('Form en Entreprise (Oui)', data.formation.enEntreprise === true);
setCheck('Form en Entreprise (Non)', data.formation.enEntreprise === false);
setText('Nom et Adresse exacte du lieu de formation', data.formation.lieuAdresseComplete);
setText('Déroulement Pédagogique (Formation) - 1 -', data.formation.deroulementPedago);

// Évaluations
const evals = new Set(data.evaluations);
setCheck('Quiz', evals.has('QUIZ'));
setCheck('Contrôle continu', evals.has('CONTROLE_CONTINU'));
setCheck('Relevés', evals.has('RELEVES'));
setCheck('Feuilles de présence', evals.has('FEUILLES_PRESENCE'));
setCheck('Autre', evals.has('AUTRE'));
setText('Si Autre : Préciser', data.evaluationAutreDetail);
setCheck('RNCP', data.attestation === 'RNCP');
setCheck('Autre Diplôme', data.attestation === 'AUTRE_DIPLOME');
setCheck('Diplôme Etat', data.attestation === 'DIPLOME_ETAT');
setCheck('Attestation de Stage', data.attestation === 'ATTESTATION_STAGE');
setCheck('Mandat (Oui)', data.mandat === true);

// Signature
setText('Lieu de Signature', data.signature.lieu);
setText('Date de Signature', fmtDateFr(data.signature.date));

// Signature OF (image PNG) apposée page 2 zone "L'OF lu et approuvé"
const sigBytes = await fs.readFile(SIGNATURE);
const sigImage = await pdf.embedPng(sigBytes);
const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
const pages = pdf.getPages();
const sigPage = pages[2] ?? pages.at(-1);
const blockX = 365, blockY = 110, blockW = 170;
const sigW = 90;
const sigH = (sigImage.height / sigImage.width) * sigW;
const sigX = blockX + (blockW - sigW) / 2;
sigPage.drawText(`${data.of.resp.prenom} ${data.of.resp.nom},`, { x: blockX + 10, y: blockY + sigH + 14, size: 9, font: fontBold, color: rgb(0,0,0) });
sigPage.drawText(data.of.resp.titre, { x: blockX + 10, y: blockY + sigH + 2, size: 9, font: fontItalic, color: rgb(0,0,0) });
sigPage.drawImage(sigImage, { x: sigX, y: blockY, width: sigW, height: sigH });

const out = await pdf.save({ updateFieldAppearances: true });
const outPath = '/tmp/agefice-test-caroline.pdf';
await fs.writeFile(outPath, out);
console.log(`✓ PDF généré : ${outPath}  (${(out.length / 1024).toFixed(1)} Kb)`);

// Vérif : recharger et lister les valeurs renseignées
const check = await PDFDocument.load(out);
const checkForm = check.getForm();
let filled = 0, total = 0;
for (const f of checkForm.getFields()) {
  total++;
  if (f instanceof PDFTextField && f.getText()) filled++;
  else if (f instanceof PDFCheckBox && f.isChecked()) filled++;
  else if (f instanceof PDFDropdown && f.getSelected().length) filled++;
}
console.log(`✓ ${filled}/${total} champs renseignés`);

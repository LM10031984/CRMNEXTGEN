/**
 * AGEFICE V2 — remplit le formulaire officiel AGEFICE (PDF avec form fields)
 * directement avec pdf-lib, en lieu et place du récapitulatif HTML V1.
 *
 * Le PDF source vit dans `apps/web/src/assets/agefice-template.pdf` et expose
 * 92 champs nommés (text fields, dropdowns, checkboxes). On mappe les champs
 * un à un : ce qui est inconnu reste vide pour signature manuelle.
 */

import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, StandardFonts, rgb } from 'pdf-lib';
import path from 'node:path';
import fs from 'node:fs/promises';

import type { OfConfig } from './of-config';

const SIGNATURE_FILENAME = 'signature-laurent.png';

// ──────────────────────────────────────────────────────────────────────────────
// Types

export type Civilite = 'MR' | 'MME';

export type FormationCertif = 'TITRE_HOMOLOGUE' | 'QUALIF_BRANCHE' | 'CQP' | 'SANS_QUALIFICATION';
export type FormationNiveau = 'INITIATION' | 'MISE_A_JOUR' | 'PERFECTIONNEMENT';
export type FormationType = 'ACTION' | 'BILAN' | 'VAE';
export type AttestationType = 'RNCP' | 'AUTRE_DIPLOME' | 'DIPLOME_ETAT' | 'ATTESTATION_STAGE';
export type EvaluationType = 'QUIZ' | 'CONTROLE_CONTINU' | 'RELEVES' | 'FEUILLES_PRESENCE' | 'AUTRE';
export type ExperienceTranche = 'MOINS_1_AN' | '1_3_ANS' | '4_10_ANS' | 'PLUS_10_ANS';

export interface AgeficeFormData {
  // ── Point d'Accueil AGEFICE ────────────────────────────────────
  pa: {
    name: string;
    number: string | null;
    contactName: string | null;     // "Virginie BEHIN"
    address: string | null;
    postalCode: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  };

  // ── Entreprise (auto-entreprise / EI du stagiaire) ─────────────
  entreprise: {
    raisonSociale: string;
    nomCommercial: string | null;
    naf: string | null;
    siret: string | null;
    activite: string | null;
    formeJuridique: string;          // valeur exacte du dropdown PDF
    address: string | null;
    postalCode: string | null;
    city: string | null;
  };

  // ── Stagiaire ──────────────────────────────────────────────────
  stagiaire: {
    civilite: Civilite | null;
    nom: string;
    prenom: string;
    nomNaissance: string | null;
    dateNaissance: Date | null;
    securiteSociale: string | null;  // 13 chiffres (le PDF accepte 13 max)
    phone: string | null;
    email: string | null;
    diplome: string | null;          // valeur exacte du dropdown
    experience: ExperienceTranche | null;
  };

  // ── OF (Resp + Contact) ────────────────────────────────────────
  of: OfConfig;

  // ── Type de formation + caractère ──────────────────────────────
  formationType: FormationType;
  obligatoire: boolean | null;       // null = aucune case cochée
  reconversion: boolean | null;

  // ── Détails formation ──────────────────────────────────────────
  formation: {
    intitule: string;
    thematique: string | null;
    niveau: FormationNiveau;
    certif: FormationCertif;
    dateDebut: Date;
    dateFin: Date;
    dureePresentielIndividuel: number;
    dureePresentielCollectif: number;
    dureeFoadSynchrone: number;
    dureeFoadAsynchrone: number;
    formateur: string;
    lieuPostalCode: string | null;
    lieuVille: string | null;
    lieuAdresseComplete: string | null;
    prixHT: number;
    enEntreprise: boolean | null;    // null = aucune case
    deroulementPedago: string | null;
  };

  // ── Évaluation & validation ────────────────────────────────────
  evaluations: EvaluationType[];     // cases à cocher multiples
  evaluationAutreDetail: string | null;
  attestation: AttestationType;
  mandat: boolean | null;

  // ── Signature ──────────────────────────────────────────────────
  signature: {
    lieu: string | null;
    date: Date | null;               // null = laissé vide pour signature manuscrite
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers

const fmtDateFr = (d: Date | null): string => {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const fmtNumber = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || Number.isNaN(n)) return '';
  return decimals > 0 ? n.toFixed(decimals).replace('.', ',') : String(Math.round(n));
};

const fmtPhone = (s: string | null | undefined): string => {
  if (!s) return '';
  // Le PDF a maxLen=10 sur les téléphones → on sort les 10 chiffres bruts
  return s.replace(/\D/g, '').slice(0, 10);
};

const fmtSecu = (s: string | null | undefined): string => {
  if (!s) return '';
  // maxLen=13 → on sort les 13 chiffres (sans la clé)
  return s.replace(/\D/g, '').slice(0, 13);
};

// ──────────────────────────────────────────────────────────────────────────────
// Mapping des valeurs vers les options exactes du PDF

const FORME_JURIDIQUE_MAP: Record<string, string> = {
  EI: 'ENTREPRISE INDIVIDUELLE',
  AUTO_ENTREPRENEUR: 'MICRO-ENTREPRISE / AUTO-ENTREPRISE',
  MICRO_ENTREPRISE: 'MICRO-ENTREPRISE / AUTO-ENTREPRISE',
  EIRL: 'EIRL',
  SARL: 'SARL',
  SA: 'SA',
  SAS: 'SAS',
  SASU: 'SASU',
};

function resolveFormeJuridique(v: string | null | undefined): string {
  if (!v) return '';
  const up = v.toUpperCase().replace(/[ -]/g, '_');
  return FORME_JURIDIQUE_MAP[up] ?? 'AUTRE';
}

const DIPLOME_OPTIONS = [
  'Fin de scolarité obligatoire',
  'BEP-CAP',
  'Bac-Bac pro-BT-BP',
  'Bac+2 : BTS-DUT-DEUG',
  'Bac+3 : Licence ou maîtrise',
  'Bac+5 : Supérieur à la maîtrise',
];

function resolveDiplome(v: string | null | undefined): string {
  if (!v) return '';
  const exact = DIPLOME_OPTIONS.find((o) => o === v);
  if (exact) return exact;
  // Heuristique : matching par mots-clés sur le texte libre Person.diplomas
  const lower = v.toLowerCase();
  if (lower.includes('bac+5') || lower.includes('master') || lower.includes('ingénieur')) return DIPLOME_OPTIONS[5]!;
  if (lower.includes('bac+3') || lower.includes('licence') || lower.includes('maîtrise')) return DIPLOME_OPTIONS[4]!;
  if (lower.includes('bac+2') || lower.includes('bts') || lower.includes('dut') || lower.includes('deug')) return DIPLOME_OPTIONS[3]!;
  if (lower.includes('bac pro') || lower.includes('bac-bac') || lower.match(/\bbac\b/)) return DIPLOME_OPTIONS[2]!;
  if (lower.includes('bep') || lower.includes('cap')) return DIPLOME_OPTIONS[1]!;
  if (lower.includes('aucun') || lower.includes('sans')) return DIPLOME_OPTIONS[0]!;
  return '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers d'écriture sur le formulaire (no-op si le champ n'existe pas)

interface FormSetters {
  text(name: string, value: string | null | undefined): void;
  check(name: string, on: boolean): void;
  select(name: string, value: string | null | undefined): void;
}

/**
 * Le PDF AGEFICE utilise la police WinAnsi (cp1252) qui ne supporte pas
 * l'Unicode. Avant injection on remplace les caractères courants posant
 * problème (●, ✓, fines, em-dashes, etc.) par leur équivalent ASCII.
 * Les caractères restants hors plage 0x20-0xFF sont strippés.
 */
function sanitizeWinAnsi(s: string): string {
  return s
    .replace(/[●•▪◦]/g, '-')
    .replace(/[✓✔]/g, 'OK')
    .replace(/[✗✘]/g, 'X')
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')         // espace insécable → espace
    .replace(/[ -​]/g, ' ') // espaces fines
    // Strip tout caractère hors WinAnsi (cp1252 ≈ 0x20-0xFF sauf 0x80-0x9F).
    .replace(/[^\x20-\x7E -ÿ]/g, '');
}

function buildSetters(form: ReturnType<PDFDocument['getForm']>): FormSetters {
  const fields = new Map(form.getFields().map((f) => [f.getName(), f]));
  return {
    text(name, value) {
      const f = fields.get(name);
      if (f instanceof PDFTextField && value != null) {
        f.setText(sanitizeWinAnsi(String(value)));
      }
    },
    check(name, on) {
      const f = fields.get(name);
      if (f instanceof PDFCheckBox) {
        on ? f.check() : f.uncheck();
      }
    },
    select(name, value) {
      const f = fields.get(name);
      if (f instanceof PDFDropdown && value) {
        try {
          f.select(value);
        } catch {
          // Valeur invalide : on ignore plutôt que crasher la génération.
        }
      }
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// API publique

let templateCache: Buffer | null = null;

async function loadTemplate(): Promise<Buffer> {
  if (templateCache) return templateCache;
  const p = path.join(process.cwd(), 'src', 'assets', 'agefice-template.pdf');
  templateCache = await fs.readFile(p);
  return templateCache;
}

async function loadSignature(): Promise<Buffer | null> {
  const p = path.join(process.cwd(), 'src', 'assets', SIGNATURE_FILENAME);
  try {
    return await fs.readFile(p);
  } catch {
    return null;
  }
}

/**
 * Appose la signature pré-enregistrée + nom/titre du Resp OF dans la zone
 * "L'OF — Cachet, date et signature" du formulaire AGEFICE (page 2 du template).
 */
async function applyOfSignature(
  pdf: PDFDocument,
  resp: { nom: string; prenom: string; titre: string },
): Promise<void> {
  const sigBytes = await loadSignature();
  if (!sigBytes) return; // pas de signature configurée → on ne fait rien

  const sigImage = await pdf.embedPng(sigBytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Page de signature OF (page 3 — bas droite, sous le bloc "Nom, prénom, qualité au
  // sein de l'organisme de formation et signature du représentant de l'OF")
  const pages = pdf.getPages();
  const page = pages[2] ?? pages[pages.length - 1]!;

  // Bloc en bas DROITE de la page 3, dans l'espace blanc sous le bloc texte
  // "Nom, prénom, qualité au sein de l'OF…" (origine bas-gauche, A4 = 595 × 842)
  const blockX = 365;
  const blockY = 110;
  const blockW = 170;

  // Nom + titre juste au-dessus de la signature (sanitizés pour WinAnsi)
  const nameLine = sanitizeWinAnsi(`${resp.prenom} ${resp.nom},`);
  const titleLine = sanitizeWinAnsi(resp.titre);
  // Signature : largeur réduite à 90pt pour ne pas déborder sur le texte du bloc imprimé
  const sigWidth = 90;
  const sigHeight = (sigImage.height / sigImage.width) * sigWidth;
  const sigX = blockX + (blockW - sigWidth) / 2;
  const sigY = blockY;

  // Texte au-dessus de la signature
  page.drawText(nameLine, {
    x: blockX + 10,
    y: blockY + sigHeight + 14,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText(titleLine, {
    x: blockX + 10,
    y: blockY + sigHeight + 2,
    size: 9,
    font: fontItalic,
    color: rgb(0, 0, 0),
  });

  page.drawImage(sigImage, { x: sigX, y: sigY, width: sigWidth, height: sigHeight });
}

export async function fillAgeficePdf(data: AgeficeFormData): Promise<Buffer> {
  const bytes = await loadTemplate();
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const set = buildSetters(form);

  // ── Section PA AGEFICE ────────────────────────────────────────
  set.text('Nom du PTA', data.pa.name);
  set.text('N° de PTA', data.pa.number);
  set.text('Interlocuteur PTA', data.pa.contactName);
  set.text('Adresse PTA', data.pa.address);
  set.text('Code Postal (PTA)', data.pa.postalCode);
  set.text('Ville (PTA)', data.pa.city);
  set.text('N° de Téléphone PTA', fmtPhone(data.pa.phone));
  set.text('Adresse Email PTA', data.pa.email);

  // ── Section Entreprise ────────────────────────────────────────
  set.text("Nom / Raison Sociale de L'entreprise (Entreprise)", data.entreprise.raisonSociale);
  set.text("Nom commercial de l'entreprise (Entreprise)", data.entreprise.nomCommercial);
  set.text('Code APE - NAF (Entreprise)', data.entreprise.naf);
  set.text('N° SIRET (Entreprise)', data.entreprise.siret);
  set.text('Activité Professionnelle (Entreprise)', data.entreprise.activite);
  set.select('Forme juridique (Entreprise)', resolveFormeJuridique(data.entreprise.formeJuridique));
  set.text('Adresse Entreprise', data.entreprise.address);
  set.text('Code Postal (Entreprise)', data.entreprise.postalCode);
  set.text('Ville (Entreprise)', data.entreprise.city);

  // ── Section Stagiaire ─────────────────────────────────────────
  set.check('MR (Stagiaire)', data.stagiaire.civilite === 'MR');
  set.check('MME (Stagiaire)', data.stagiaire.civilite === 'MME');
  set.text('Nom (Stagiaire)', data.stagiaire.nom);
  set.text('Prénom  (Stagiaire)', data.stagiaire.prenom);
  set.text('Nom de naissance  (Stagiaire)', data.stagiaire.nomNaissance);
  set.text('Date de Naissance  (Stagiaire)', fmtDateFr(data.stagiaire.dateNaissance));
  set.text('N° de Sécurité Sociale  (Stagiaire)', fmtSecu(data.stagiaire.securiteSociale));
  set.text('N° de Téléphone  (Stagiaire)', fmtPhone(data.stagiaire.phone));
  set.text('Adresse Email  (Stagiaire)', data.stagiaire.email);
  set.select('Sélectionner le dernier diplôme obtenu', resolveDiplome(data.stagiaire.diplome));
  set.check('< 1an', data.stagiaire.experience === 'MOINS_1_AN');
  set.check('1 à 3 ans', data.stagiaire.experience === '1_3_ANS');
  set.check('4-10 ans', data.stagiaire.experience === '4_10_ANS');
  set.check('+ de 10 ans', data.stagiaire.experience === 'PLUS_10_ANS');

  // ── Section OF ────────────────────────────────────────────────
  set.text('Raison Sociale ( OF)', data.of.name);
  set.text('NDA (OF)', data.of.rnq);
  set.text('N° SIRET (OF)', data.of.siret);
  set.text('Adresse (OF)', data.of.addressStreet);
  set.text('Code Postal (OF)', data.of.addressCp);
  set.text('Ville (OF)', data.of.addressVille);
  set.check('MR (Resp.OF)', data.of.resp.civilite === 'MR');
  set.check('MME (Resp.OF)', data.of.resp.civilite === 'MME');
  set.text('Nom Responsable (OF)', data.of.resp.nom);
  set.text('Prénom Responsable (OF)', data.of.resp.prenom);
  set.text('N° de Téléphone - Responsable (OF)', fmtPhone(data.of.resp.phone));
  set.text('Adresse Email - Responsable (OF)', data.of.resp.email);
  set.check('MR (Contact OF)', data.of.contact.civilite === 'MR');
  set.check('MME (Contact OF)', data.of.contact.civilite === 'MME');
  set.text('Nom - Contact (OF)', data.of.contact.nom);
  set.text('Prénom - Contact (OF)', data.of.contact.prenom);
  set.text('N° de Téléphone - Contact (OF)', fmtPhone(data.of.contact.phone));
  set.text('Adresse Email - Contact (OF)', data.of.contact.email);

  // ── Type de formation + caractère ─────────────────────────────
  set.check('Action de Formation', data.formationType === 'ACTION');
  set.check('Bilan de Compétences', data.formationType === 'BILAN');
  set.check('VAE', data.formationType === 'VAE');
  set.check('obligatoire (Oui)', data.obligatoire === true);
  set.check('Obligatoire (Non)', data.obligatoire === false);
  set.check('Reconversion (Oui)', data.reconversion === true);
  set.check('reconversion ( Non)', data.reconversion === false);

  // ── Section Formation ─────────────────────────────────────────
  set.text('Intitulé Exact ( Formation)', data.formation.intitule);
  set.text('Thématique (Formation)', data.formation.thematique);
  set.check('Initiation', data.formation.niveau === 'INITIATION');
  set.check('Mise à jour', data.formation.niveau === 'MISE_A_JOUR');
  set.check('Perfectionnement', data.formation.niveau === 'PERFECTIONNEMENT');
  set.check('Titre Homologué', data.formation.certif === 'TITRE_HOMOLOGUE');
  set.check('Qualif Branche', data.formation.certif === 'QUALIF_BRANCHE');
  set.check('CQP', data.formation.certif === 'CQP');
  set.check('Sans Qualification', data.formation.certif === 'SANS_QUALIFICATION');
  set.text('Date de Début (Formation)', fmtDateFr(data.formation.dateDebut));
  set.text('Date de Fin (Formation)', fmtDateFr(data.formation.dateFin));
  set.text('Durée ( Présentiel Individuel - Formation)', fmtNumber(data.formation.dureePresentielIndividuel));
  set.text('Durée ( Présentiel Collectif - Formation)', fmtNumber(data.formation.dureePresentielCollectif));
  set.text('Durée ( FOAD Synchrone - Formation)', fmtNumber(data.formation.dureeFoadSynchrone));
  set.text('Durée ( FOAD Asynchrone - Formation)', fmtNumber(data.formation.dureeFoadAsynchrone));
  set.text('Nom du formateur', data.formation.formateur);
  set.text('Code Postal (Lieu de Formation)', data.formation.lieuPostalCode);
  set.text('Ville (Lieu de Formation)', data.formation.lieuVille);
  set.text('Prix Ht (Formation)', fmtNumber(data.formation.prixHT, 2));
  set.check('Form en Entreprise (Oui)', data.formation.enEntreprise === true);
  set.check('Form en Entreprise (Non)', data.formation.enEntreprise === false);
  set.text('Nom et Adresse exacte du lieu de formation', data.formation.lieuAdresseComplete);
  set.text('Déroulement Pédagogique (Formation) - 1 -', data.formation.deroulementPedago);

  // ── Évaluation & validation ───────────────────────────────────
  const evals = new Set(data.evaluations);
  set.check('Quiz', evals.has('QUIZ'));
  set.check('Contrôle continu', evals.has('CONTROLE_CONTINU'));
  set.check('Relevés', evals.has('RELEVES'));
  set.check('Feuilles de présence', evals.has('FEUILLES_PRESENCE'));
  set.check('Autre', evals.has('AUTRE'));
  set.text('Si Autre : Préciser', data.evaluationAutreDetail);
  set.check('RNCP', data.attestation === 'RNCP');
  set.check('Autre Diplôme', data.attestation === 'AUTRE_DIPLOME');
  set.check('Diplôme Etat', data.attestation === 'DIPLOME_ETAT');
  set.check('Attestation de Stage', data.attestation === 'ATTESTATION_STAGE');
  set.check('Mandat (Oui)', data.mandat === true);

  // ── Signature ─────────────────────────────────────────────────
  set.text('Lieu de Signature', data.signature.lieu);
  set.text('Date de Signature', fmtDateFr(data.signature.date));

  // Signature OF apposée par-dessus le formulaire (image + nom/titre)
  await applyOfSignature(pdf, {
    nom: data.of.resp.nom,
    prenom: data.of.resp.prenom,
    titre: data.of.resp.titre,
  });

  // On laisse les champs ré-éditables (pas de form.flatten()) pour permettre
  // à Laurent ou au stagiaire de corriger / signer manuellement après coup.
  const out = await pdf.save({ updateFieldAppearances: true });
  return Buffer.from(out);
}

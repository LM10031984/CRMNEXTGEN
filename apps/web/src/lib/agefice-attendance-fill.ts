/**
 * BUG-12 — Attestation d'assiduité AGEFICE (modèle officiel janvier 2023).
 *
 * Remplit les 27 form fields du PDF AGEFICE-Modele-attestation-d-assiduite-
 * reglement-janvier-2023-editable.pdf via pdf-lib.
 *
 * Pattern : clone-light de agefice-form-fill.ts (92 fields → 27 ici).
 * Les noms de fields incluent des espaces parasites du PDF source — pas
 * un typo (cf FIELDS-MAPPING.md).
 *
 * V1 minimal : les 4 champs "RéaliséeDurée*" restent vides (édition manuelle
 * sur le PDF formulaire — pas d'Attendance calculée encore). "Somme lettres"
 * vide aussi (helper numberToFrenchWords V2).
 */

import { PDFDocument, PDFTextField } from 'pdf-lib';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface AgeficeAttendanceData {
  // ── Formation ──────────────────────────────────────────────────
  formationIntitule: string;
  formationDateDebut: Date;
  formationDateFin: Date;

  // ── Formateur ──────────────────────────────────────────────────
  formateurNomQualite: string | null;

  // ── Organisme de formation (OF) ────────────────────────────────
  ofRaisonSociale: string;
  ofNumeroDeclaration: string;
  ofRegion: string;
  ofResponsablePrenomNom: string;
  ofResponsableQualite: string;
  ofLieuDelivrance: string;

  // ── Stagiaire ──────────────────────────────────────────────────
  stagiaireNomPrenom: string;

  // ── Entreprise du stagiaire (auto-entreprise / EI) ─────────────
  entrepriseRaisonSociale: string | null;

  // ── Durées (heures, 4 modalités) ──────────────────────────────
  /** Prévues = sum = formation.durationHours, ventilées par splitDureeByModality */
  prevuePresIndividuel: number;
  prevuePresCollectif: number;
  prevueFoadSync: number;
  prevueFoadAsync: number;

  /** Réalisées = à remplir manuellement V1 (laissées vides) */
  realiseePresIndividuel: number | null;
  realiseePresCollectif: number | null;
  realiseeFoadSync: number | null;
  realiseeFoadAsync: number | null;

  // ── Règlement (facture) ────────────────────────────────────────
  sommeChiffres: number | null;
  sommeLettres: string | null; // V1 : laissé vide (helper en lettres TODO)
  modeReglement: string; // ex "Virement bancaire"
  dateReglement: Date | null; // null si pas encore payé

  // ── Délivrance attestation ─────────────────────────────────────
  dateDelivrance: Date; // = today
}

function fmtDateFr(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function fmtNumber(n: number | null | undefined): string | null {
  if (n == null) return null;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtHours(n: number | null | undefined): string | null {
  if (n == null || n === 0) return null;
  // Format heures décimal ou entier (ex "8" ou "7.5")
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace('.', ',');
}

// Strip caractères non-WinAnsi (PDF AGEFICE refuse les unicode hors cp1252).
function sanitizeWinAnsi(s: string): string {
  return s
    .replace(/[●•▪◦]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E -ÿ]/g, '');
}

const TEMPLATE_PATH = path.join(
  process.cwd(),
  'public',
  'templates',
  'agefice',
  'attestation-assiduite-2023.pdf',
);

let templateCache: Buffer | null = null;

async function loadTemplate(): Promise<Buffer> {
  if (templateCache) return templateCache;
  templateCache = await fs.readFile(TEMPLATE_PATH);
  return templateCache;
}

export async function fillAgeficeAttendancePdf(
  data: AgeficeAttendanceData,
): Promise<Buffer> {
  const bytes = await loadTemplate();
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const fields = new Map(form.getFields().map((f) => [f.getName(), f]));

  function setText(name: string, value: string | null | undefined) {
    const f = fields.get(name);
    if (f instanceof PDFTextField && value != null && value !== '') {
      f.setText(sanitizeWinAnsi(value));
    }
  }

  // ── Formation ──────────────────────────────────────────────────
  // Noms de fields verbatim du PDF (espaces parasites inclus, cf FIELDS-MAPPING.md)
  setText('Int i tu l é de format i on', data.formationIntitule);
  setText('Date de démarrage', fmtDateFr(data.formationDateDebut));
  setText('Date de f i n', fmtDateFr(data.formationDateFin));

  // ── Formateur ──────────────────────────────────────────────────
  setText('Nom et qua l i té du formateur', data.formateurNomQualite);

  // ── Responsable OF ─────────────────────────────────────────────
  setText('Nom Prénom responsable OF', data.ofResponsablePrenomNom);
  setText('Qualité responsable OF', data.ofResponsableQualite);
  setText('Raison sociale de l’organisme de formation', data.ofRaisonSociale);
  setText('Numéro de déclaration d’activité', data.ofNumeroDeclaration);
  setText('Région', data.ofRegion);

  // ── Stagiaire + entreprise ─────────────────────────────────────
  setText('Nom Prénom Stagiaire', data.stagiaireNomPrenom);
  setText('Raison sociale entreprise', data.entrepriseRaisonSociale);

  // ── Durées Prévues (4 modalités) ───────────────────────────────
  setText('PrévueDurée en présentiel Individuel', fmtHours(data.prevuePresIndividuel));
  setText('PrévueDurée en présentiel Collectif', fmtHours(data.prevuePresCollectif));
  setText('PrévueDurée en FOAD Synchrone', fmtHours(data.prevueFoadSync));
  setText('PrévueDurée en FOAD Asynchrone', fmtHours(data.prevueFoadAsync));

  // ── Durées Réalisées (V1 : vides — édition manuelle) ──────────
  setText('RéaliséeDurée en présentiel Individuel', fmtHours(data.realiseePresIndividuel));
  setText('RéaliséeDurée en présentiel Collectif', fmtHours(data.realiseePresCollectif));
  setText('RéaliséeDurée en FOAD Synchrone', fmtHours(data.realiseeFoadSync));
  setText('RéaliséeDurée en FOAD Asynchrone', fmtHours(data.realiseeFoadAsync));

  // ── Règlement ──────────────────────────────────────────────────
  setText('Somme chiffres', fmtNumber(data.sommeChiffres));
  setText('Somme lettres', data.sommeLettres);
  setText('Mode règlement', data.modeReglement);
  setText('Date règlement', fmtDateFr(data.dateReglement));

  // ── Délivrance ─────────────────────────────────────────────────
  setText('Lieu de délivrance attestation', data.ofLieuDelivrance);
  setText('Date de délivrance attestation_es_:date', fmtDateFr(data.dateDelivrance));

  // ── Bandeaux signature ─────────────────────────────────────────
  setText('Nom Prénom Qualité responsable OF', `${data.ofResponsablePrenomNom} — ${data.ofResponsableQualite}`);
  setText('Nom Prénom Qualité stagiaire', `${data.stagiaireNomPrenom} — Stagiaire`);

  const out = await pdf.save();
  return Buffer.from(out);
}

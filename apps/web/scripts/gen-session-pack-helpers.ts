/**
 * Helpers PURS du pipeline _gen-session-pack.ts.
 *
 * Aucun import IO (fs), Prisma ni LLM ici : ce module est importable depuis les
 * tests Vitest SANS déclencher tout le pipeline. Le script principal importe
 * ces helpers et y branche les chemins Drive + le filtrage des kinds.
 */

import { isFroidEligible } from '../src/lib/closure/satisfaction-froid-eligibility';

/** Kinds par-participant du pack closure (DEROULE_PEDA exclu = doc session). */
export const PART_KINDS = [
  'ANALYSE_BESOIN',
  'POSITIONNEMENT',
  'QCM',
  'GRILLE_OBS',
  'ATTESTATION',
  'CERTIFICAT',
  'EMARGEMENT',
  'SATISFACTION_CHAUD',
  'SATISFACTION_FROID',
] as const;

export type PartKind = (typeof PART_KINDS)[number];

/** Noms de fichiers FR par kind closure (sortie Drive). */
export const KIND_FR: Record<string, string> = {
  ANALYSE_BESOIN: 'Analyse de besoin',
  POSITIONNEMENT: 'Positionnement',
  QCM: 'QCM',
  GRILLE_OBS: "Grille d'observation",
  ATTESTATION: 'Attestation de fin de formation',
  CERTIFICAT: 'Certificat de réalisation',
  EMARGEMENT: 'Émargement',
  SATISFACTION_CHAUD: 'Satisfaction à chaud',
  SATISFACTION_FROID: 'Satisfaction à froid',
};

/** Noms de fichiers FR des docs racine session. */
export const ROOT_FILE_PROGRAMME = 'Programme.pdf';
export const ROOT_FILE_DEROULE = 'Déroulé pédagogique.pdf';
export const ROOT_FILE_CHECKLIST = 'Checklist de préparation.pdf';
export const LEARNER_FILE_CONVENTION = 'Convention de formation.pdf';

/**
 * Retire les caractères interdits en nom de fichier (/ \ : * ? " < > |) et
 * collapse les espaces. Déterministe (idempotent : 2× = même résultat).
 */
export function sanitize(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * Date → 'JJ-MM-AAAA' en UTC (pas de décalage de fuseau, padStart à 2/4).
 */
export function formatDateFR(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  return `${day}-${month}-${year}`;
}

/**
 * Filtre les kinds par-participant selon l'éligibilité froid : SATISFACTION_FROID
 * n'est conservé QUE si la session est éligible (≥90j). Le test de puissance
 * (retrait du filtre) doit virer rouge.
 */
export function kindsForFroid(froidEligible: boolean): PartKind[] {
  return froidEligible ? [...PART_KINDS] : PART_KINDS.filter((k) => k !== 'SATISFACTION_FROID');
}

export interface LearnerName {
  prenom: string;
  nom: string;
}

export interface SessionPaths {
  /** Dossier racine de la session : `${driveBase}/${title} (JJ-MM-AAAA)`. */
  rootDir: string;
  /** Fichiers déposés à la RACINE du dossier session (jamais chez l'apprenant). */
  rootFiles: string[];
  /** Un sous-dossier par apprenant (Convention + docs du pack closure). */
  learnerDirs: string[];
}

/**
 * Calcule (sans aucun fs/prisma) l'arborescence Drive d'une session :
 *  - racine = Programme / Déroulé / Checklist
 *  - 1 sous-dossier par apprenant
 * Déterministe : 2 appels avec les mêmes entrées → mêmes chemins (pas de
 * suffixe « (1) »).
 */
export function buildSessionPaths(
  driveBase: string,
  productTitle: string,
  startDate: Date,
  learners: LearnerName[],
): SessionPaths {
  const rootDir = `${driveBase}/${sanitize(`${productTitle} (${formatDateFR(startDate)})`)}`;
  return {
    rootDir,
    rootFiles: [ROOT_FILE_PROGRAMME, ROOT_FILE_DEROULE, ROOT_FILE_CHECKLIST],
    learnerDirs: learners.map((l) => `${rootDir}/${sanitize(`${l.prenom} ${l.nom}`)}`),
  };
}

// Ré-export pour usage direct depuis le script principal.
export { isFroidEligible };

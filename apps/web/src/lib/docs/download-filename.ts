/**
 * Nom de fichier lisible pour TOUT document téléchargé depuis QualiOF.
 *
 * Problème résolu (Laurent 2026-09-08) : « quand on télécharge les documents,
 * ça serait bien qu'ils aient des noms plus parlants — pour Stéphane Rousseau
 * j'ai "Rousseau Stéphane 24-96-3C95" ». En production, les routes de
 * téléchargement redirigent (302) vers une signed URL Supabase : le
 * `Content-Disposition` posé par la route n'est JAMAIS appliqué, le navigateur
 * retombe donc sur le nom technique de l'objet stocké (slug + hash). Le nom
 * doit être passé à la signature elle-même (`{ download: <nom> }`), d'où ce
 * helper partagé par toutes les routes.
 *
 * Format retenu (calqué sur les fichiers que Laurent range à la main :
 * `Convention-OPTIMMO-SES-0106.pdf`, `Analyse-besoin-ASSALIT SYNDIC-SES-0107.pdf`) :
 *
 *     <Type-de-document>-<Prénom-NOM>-<SES-XXXX>.<ext>
 *
 * Chaque segment est optionnel — un doc de niveau session n'a pas de personne,
 * une pièce d'identité n'a pas de session.
 *
 * ASCII STRICT (translittéré, sans accent ni espace) : le nom part dans la
 * query string de la signed URL (`?download=…`) puis dans un en-tête HTTP.
 * Un « é » ou une apostrophe y sont des sources d'ennuis silencieux selon le
 * navigateur — la lisibilité ne perd rien, `Piece-identite-Stephane-ROUSSEAU`
 * se lit très bien.
 */

import { DOC_TYPE_LABELS } from '@/lib/doc-scope';

/**
 * Surcharges là où le libellé d'affichage ferait un mauvais nom de fichier
 * (parenthèses, apostrophe, redondance). Tout type absent d'ici dérive
 * automatiquement de `DOC_TYPE_LABELS[type].long`.
 */
const FILENAME_LABEL_OVERRIDES: Record<string, string> = {
  // Pseudo-type : l'archive « tous les documents d'un apprenant », qui n'est
  // pas un DocType du catalogue (cf. lib/docs/learner-zip-entries.ts).
  DOSSIER_APPRENANT: 'Documents',
  CNI: 'Piece-identite',
  RIB: 'RIB',
  CFP: 'Attestation-CFP',
  EVALUATION_ACQUIS: 'Evaluation-des-acquis',
  QCM: 'QCM-evaluation',
  GRILLE_OBS: 'Grille-observation',
  GRILLE_OBS_SESSION: 'Grille-observation-formateur',
  SATISFACTION_CHAUD: 'Satisfaction-a-chaud',
  SATISFACTION_FROID: 'Satisfaction-a-froid',
  REGLEMENT_INTERIEUR: 'Reglement-interieur',
};

/** Retire les accents et tout ce qui n'est pas [A-Za-z0-9] → segments en tirets. */
export function asciiSlug(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .replace(/['’]/g, ' ') // l'apostrophe sépare, elle ne colle pas
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/** Libellé de type de document utilisable tel quel dans un nom de fichier. */
export function docTypeFilenameLabel(docType: string): string {
  const override = FILENAME_LABEL_OVERRIDES[docType];
  if (override) return override;
  const long = DOC_TYPE_LABELS[docType]?.long;
  return asciiSlug(long ?? docType) || asciiSlug(docType);
}

/**
 * `Stéphane` + `Rousseau` → `Stephane-ROUSSEAU` (nom en capitales, comme sur
 * les documents officiels). Renvoie '' si les deux sont vides.
 */
export function personFilenamePart(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = asciiSlug(firstName);
  const last = asciiSlug(lastName).toUpperCase();
  return [first, last].filter(Boolean).join('-');
}

export interface DownloadFilenameParts {
  /** DocType / ClosureDocKind / kind de PedagogicalAsset (ex. 'CERTIFICAT_REALISATION'). */
  docType: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Code de session, ex. 'SES-0110'. */
  sessionCode?: string | null;
  /** Extension SANS le point. Défaut 'pdf'. */
  ext?: string | null;
  /** Suffixe libre déjà lisible (ex. numéro de facture). */
  suffix?: string | null;
}

/**
 * Construit le nom final. Toujours non vide : si tout est absent on retombe
 * sur le docType, jamais sur une chaîne vide (un `?download=` vide ferait
 * réapparaître le nom technique de l'objet).
 */
export function buildDownloadFilename(parts: DownloadFilenameParts): string {
  const ext = asciiSlug(parts.ext ?? 'pdf').toLowerCase() || 'pdf';
  const segments = [
    docTypeFilenameLabel(parts.docType),
    personFilenamePart(parts.firstName, parts.lastName),
    asciiSlug(parts.sessionCode),
    asciiSlug(parts.suffix),
  ].filter(Boolean);
  const base = segments.join('-') || asciiSlug(parts.docType) || 'document';
  return `${base}.${ext}`;
}

/** Extension déduite d'une clé de stockage (`…/scan.JPG` → `jpg`). */
export function extFromStorageKey(key: string | null | undefined, fallback = 'pdf'): string {
  const raw = key?.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,5}$/.test(raw) ? raw : fallback;
}

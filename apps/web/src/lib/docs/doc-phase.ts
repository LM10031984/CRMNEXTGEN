/**
 * SOURCE UNIQUE — à quelle phase de la formation appartient un document.
 *
 * Demande Laurent 2026-09-10 : « à côté de chaque apprenant, un bouton pour
 * télécharger ses docs par rapport à chaque phase ». Jusqu'ici la notion de
 * phase n'existait NULLE PART dans le code : l'onglet « Avant » était une
 * liste écrite à la main dans `buildDocDockItems`, l'onglet « Après » une
 * autre liste écrite à la main dans `ClosureFormationBlock`, et le ZIP
 * apprenant ne rangeait que par code de session. Trois listes, aucune
 * autorité — donc aucun moyen de dire « les documents d'avant, pour lui ».
 *
 * Ce module est cette autorité. Il est PUR (aucune I/O, aucun import Prisma) :
 * l'onglet Avant, l'onglet Après, le ZIP par apprenant et le nom de l'archive
 * lisent tous la même table.
 *
 * ⚠️ Il couvre DEUX vocabulaires qui coexistent dans le code :
 *   - les `DocType` de la matrice (`EVALUATION_ACQUIS`, `CERTIFICAT_REALISATION`…) ;
 *   - les `PedagogicalKind` bruts que `resolveDocs` émet tels quels
 *     (`QCM`, `GRILLE_OBS`, `DEROULE`…).
 * Les deux sont mappés, sinon le ZIP raterait la moitié des documents.
 */

import { DOC_TYPE_TO_CLOSURE_KIND } from '@/lib/doc-scope';
import { CLOSURE_DOC_KINDS } from '@/lib/closure/types';

export type DocPhase = 'avant' | 'pendant' | 'apres';

export const DOC_PHASES: ReadonlyArray<{
  id: DocPhase;
  /** Titre affiché (onglets, en-têtes de bloc). */
  label: string;
  /** Segment de nom de fichier / de dossier d'archive. */
  slug: string;
}> = [
  { id: 'avant', label: 'Avant la formation', slug: 'Avant-la-formation' },
  { id: 'pendant', label: 'Pendant la formation', slug: 'Pendant-la-formation' },
  { id: 'apres', label: 'Après la formation', slug: 'Apres-la-formation' },
];

/**
 * Documents PAR APPRENANT de chaque phase, en `DocType` de matrice — c'est la
 * liste que lisent les blocs par apprenant des onglets et le filtre du ZIP.
 *
 * Choix tranchés (et pourquoi) :
 *  - `POSITIONNEMENT` est rangé en APRÈS, pas en avant. Le questionnaire mesure
 *    bien un « avant / après », mais QualiOF le produit dans le pack de fin de
 *    formation (`CLOSURE_DOC_KINDS`) : le classer en avant afficherait dans
 *    l'onglet « Avant » un document que le bouton « Tout générer » de cet
 *    onglet ne sait pas produire.
 *  - `SUPPORT_PEDAGOGIQUE` est en PENDANT (ce qu'on remet en salle), alors que
 *    `PROGRAMME` est en AVANT (ce qu'on annexe à la convention).
 *  - `ASSIDUITE` (attestation AGEFICE) est en APRÈS : elle atteste d'une
 *    présence constatée, elle se signe après coup.
 */
export const PARTICIPANT_DOC_TYPES_BY_PHASE: Record<DocPhase, readonly string[]> = {
  avant: ['CONVENTION', 'CONVOCATION', 'ANALYSE_BESOIN', 'AGEFICE', 'PROGRAMME'],
  pendant: ['EMARGEMENT', 'SUPPORT_PEDAGOGIQUE'],
  apres: [
    'ATTESTATION_FIN',
    'CERTIFICAT_REALISATION',
    'EVALUATION_ACQUIS',
    'POSITIONNEMENT',
    'SATISFACTION_CHAUD',
    'SATISFACTION_FROID',
    'ASSIDUITE',
  ],
};

/**
 * Table complète docType/kind → phase, matrice ET kinds bruts, y compris les
 * documents de niveau session/produit/organisme (le ZIP d'un apprenant les
 * embarque quand ils sont rattachés à sa session).
 */
const PHASE_BY_DOC_TYPE: Record<string, DocPhase> = {
  // ── Avant ────────────────────────────────────────────────────────────
  CONVENTION: 'avant',
  CONVOCATION: 'avant',
  ANALYSE_BESOIN: 'avant',
  AGEFICE: 'avant',
  PRE_ACCORD_OPCO: 'avant',
  PROGRAMME: 'avant',
  DEROULE: 'avant',
  DEROULE_PEDAGOGIQUE: 'avant',
  CHECKLIST: 'avant',
  CHECKLIST_FORMATION: 'avant',
  CGV: 'avant',
  REGLEMENT_INTERIEUR: 'avant',
  CNI: 'avant',
  RIB: 'avant',
  CFP: 'avant',

  // ── Pendant ──────────────────────────────────────────────────────────
  EMARGEMENT: 'pendant',
  SUPPORT_PEDAGOGIQUE: 'pendant',
  GRILLE_OBS: 'pendant',
  GRILLE_OBS_SESSION: 'pendant',

  // ── Après ────────────────────────────────────────────────────────────
  ATTESTATION_FIN: 'apres',
  CERTIFICAT_REALISATION: 'apres',
  EVALUATION_ACQUIS: 'apres',
  QCM: 'apres',
  COMPETENCES: 'apres',
  POSITIONNEMENT: 'apres',
  SATISFACTION_CHAUD: 'apres',
  SATISFACTION_FROID: 'apres',
  SATISFACTION: 'apres',
  SATISFACTION_SESSION: 'apres',
  ASSIDUITE: 'apres',
  ASSIDUITE_AGEFICE: 'apres',
  VALIDATION_OPCO: 'apres',
  FACTURE: 'apres',
};

/**
 * Phase d'un document. `null` = type inconnu du catalogue (`CUSTOM`, upload
 * libre) : on ne le RANGE pas d'office dans une phase, on le laisse remonter
 * dans le ZIP « tout » sans mentir sur son moment.
 */
export function phaseOfDocType(docType: string): DocPhase | null {
  return PHASE_BY_DOC_TYPE[docType] ?? null;
}

/** Valide une phase reçue d'une query string. `null` si absente ou inconnue. */
export function coercePhase(raw: string | null | undefined): DocPhase | null {
  return DOC_PHASES.some((p) => p.id === raw) ? (raw as DocPhase) : null;
}

/** Libellé affichable d'une phase (« Avant la formation »). */
export function phaseLabel(phase: DocPhase): string {
  return DOC_PHASES.find((p) => p.id === phase)?.label ?? phase;
}

/** Segment ASCII utilisé dans les noms de fichiers et dossiers d'archive. */
export function phaseSlug(phase: DocPhase): string {
  return DOC_PHASES.find((p) => p.id === phase)?.slug ?? phase;
}

/**
 * Les `ClosureDocKind` que le pack de fin sait produire pour cette phase —
 * ce que « Tout générer » doit demander à `generateClosurePack` en mode
 * mono-participant.
 *
 * Tous les documents d'une phase n'y figurent pas : le support pédagogique se
 * dépose à la main, et l'attestation d'assiduité AGEFICE a son propre
 * générateur synchrone (`dispatchGenerateDoc({ docType: 'ASSIDUITE_AGEFICE' })`),
 * hors pack — c'est `DOC_TYPE_TO_CLOSURE_KIND` qui le dit, et on le lit plutôt
 * que de recopier la liste ici.
 *
 * Le croisement avec `CLOSURE_DOC_KINDS` n'est pas une ceinture de sécurité
 * décorative : `DOC_TYPE_TO_CLOSURE_KIND` mappe encore `ANALYSE_BESOIN`, que le
 * pack ne produit PLUS depuis la Phase 15 (c'est devenu un document d'avant).
 * Sans ce filtre, « Tout générer » sur l'avant demanderait au pack un kind
 * qu'il ignore, et ne produirait rien en promettant le contraire.
 */
export function closureKindsForPhase(phase: DocPhase): string[] {
  const produits = new Set<string>(CLOSURE_DOC_KINDS);
  const kinds = PARTICIPANT_DOC_TYPES_BY_PHASE[phase]
    .map((t) => DOC_TYPE_TO_CLOSURE_KIND[t] ?? null)
    .filter((k): k is string => !!k && produits.has(k));
  return Array.from(new Set(kinds));
}

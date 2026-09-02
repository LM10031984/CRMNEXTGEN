/**
 * Référentiel du diagnostic d'agence (R1) — types.
 *
 * Port du repo `jean-guy-gif/start-academy-diagnostic` (§3 de la spec
 * `.planning/specs/2026-09-01-chaine-diagnostic-proposition.md`). On transpose
 * du CONTENU et des fonctions pures : rien de l'infra Supabase du repo source.
 *
 * Ce module est volontairement pur — aucun import Prisma, Next ou React. Il est
 * consommé côté serveur (server actions, moteurs, génération documentaire) ET
 * côté client (écrans de saisie du lot B).
 */

/** Chapitres du référentiel v1.0, dans l'ordre de la chaîne de production. */
export type DiagnosticChapter = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/**
 * Catégorie d'une réponse. Sert au regroupement dans le rapport d'audit et au
 * mapping vers les familles du catalogue.
 *
 * Source unique de vérité : la constante ci-dessous sert à la fois de source
 * runtime (Zod, itérations) et de source type. Ne pas dupliquer cette liste.
 */
export const ANSWER_CATEGORIES = [
  // Valeurs héritées du MVP1 du repo diag (conservées : des réponses existent
  // avec ces catégories dans les jeux de test portés).
  'tool_maturity',
  'commercial_performance',
  'business_skill',
  'execution',
  // Valeurs v1.0 alignées sur les 11 chapitres.
  'identity', // Ch.1
  'team', // Ch.2 effectifs
  'funding', // Ch.2 financement
  'prospecting', // Ch.3
  'seller_meeting', // Ch.4
  'mandates', // Ch.5
  'commercial_followup', // Ch.6
  'buyers', // Ch.7
  'visits_offers', // Ch.8
  'db_reputation', // Ch.9
  'tools_ai', // Ch.10
  'management', // Ch.11
] as const;

export type AnswerCategory = (typeof ANSWER_CATEGORIES)[number];

/**
 * Type de valeur attendu — pilote le widget de saisie (lot B) et
 * l'interprétation par le moteur ratios/alertes (lot D).
 */
export type DiagnosticQuestionType =
  | 'text'
  | 'int'
  | 'percent'
  | 'money'
  | 'date'
  | 'url'
  | 'choice'
  | 'multichoice'
  | 'yesno';

/** Profil visé par la question — sert au filtrage et au calibrage des recos. */
export type ProfileTarget = 'all' | 'conseiller' | 'manager' | 'assistant' | 'direction';

export interface DiagnosticQuestion {
  /**
   * Identifiant stable. C'est la clé de `DiagnosticAnswer.questionId` : le
   * renommer casse les réponses déjà saisies. Verrouillé par test de contrat.
   */
  id: string;
  chapter: DiagnosticChapter;
  /** Sous-section documentaire (« 2.1 », « 2.4 »…). */
  subsection?: string;
  category: AnswerCategory;
  profile: ProfileTarget;
  /** Le libellé tel qu'on le pose à l'oral en rendez-vous. */
  question: string;
  type: DiagnosticQuestionType;
  /** O/F du référentiel. Une obligatoire manquante alerte, elle ne bloque jamais. */
  required: boolean;
  /** Valeurs techniques pour `choice` / `multichoice`. */
  choices?: string[];
  /**
   * Libellés humains d'un `yesno` — remplacent « Oui » / « Non » à l'écran et
   * dans l'audit quand la formulation métier gagne à s'écarter du binaire.
   */
  answerLabels?: { yes: string; no: string };
  /** Libellé humain par valeur technique d'un `choice` / `multichoice`. */
  optionLabels?: Record<string, string>;
  /**
   * Question conditionnelle : affichée seulement si la réponse à `questionId`
   * vaut `equals` (ou appartient à `equals`). Forme volontairement simple.
   */
  showIf?: { questionId: string; equals: string | string[] };
  /**
   * Pré-remplissage inter-chapitres. Deux cas seulement (outil de pige Ch.3 →
   * Ch.10, outil d'estimation Ch.4 → Ch.10) : pas de moteur générique.
   */
  prefillFrom?: { questionId: string };
  /** Ce que la réponse alimente — documentaire, lisible dans le référentiel. */
  alimente?: string[];
  /**
   * L'aide de saisie du commercial : comment poser la question, quoi faire
   * d'un « je ne sais pas ». C'est le script de l'entretien.
   */
  hint?: string;
}

/** Métadonnées d'affichage d'un chapitre. */
export interface ChapterMeta {
  chapter: DiagnosticChapter;
  title: string;
  objective: string;
  approxMinutes: number | null;
  /**
   * Synthèse intermédiaire à afficher APRÈS ce chapitre — les deux moments de
   * démonstration du R1 : le financement (après Ch.2) et le pipeline (après Ch.8).
   * Toujours calculée par fonctions pures, jamais par un appel IA (§L-8).
   */
  followedBySynthesis?: 'funding' | 'pipeline';
}

/** Les deux variantes de diagnostic — le LÉGER est un sous-ensemble du COMPLET. */
export type DiagnosticVariantKey = 'LEGER' | 'COMPLET';

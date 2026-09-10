/**
 * Normalisation d'une extraction de transcript — FONCTION PURE.
 *
 * C'est le garde-fou du lot C. Le modèle propose ; ce module dispose. Tout ce
 * qui sort d'ici a été confronté au référentiel ET au transcript : une réponse
 * dont la citation ne se retrouve pas mot pour mot dans le texte source est
 * REJETÉE, pas rétrogradée en « confiance faible ». Motif : une extraction qui
 * invente une citation crédible est exactement le cas qu'une revue humaine
 * rapide ne rattrape pas — le relecteur lit la citation, elle sonne juste, il
 * confirme. Le seul moment où on peut encore l'arrêter, c'est ici.
 *
 * Les cinq règles, dans l'ordre où elles s'appliquent :
 *   1. la question existe au référentiel et appartient au set de la variante ;
 *   2. sa condition d'affichage est remplie (on ne remplit pas un écran que le
 *      commercial ne verra jamais) ;
 *   3. le commercial n'a pas déjà répondu — mode HYBRIDE, §6.4 : l'extracteur
 *      ne touche JAMAIS une réponse humaine, ni une réponse IA déjà confirmée ;
 *   4. la citation se retrouve dans le transcript ;
 *   5. la valeur passe le validateur du référentiel (`parseAnswerValue`) —
 *      le même que l'autosave du lot B, jamais une seconde grammaire.
 *
 * MODULE PUR : ni prisma, ni next, ni appel réseau.
 */

import { parseAnswerValue } from '@qualiof/shared';
import {
  DIAGNOSTIC_QUESTIONS,
  getQuestionsForVariant,
  type DiagnosticQuestion,
  type DiagnosticVariantKey,
} from '@qualiof/shared/diagnostic';

import { hasValue, isQuestionVisible, type AnswerLike } from '../progress';

const QUESTIONS_BY_ID = new Map<string, DiagnosticQuestion>(
  DIAGNOSTIC_QUESTIONS.map((q) => [q.id, q]),
);

/** Longueur minimale d'une citation, une fois normalisée. */
const CITATION_MIN = 12;

/** Ce que le modèle a proposé, avant tout contrôle. */
export interface PropositionIA {
  questionId: string;
  value: unknown;
  confidence: number;
  quote: string;
}

/** Une réponse qui a passé les cinq contrôles. */
export interface ReponseExtraite {
  questionId: string;
  /** Validée par le référentiel — c'est la valeur qui ira en base telle quelle. */
  value: unknown;
  confidence: number;
  /** La citation BRUTE, telle qu'elle sera montrée au relecteur. */
  quote: string;
}

export type MotifRejet =
  | 'question-inconnue'
  | 'hors-variante'
  | 'hors-condition'
  | 'deja-repondu'
  | 'doublon'
  | 'citation-absente'
  | 'confiance-invalide'
  | 'valeur-invalide';

export interface RejetExtraction {
  questionId: string;
  motif: MotifRejet;
  /** De quoi comprendre le rejet sans relire le transcript. */
  detail?: string;
}

export interface ResultatNormalisation {
  retenues: ReponseExtraite[];
  rejets: RejetExtraction[];
}

/**
 * Réduit un texte à ce qui permet de le comparer : minuscules, sans accents,
 * sans ponctuation, espaces écrasés.
 *
 * Ce qu'on tolère volontairement : la casse, les accents, la ponctuation et les
 * retours à la ligne — un transcript est découpé par tours de parole, un modèle
 * recolle les morceaux à sa façon. Ce qu'on ne tolère pas : un mot changé. La
 * reformulation, si commode soit-elle, n'est plus une citation.
 */
export function normaliserTexte(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** La citation se retrouve-t-elle dans le transcript ? */
export function citationAncree(quote: string, transcriptNormalise: string): boolean {
  const q = normaliserTexte(quote);
  if (q.length < CITATION_MIN) return false;
  return transcriptNormalise.includes(q);
}

export interface EntreeNormalisation {
  propositions: PropositionIA[];
  transcript: string;
  variant: DiagnosticVariantKey;
  /** Les réponses déjà en base — humaines comme IA déjà confirmées. */
  existantes: ReponseExistante[];
}

export interface ReponseExistante extends AnswerLike {
  origin: 'COMMERCIAL' | 'IA_TRANSCRIPT';
  /** Une réponse IA confirmée par un humain vaut une réponse humaine. */
  confirmed: boolean;
}

export function normaliserExtraction(entree: EntreeNormalisation): ResultatNormalisation {
  const { propositions, transcript, variant, existantes } = entree;

  const transcriptNormalise = normaliserTexte(transcript);
  const duSet = new Set(getQuestionsForVariant(variant).map((q) => q.id));

  /** Ce qui est verrouillé : réponse du commercial, ou réponse IA confirmée. */
  const verrouillees = new Set(
    existantes.filter((a) => a.origin === 'COMMERCIAL' || a.confirmed).map((a) => a.questionId),
  );

  const retenues: ReponseExtraite[] = [];
  const rejets: RejetExtraction[] = [];
  const vues = new Set<string>();

  // Premier passage : tout ce qui se juge sans regarder les autres réponses.
  const candidates: ReponseExtraite[] = [];
  for (const p of propositions) {
    const { questionId } = p;

    if (vues.has(questionId)) {
      rejets.push({ questionId, motif: 'doublon' });
      continue;
    }
    vues.add(questionId);

    const question = QUESTIONS_BY_ID.get(questionId);
    if (!question) {
      rejets.push({ questionId, motif: 'question-inconnue' });
      continue;
    }
    if (!duSet.has(questionId)) {
      rejets.push({ questionId, motif: 'hors-variante' });
      continue;
    }
    if (verrouillees.has(questionId)) {
      rejets.push({ questionId, motif: 'deja-repondu' });
      continue;
    }
    if (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence)) {
      rejets.push({ questionId, motif: 'confiance-invalide' });
      continue;
    }
    if (p.confidence < 0 || p.confidence > 1) {
      rejets.push({ questionId, motif: 'confiance-invalide', detail: String(p.confidence) });
      continue;
    }
    if (typeof p.quote !== 'string' || !citationAncree(p.quote, transcriptNormalise)) {
      rejets.push({ questionId, motif: 'citation-absente' });
      continue;
    }

    const valide = parseAnswerValue(questionId, p.value);
    if (!valide.ok) {
      rejets.push({ questionId, motif: 'valeur-invalide', detail: valide.error });
      continue;
    }
    // `parseAnswerValue` rend `null` pour une valeur vide : ce n'est pas une
    // réponse, c'est une absence. Elle part dans la file « à poser au R2 ».
    if (!hasValue(valide.value)) {
      rejets.push({ questionId, motif: 'valeur-invalide', detail: 'valeur vide' });
      continue;
    }

    candidates.push({
      questionId,
      value: valide.value,
      confidence: p.confidence,
      quote: p.quote.trim(),
    });
  }

  // Second passage : les conditions d'affichage, qui peuvent dépendre d'une
  // réponse arrivée dans le même lot (« refus déjà essuyé ? » → « lequel ? »).
  const carte = new Map<string, AnswerLike>(existantes.map((a) => [a.questionId, a]));
  for (const c of candidates) {
    carte.set(c.questionId, { questionId: c.questionId, value: c.value, isSkipped: false });
  }

  for (const c of candidates) {
    const question = QUESTIONS_BY_ID.get(c.questionId)!;
    if (!isQuestionVisible(question, carte)) {
      rejets.push({ questionId: c.questionId, motif: 'hors-condition' });
      continue;
    }
    retenues.push(c);
  }

  return { retenues, rejets };
}

/**
 * Progression du questionnaire — fonctions pures.
 *
 * Deux besoins de la spec §6.3 :
 *   • une barre de progression PAR CHAPITRE (pas question par question) ;
 *   • la reprise : rouvrir un diagnostic en cours ramène au premier chapitre
 *     incomplet, pas au début.
 *
 * Et une règle transverse : une donnée obligatoire manquante ne bloque JAMAIS.
 * Elle se voit, elle se signale, elle ne barre pas la route. Un R1 se fait en
 * face d'un dirigeant qui ne sait pas tout de tête.
 */

import {
  DIAGNOSTIC_CHAPTERS,
  getChapterQuestions,
  type DiagnosticChapter,
  type DiagnosticQuestion,
  type DiagnosticVariantKey,
} from '@qualiof/shared/diagnostic';

/** Une réponse telle qu'elle vit en base, réduite à ce dont le calcul a besoin. */
export interface AnswerLike {
  questionId: string;
  value: unknown;
  isSkipped: boolean;
}

export interface ChapterProgress {
  chapter: DiagnosticChapter;
  title: string;
  /** Questions réellement à l'écran (conditionnelles résolues). */
  visibleCount: number;
  answeredCount: number;
  /** Obligatoires visibles encore sans réponse — signalées, jamais bloquantes. */
  missingRequired: string[];
  /** Un chapitre est complet quand ses obligatoires visibles sont servies. */
  isComplete: boolean;
  percent: number;
}

export interface DiagnosticProgress {
  chapters: ChapterProgress[];
  /** Le chapitre où reprendre. null = tout est complet. */
  firstIncompleteChapter: DiagnosticChapter | null;
  answeredCount: number;
  visibleCount: number;
  percent: number;
  isComplete: boolean;
}

/** Une réponse « vide » n'est pas une réponse : ni null, ni chaîne vide, ni []. */
export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

function answerMap(answers: AnswerLike[]): Map<string, AnswerLike> {
  return new Map(answers.map((a) => [a.questionId, a]));
}

/**
 * Une question conditionnelle est-elle à l'écran ?
 *
 * Le contrat `showIf` est volontairement simple (égalité ou appartenance) —
 * cf. `@qualiof/shared/diagnostic`. On ne généralise pas : les deux cas réels
 * du référentiel ne le demandent pas, et un moteur de règles maison serait la
 * porte ouverte à des écrans dont personne ne sait plus pourquoi ils s'affichent.
 */
export function isQuestionVisible(
  question: DiagnosticQuestion,
  answers: Map<string, AnswerLike>,
): boolean {
  if (!question.showIf) return true;
  const dep = answers.get(question.showIf.questionId);
  if (!dep || dep.isSkipped || !hasValue(dep.value)) return false;
  const expected = question.showIf.equals;
  const actual = dep.value;
  const matches = (v: unknown) =>
    Array.isArray(expected) ? expected.includes(String(v)) : String(v) === expected;
  return Array.isArray(actual) ? actual.some(matches) : matches(actual);
}

/** Les questions d'un chapitre effectivement à l'écran, conditionnelles résolues. */
export function getVisibleChapterQuestions(
  chapter: DiagnosticChapter,
  variant: DiagnosticVariantKey,
  answers: AnswerLike[],
): DiagnosticQuestion[] {
  const map = answerMap(answers);
  return getChapterQuestions(chapter, variant).filter((q) => isQuestionVisible(q, map));
}

export function computeProgress(
  variant: DiagnosticVariantKey,
  answers: AnswerLike[],
  /**
   * Le chapitre 2 n'est complet que si la grille équipe est remplie : sans
   * elle, pas de budget, donc pas de synthèse financement, donc pas de R1.
   */
  participantCount = 0,
): DiagnosticProgress {
  const map = answerMap(answers);

  const chapters: ChapterProgress[] = DIAGNOSTIC_CHAPTERS.map((meta) => {
    const visible = getChapterQuestions(meta.chapter, variant).filter((q) =>
      isQuestionVisible(q, map),
    );
    const answered = visible.filter((q) => {
      const a = map.get(q.id);
      return a ? a.isSkipped || hasValue(a.value) : false;
    });
    const missingRequired = visible
      .filter((q) => q.required)
      .filter((q) => {
        const a = map.get(q.id);
        return !a || (!a.isSkipped && !hasValue(a.value));
      })
      .map((q) => q.id);

    const needsParticipants = meta.chapter === 2 && participantCount === 0;
    const isComplete = missingRequired.length === 0 && !needsParticipants;

    return {
      chapter: meta.chapter,
      title: meta.title,
      visibleCount: visible.length,
      answeredCount: answered.length,
      missingRequired,
      isComplete,
      percent: visible.length === 0 ? 100 : Math.round((answered.length / visible.length) * 100),
    };
  });

  const visibleCount = chapters.reduce((s, c) => s + c.visibleCount, 0);
  const answeredCount = chapters.reduce((s, c) => s + c.answeredCount, 0);
  const firstIncomplete = chapters.find((c) => !c.isComplete);

  return {
    chapters,
    firstIncompleteChapter: firstIncomplete?.chapter ?? null,
    answeredCount,
    visibleCount,
    percent: visibleCount === 0 ? 0 : Math.round((answeredCount / visibleCount) * 100),
    isComplete: firstIncomplete === undefined,
  };
}

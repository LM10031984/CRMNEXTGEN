/**
 * Revue par exception — FONCTION PURE (spec §6.4, point 4).
 *
 * Le but tient en une phrase : « on ne défile plus jamais 69 écrans ». Après un
 * pré-remplissage, le commercial ne relit pas le questionnaire, il traite trois
 * files et rien d'autre :
 *
 *   (a) À VÉRIFIER    — confiance < seuil, les moins sûres en tête. C'est là
 *                       qu'est le risque, donc c'est par là qu'on commence.
 *   (b) CONFIRMABLES   — confiance ≥ seuil, groupées par chapitre pour un
 *                       « Tout confirmer » qui reste un geste conscient.
 *   (c) MANQUANTES     — aucune réponse : à poser au R2 ou par téléphone.
 *
 * Le taux de pré-remplissage est calculé ici et affiché à l'écran : c'est le
 * critère d'acceptance du lot (§14, « ≥ 60 % »), il ne doit pas se mesurer à la
 * main un jour de recette.
 *
 * MODULE PUR : ni prisma, ni next, ni appel réseau.
 */

import {
  DIAGNOSTIC_CHAPTERS,
  getChapterQuestions,
  type DiagnosticChapter,
  type DiagnosticVariantKey,
} from '@qualiof/shared/diagnostic';

import { hasValue, isQuestionVisible, type AnswerLike } from '../progress';

/** Seuil par défaut de la spec §6.4. Paramétrable, jamais codé en dur ailleurs. */
export const SEUIL_CONFIANCE_DEFAUT = 0.7;

/** Une réponse telle qu'elle vit en base, vue par la revue. */
export interface AnswerRevue extends AnswerLike {
  origin: 'COMMERCIAL' | 'IA_TRANSCRIPT';
  confirmed: boolean;
  confidence: number | null;
  quote: string | null;
}

export interface LigneRevue {
  questionId: string;
  chapter: DiagnosticChapter;
  chapterTitle: string;
  /** Le libellé tel qu'il a été posé en rendez-vous. */
  question: string;
  value: unknown;
  confidence: number;
  quote: string;
}

export interface QuestionManquante {
  questionId: string;
  chapter: DiagnosticChapter;
  chapterTitle: string;
  question: string;
  required: boolean;
}

export interface CompteursChapitre {
  chapter: DiagnosticChapter;
  title: string;
  aVerifier: number;
  confirmables: number;
  manquantes: number;
}

export interface RevueParException {
  aVerifier: LigneRevue[];
  confirmables: LigneRevue[];
  manquantes: QuestionManquante[];
  parChapitre: CompteursChapitre[];
  /** Questions réellement à l'écran pour la variante, conditionnelles résolues. */
  visiblesCount: number;
  /** Réponses issues du transcript et pas encore confirmées. */
  aRelireCount: number;
  /** Ce que le transcript a rempli, sur ce qu'il y avait à remplir. */
  tauxPreRemplissage: number;
  /** Tout ce qui est servi, humain compris — le vrai « où en est-on ». */
  tauxCouverture: number;
}

/**
 * Une réponse IA en attente de relecture ? C'est le seul cas que la revue
 * traite : une réponse du commercial n'a rien à faire dans ces files, et une
 * réponse IA déjà confirmée est devenue une réponse comme les autres.
 */
function estARelire(a: AnswerRevue | undefined): boolean {
  return Boolean(a && a.origin === 'IA_TRANSCRIPT' && !a.confirmed && !a.isSkipped);
}

export function trierParException(
  variant: DiagnosticVariantKey,
  answers: AnswerRevue[],
  seuil: number = SEUIL_CONFIANCE_DEFAUT,
): RevueParException {
  const carte = new Map<string, AnswerRevue>(answers.map((a) => [a.questionId, a]));

  const aVerifier: LigneRevue[] = [];
  const confirmables: LigneRevue[] = [];
  const manquantes: QuestionManquante[] = [];
  const parChapitre: CompteursChapitre[] = [];

  let visiblesCount = 0;
  let couvertes = 0;

  for (const meta of DIAGNOSTIC_CHAPTERS) {
    const visibles = getChapterQuestions(meta.chapter, variant).filter((q) =>
      isQuestionVisible(q, carte),
    );
    visiblesCount += visibles.length;

    const compteurs: CompteursChapitre = {
      chapter: meta.chapter,
      title: meta.title,
      aVerifier: 0,
      confirmables: 0,
      manquantes: 0,
    };

    for (const q of visibles) {
      const a = carte.get(q.id);
      const servie = Boolean(a && (a.isSkipped || hasValue(a.value)));
      if (servie) couvertes += 1;

      if (estARelire(a)) {
        const ligne: LigneRevue = {
          questionId: q.id,
          chapter: meta.chapter,
          chapterTitle: meta.title,
          question: q.question,
          value: a!.value,
          // Une extraction sans confiance lisible se traite comme la pire :
          // elle passe en tête de la file à vérifier plutôt que de se glisser
          // dans un « Tout confirmer ».
          confidence: typeof a!.confidence === 'number' ? a!.confidence : 0,
          quote: a!.quote ?? '',
        };
        if (ligne.confidence < seuil) {
          aVerifier.push(ligne);
          compteurs.aVerifier += 1;
        } else {
          confirmables.push(ligne);
          compteurs.confirmables += 1;
        }
        continue;
      }

      if (!servie) {
        manquantes.push({
          questionId: q.id,
          chapter: meta.chapter,
          chapterTitle: meta.title,
          question: q.question,
          required: q.required,
        });
        compteurs.manquantes += 1;
      }
    }

    parChapitre.push(compteurs);
  }

  // Les moins sûres d'abord ; à confiance égale, l'ordre du questionnaire, pour
  // que la relecture suive le fil du rendez-vous.
  aVerifier.sort((x, y) => x.confidence - y.confidence || x.chapter - y.chapter);

  const aRelireCount = aVerifier.length + confirmables.length;
  const pourcent = (n: number) => (visiblesCount === 0 ? 0 : Math.round((n / visiblesCount) * 100));

  return {
    aVerifier,
    confirmables,
    manquantes,
    parChapitre,
    visiblesCount,
    aRelireCount,
    tauxPreRemplissage: pourcent(aRelireCount),
    tauxCouverture: pourcent(couvertes),
  };
}

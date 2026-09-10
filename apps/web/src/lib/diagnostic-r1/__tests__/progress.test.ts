import { describe, expect, it } from 'vitest';

import {
  computeProgress,
  getVisibleChapterQuestions,
  hasValue,
  isQuestionVisible,
} from '../progress';
import { DIAGNOSTIC_QUESTIONS } from '@qualiof/shared/diagnostic';

const q = (id: string) => DIAGNOSTIC_QUESTIONS.find((x) => x.id === id)!;
const a = (questionId: string, value: unknown, isSkipped = false) => ({
  questionId,
  value,
  isSkipped,
});

describe('Ce qui compte comme une réponse', () => {
  it('rejette le vide sous toutes ses formes', () => {
    for (const v of [null, undefined, '', '   ', [], Number.NaN]) {
      expect(hasValue(v)).toBe(false);
    }
  });

  it('accepte zéro — « zéro contact vendeur » est une réponse, et une alerte', () => {
    expect(hasValue(0)).toBe(true);
    expect(hasValue(false)).toBe(true);
  });
});

describe('Questions conditionnelles', () => {
  it("cache une question dont la condition n'est pas remplie", () => {
    const answers = new Map([['funding-past-refusals', a('funding-past-refusals', 'no')]]);
    expect(isQuestionVisible(q('funding-past-refusals-reason'), answers)).toBe(false);
  });

  it('la montre quand la condition est remplie', () => {
    const answers = new Map([['funding-past-refusals', a('funding-past-refusals', 'yes')]]);
    expect(isQuestionVisible(q('funding-past-refusals-reason'), answers)).toBe(true);
  });

  it('la cache tant que la question dont elle dépend est sans réponse', () => {
    expect(isQuestionVisible(q('funding-past-refusals-reason'), new Map())).toBe(false);
  });

  it('gère une condition à plusieurs valeurs acceptées', () => {
    const tous = new Map([['prospecting-who', a('prospecting-who', 'tous')]]);
    const personne = new Map([['prospecting-who', a('prospecting-who', 'personne')]]);
    expect(isQuestionVisible(q('prospecting-script'), tous)).toBe(true);
    expect(isQuestionVisible(q('prospecting-script'), personne)).toBe(false);
  });

  it("ne suit pas une question passée : « je ne sais pas » n'ouvre pas la sous-question", () => {
    const answers = new Map([['funding-past-refusals', a('funding-past-refusals', 'yes', true)]]);
    expect(isQuestionVisible(q('funding-past-refusals-reason'), answers)).toBe(false);
  });
});

describe('Progression par chapitre', () => {
  it('démarre à zéro et renvoie au chapitre 1', () => {
    const p = computeProgress('LEGER', []);
    expect(p.percent).toBe(0);
    expect(p.firstIncompleteChapter).toBe(1);
    expect(p.isComplete).toBe(false);
  });

  it('compte les questions du set léger, pas celles du complet', () => {
    const leger = computeProgress('LEGER', []);
    const complet = computeProgress('COMPLET', []);
    expect(leger.visibleCount).toBeLessThan(complet.visibleCount);
    expect(leger.visibleCount).toBe(37);
  });

  it("bloque la complétude du chapitre 2 tant qu'aucune fiche équipe n'existe", () => {
    // Toutes les obligatoires du Ch.2 répondues, mais grille vide : sans elle,
    // pas de budget — donc le chapitre n'est pas fini, même si l'écran l'est.
    const answers = [
      a('team-total-count', 6),
      a('team-employees-count', 2),
      a('team-independents-count', 3),
      a('team-directors-count', 1),
      a('funding-agefice-used', 'non'),
      a('funding-opco-used', 'ne_sait_pas'),
      a('funding-past-refusals', 'no'),
    ];
    const sansGrille = computeProgress('LEGER', answers, 0);
    const avecGrille = computeProgress('LEGER', answers, 4);
    expect(sansGrille.chapters.find((c) => c.chapter === 2)!.isComplete).toBe(false);
    expect(avecGrille.chapters.find((c) => c.chapter === 2)!.isComplete).toBe(true);
  });

  it('signale les obligatoires manquantes sans les rendre bloquantes', () => {
    const p = computeProgress('LEGER', [a('identity-sales-n1', 72)]);
    const ch1 = p.chapters.find((c) => c.chapter === 1)!;
    expect(ch1.missingRequired.length).toBeGreaterThan(0);
    expect(ch1.answeredCount).toBe(1);
    // La progression avance quand même : rien n'est barré.
    expect(ch1.percent).toBeGreaterThan(0);
  });

  it('accepte une question explicitement passée comme traitée', () => {
    const p = computeProgress('LEGER', [a('identity-revenue-n1', null, true)]);
    const ch1 = p.chapters.find((c) => c.chapter === 1)!;
    expect(ch1.answeredCount).toBe(1);
    expect(ch1.missingRequired).not.toContain('identity-revenue-n1');
  });

  it('ramène au premier chapitre incomplet, pas au début', () => {
    const answers = [
      a('identity-activities', ['transaction_ancien']),
      a('identity-transaction-ancien-percent', 80),
      a('identity-sales-n1', 72),
      a('identity-revenue-n1', 720_000),
      a('identity-revenue-goal', 900_000),
    ];
    const p = computeProgress('LEGER', answers, 4);
    expect(p.chapters.find((c) => c.chapter === 1)!.isComplete).toBe(true);
    expect(p.firstIncompleteChapter).toBe(2);
  });

  it('ne compte pas une conditionnelle cachée dans le total à remplir', () => {
    const sansRefus = computeProgress('COMPLET', [a('funding-past-refusals', 'no')]);
    const avecRefus = computeProgress('COMPLET', [a('funding-past-refusals', 'yes')]);
    const ch2Sans = sansRefus.chapters.find((c) => c.chapter === 2)!;
    const ch2Avec = avecRefus.chapters.find((c) => c.chapter === 2)!;
    expect(ch2Avec.visibleCount).toBe(ch2Sans.visibleCount + 1);
  });
});

describe('Questions visibles d’un chapitre', () => {
  it("rend l'ordre du référentiel, filtré par la variante et les conditions", () => {
    const visibles = getVisibleChapterQuestions(2, 'LEGER', []);
    expect(visibles.map((x) => x.id)).toEqual([
      'team-total-count',
      'team-employees-count',
      'team-independents-count',
      'team-directors-count',
      'funding-agefice-used',
      'funding-opco-used',
      'funding-past-refusals',
    ]);
  });
});

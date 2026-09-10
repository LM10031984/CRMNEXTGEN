import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CHAPTERS } from '../chapters';
import {
  getChapterQuestions,
  getChaptersForVariant,
  getQuestionsAddedByUpgrade,
  getQuestionsForVariant,
  isInLightSet,
  LIGHT_QUESTION_SET,
} from '../light-set';
import { DIAGNOSTIC_QUESTIONS } from '../questions';

/**
 * Le set léger est la promesse commerciale du R1 : « on fait le tour en 30 min,
 * et si vous voulez l'audit complet, rien n'est à ressaisir ». Ces tests
 * protègent exactement ça.
 */
describe('Contrat du set LÉGER', () => {
  it('est un sous-ensemble STRICT du complet — mêmes IDs, aucun ID inventé', () => {
    const complet = new Set(DIAGNOSTIC_QUESTIONS.map((q) => q.id));
    const orphans = LIGHT_QUESTION_SET.filter((id) => !complet.has(id));
    expect(orphans, `IDs du set léger absents du référentiel : ${orphans.join(', ')}`).toEqual([]);
  });

  it('ne contient aucun doublon', () => {
    expect(new Set(LIGHT_QUESTION_SET).size).toBe(LIGHT_QUESTION_SET.length);
  });

  it('est plus court que le complet (sinon la variante ne sert à rien)', () => {
    expect(LIGHT_QUESTION_SET.length).toBeLessThan(DIAGNOSTIC_QUESTIONS.length);
  });

  it('compte 37 questions — 25 du questionnaire Ch.3→Ch.11 + 12 de contexte Ch.1/Ch.2', () => {
    // Baseline D-1 : à réviser après deux R1 réels, en connaissance de cause.
    expect(LIGHT_QUESTION_SET).toHaveLength(37);
    const ch3plus = LIGHT_QUESTION_SET.filter((id) => {
      const q = DIAGNOSTIC_QUESTIONS.find((x) => x.id === id);
      return (q?.chapter ?? 0) >= 3;
    });
    expect(ch3plus).toHaveLength(25);
  });

  it('couvre le funnel de bout en bout (Ch.8 en entier : visites → offres → compromis → actes)', () => {
    // C'est ce qui rend le léger vendable : sans le funnel complet, pas de
    // synthèse pipeline, donc pas de constat chiffré en rendez-vous.
    for (const id of [
      'visits-per-month',
      'offers-per-month',
      'compromis-per-month',
      'actes-per-month',
    ]) {
      expect(isInLightSet(id), `${id} doit être dans le set léger`).toBe(true);
    }
  });

  it('couvre le financement (les deux régimes + les refus antérieurs)', () => {
    for (const id of ['funding-agefice-used', 'funding-opco-used', 'funding-past-refusals']) {
      expect(isInLightSet(id), `${id} doit être dans le set léger`).toBe(true);
    }
  });

  it('couvre les effectifs, sans lesquels aucun budget ne se calcule', () => {
    for (const id of ['team-total-count', 'team-employees-count', 'team-independents-count']) {
      expect(isInLightSet(id), `${id} doit être dans le set léger`).toBe(true);
    }
  });

  it('couvre le contexte chiffré (CA N-1 et ventes N-1) dont dépendent les ratios', () => {
    for (const id of ['identity-revenue-n1', 'identity-sales-n1']) {
      expect(isInLightSet(id), `${id} doit être dans le set léger`).toBe(true);
    }
  });

  it("touche les 11 chapitres — un R1 léger ne laisse aucun pan de l'agence dans le noir", () => {
    expect(getChaptersForVariant('LEGER')).toEqual(DIAGNOSTIC_CHAPTERS.map((c) => c.chapter));
  });
});

describe("Contrat de l'upgrade LÉGER → COMPLET", () => {
  it('ne perd aucune réponse : tout ID du léger existe dans le complet', () => {
    const completIds = new Set(getQuestionsForVariant('COMPLET').map((q) => q.id));
    const legerIds = getQuestionsForVariant('LEGER').map((q) => q.id);
    expect(legerIds.every((id) => completIds.has(id))).toBe(true);
  });

  it("les questions ajoutées par l'upgrade sont exactement le complément du léger", () => {
    const added = getQuestionsAddedByUpgrade();
    expect(added).toHaveLength(DIAGNOSTIC_QUESTIONS.length - LIGHT_QUESTION_SET.length);
    expect(added.some((q) => isInLightSet(q.id))).toBe(false);
  });

  it('léger + complément = le référentiel entier, sans recouvrement', () => {
    const reunion = [
      ...getQuestionsForVariant('LEGER').map((q) => q.id),
      ...getQuestionsAddedByUpgrade().map((q) => q.id),
    ].sort();
    expect(reunion).toEqual(DIAGNOSTIC_QUESTIONS.map((q) => q.id).sort());
  });
});

describe("Accesseurs par chapitre (unité d'écran du lot B)", () => {
  it("getChapterQuestions rend l'ordre du référentiel, filtré par variante", () => {
    const complet = getChapterQuestions(5, 'COMPLET');
    const leger = getChapterQuestions(5, 'LEGER');
    expect(complet.every((q) => q.chapter === 5)).toBe(true);
    expect(leger.length).toBeLessThan(complet.length);
    expect(leger.map((q) => q.id)).toEqual(
      complet.filter((q) => isInLightSet(q.id)).map((q) => q.id),
    );
  });

  it("aucun chapitre n'est vide en LÉGER (pas d'écran blanc en rendez-vous)", () => {
    const empty = DIAGNOSTIC_CHAPTERS.filter(
      (c) => getChapterQuestions(c.chapter, 'LEGER').length === 0,
    ).map((c) => `Chapitre ${c.chapter} (${c.title})`);
    expect(empty).toEqual([]);
  });

  it('la somme des chapitres égale le set de la variante (aucune question perdue en route)', () => {
    for (const variant of ['LEGER', 'COMPLET'] as const) {
      const parChapitre = DIAGNOSTIC_CHAPTERS.flatMap((c) =>
        getChapterQuestions(c.chapter, variant),
      );
      expect(parChapitre.map((q) => q.id)).toEqual(
        getQuestionsForVariant(variant).map((q) => q.id),
      );
    }
  });
});

describe('Contrat des synthèses en rendez-vous', () => {
  it('les deux moments de démonstration sont déclarés, et pas ailleurs', () => {
    const funding = DIAGNOSTIC_CHAPTERS.filter((c) => c.followedBySynthesis === 'funding');
    const pipeline = DIAGNOSTIC_CHAPTERS.filter((c) => c.followedBySynthesis === 'pipeline');
    expect(funding.map((c) => c.chapter)).toEqual([2]);
    expect(pipeline.map((c) => c.chapter)).toEqual([8]);
  });
});

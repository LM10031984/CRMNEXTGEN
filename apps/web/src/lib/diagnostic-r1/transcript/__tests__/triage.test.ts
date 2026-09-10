import { describe, expect, it } from 'vitest';

import { SEUIL_CONFIANCE_DEFAUT, trierParException, type AnswerRevue } from '../triage';

const ia = (questionId: string, value: unknown, confidence: number | null): AnswerRevue => ({
  questionId,
  value,
  isSkipped: false,
  origin: 'IA_TRANSCRIPT',
  confirmed: false,
  confidence,
  quote: 'un extrait du compte rendu qui justifie la réponse',
});

const humaine = (questionId: string, value: unknown): AnswerRevue => ({
  questionId,
  value,
  isSkipped: false,
  origin: 'COMMERCIAL',
  confirmed: true,
  confidence: null,
  quote: null,
});

describe('Les trois files', () => {
  it('sépare au seuil : en dessous on relit, au-dessus on confirme en masse', () => {
    const r = trierParException('LEGER', [
      ia('identity-revenue-n1', 720000, 0.95),
      ia('identity-sales-n1', 40, 0.55),
    ]);
    expect(r.confirmables.map((l) => l.questionId)).toEqual(['identity-revenue-n1']);
    expect(r.aVerifier.map((l) => l.questionId)).toEqual(['identity-sales-n1']);
  });

  it('le seuil est un paramètre, pas une constante gravée', () => {
    const answers = [ia('identity-revenue-n1', 720000, 0.65)];
    expect(trierParException('LEGER', answers, 0.5).confirmables).toHaveLength(1);
    expect(trierParException('LEGER', answers, 0.9).aVerifier).toHaveLength(1);
  });

  it('met les moins sûres en tête — c’est par là qu’on commence', () => {
    const r = trierParException('LEGER', [
      ia('identity-revenue-n1', 720000, 0.6),
      ia('identity-sales-n1', 40, 0.2),
      ia('identity-revenue-goal', 800000, 0.45),
    ]);
    expect(r.aVerifier.map((l) => l.confidence)).toEqual([0.2, 0.45, 0.6]);
  });

  it('traite une confiance illisible comme la pire — jamais dans un « tout confirmer »', () => {
    const r = trierParException('LEGER', [ia('identity-revenue-n1', 720000, null)]);
    expect(r.confirmables).toEqual([]);
    expect(r.aVerifier[0]!.confidence).toBe(0);
  });

  it('range en « manquantes » ce que le transcript n’a pas rempli', () => {
    const r = trierParException('LEGER', [ia('identity-revenue-n1', 720000, 0.9)]);
    expect(r.manquantes.some((m) => m.questionId === 'identity-sales-n1')).toBe(true);
    expect(r.manquantes.some((m) => m.questionId === 'identity-revenue-n1')).toBe(false);
  });
});

describe('Ce que la revue ne montre jamais', () => {
  it('une réponse du commercial n’est pas à relire — elle est déjà sienne', () => {
    const r = trierParException('LEGER', [humaine('identity-revenue-n1', 720000)]);
    expect(r.aVerifier).toEqual([]);
    expect(r.confirmables).toEqual([]);
    expect(r.manquantes.some((m) => m.questionId === 'identity-revenue-n1')).toBe(false);
  });

  it('une extraction déjà confirmée sort des files, définitivement', () => {
    const r = trierParException('LEGER', [
      { ...ia('identity-revenue-n1', 720000, 0.4), confirmed: true },
    ]);
    expect(r.aRelireCount).toBe(0);
  });

  it('une question passée par le commercial n’est pas « manquante »', () => {
    const r = trierParException('LEGER', [
      { ...humaine('identity-revenue-n1', null), isSkipped: true },
    ]);
    expect(r.manquantes.some((m) => m.questionId === 'identity-revenue-n1')).toBe(false);
  });
});

describe('Le taux de pré-remplissage — le critère du lot, mesuré par la machine', () => {
  /**
   * Le seuil de 60 % est le critère d'acceptance du lot (§14). Il doit se lire
   * à l'écran, donc il doit se calculer juste — ces deux cas encadrent
   * exactement le passage de la barre.
   */
  const remplir = (part: number) => {
    const vide = trierParException('LEGER', []);
    const combien = Math.ceil(vide.visiblesCount * part);
    // La valeur n'importe pas ici : le taux compte des réponses, pas leur
    // contenu. On prend un texte, que `hasValue` accepte pour toute question.
    const answers = vide.manquantes.slice(0, combien).map((m) => ia(m.questionId, 'réponse', 0.9));
    return { ...trierParException('LEGER', answers), combien };
  };

  it('franchit la barre des 60 % quand 60 % des questions sont servies', () => {
    const r = remplir(0.6);
    expect(r.aRelireCount).toBe(r.combien);
    expect(r.tauxPreRemplissage).toBeGreaterThanOrEqual(60);
  });

  it('ne la franchit pas à 55 %', () => {
    expect(remplir(0.55).tauxPreRemplissage).toBeLessThan(60);
  });

  it('rend 100 % quand tout est servi', () => {
    expect(remplir(1).tauxPreRemplissage).toBe(100);
  });

  it('distingue le pré-remplissage de la couverture totale', () => {
    const vide = trierParException('LEGER', []);
    const [q1, q2] = [vide.manquantes[0]!.questionId, vide.manquantes[1]!.questionId];
    const r = trierParException('LEGER', [ia(q1, 'réponse', 0.9), humaine(q2, 'réponse')]);
    // Une seule vient du transcript ; deux questions sont servies.
    expect(r.aRelireCount).toBe(1);
    expect(r.tauxCouverture).toBeGreaterThan(r.tauxPreRemplissage);
  });

  it('ne divise jamais par zéro', () => {
    expect(trierParException('LEGER', []).tauxPreRemplissage).toBe(0);
  });
});

describe('Compteurs par chapitre — de quoi confirmer chapitre par chapitre', () => {
  it('totalisent exactement les trois files', () => {
    const r = trierParException('LEGER', [
      ia('identity-revenue-n1', 720000, 0.95),
      ia('identity-sales-n1', 40, 0.3),
    ]);
    const somme = (cle: 'aVerifier' | 'confirmables' | 'manquantes') =>
      r.parChapitre.reduce((s, c) => s + c[cle], 0);
    expect(somme('aVerifier')).toBe(r.aVerifier.length);
    expect(somme('confirmables')).toBe(r.confirmables.length);
    expect(somme('manquantes')).toBe(r.manquantes.length);
    expect(somme('aVerifier') + somme('confirmables') + somme('manquantes')).toBe(r.visiblesCount);
  });
});

describe('Le seuil par défaut', () => {
  it('vaut celui de la spec §6.4', () => {
    expect(SEUIL_CONFIANCE_DEFAUT).toBe(0.7);
  });
});

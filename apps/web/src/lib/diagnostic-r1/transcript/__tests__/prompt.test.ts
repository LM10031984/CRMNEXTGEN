import { describe, expect, it } from 'vitest';
import { getQuestionsForVariant, DIAGNOSTIC_QUESTIONS } from '@qualiof/shared/diagnostic';

import {
  construirePromptUtilisateur,
  PROMPT_VERSION,
  questionsASoumettre,
  SortieExtractionSchema,
  SYSTEM_PROMPT_TRANSCRIPT,
} from '../prompt';

const TRANSCRIPT = 'Dirigeant : on a fait 720 000 euros hors taxes sur 2025.';

describe('Le catalogue soumis au modèle', () => {
  it('couvre exactement le set de la variante', () => {
    const ids = questionsASoumettre({ transcript: TRANSCRIPT, variant: 'LEGER' }).map((q) => q.id);
    expect(ids).toEqual(getQuestionsForVariant('LEGER').map((q) => q.id));
  });

  it('retire ce à quoi le commercial a déjà répondu — mode HYBRIDE', () => {
    const ids = questionsASoumettre({
      transcript: TRANSCRIPT,
      variant: 'LEGER',
      dejaRepondues: ['identity-revenue-n1'],
    }).map((q) => q.id);
    expect(ids).not.toContain('identity-revenue-n1');
    expect(ids.length).toBe(getQuestionsForVariant('LEGER').length - 1);
  });

  it('donne les valeurs TECHNIQUES des choix, pas seulement leurs libellés', () => {
    const prompt = construirePromptUtilisateur({ transcript: TRANSCRIPT, variant: 'LEGER' });
    expect(prompt).toContain('transaction_ancien');
    expect(prompt).toContain('Transaction ancien');
  });

  it('porte le transcript et le questionnaire dans le même appel', () => {
    const prompt = construirePromptUtilisateur({ transcript: TRANSCRIPT, variant: 'LEGER' });
    expect(prompt).toContain(TRANSCRIPT);
    expect(prompt).toContain('identity-revenue-n1');
  });

  it('est une fonction pure — deux appels identiques rendent le même texte', () => {
    const a = construirePromptUtilisateur({ transcript: TRANSCRIPT, variant: 'COMPLET' });
    const b = construirePromptUtilisateur({ transcript: TRANSCRIPT, variant: 'COMPLET' });
    expect(a).toBe(b);
  });

  it("n'annonce jamais un chapitre resté vide", () => {
    const tous = questionsASoumettre({ transcript: TRANSCRIPT, variant: 'COMPLET' }).map((q) => q.id);
    const prompt = construirePromptUtilisateur({
      transcript: TRANSCRIPT,
      variant: 'COMPLET',
      dejaRepondues: tous.filter((id) => {
        const q = DIAGNOSTIC_QUESTIONS.find((x) => x.id === id)!;
        return q.chapter === 1;
      }),
    });
    expect(prompt).not.toContain('## Chapitre 1 ');
    expect(prompt).toContain('## Chapitre 2 ');
  });
});

describe('Les consignes qui tiennent la vérité du lot', () => {
  it('interdit d’inventer, et le dit en toutes lettres', () => {
    expect(SYSTEM_PROMPT_TRANSCRIPT).toContain('NE RIEN INVENTER');
  });

  it('exige une citation littérale — c’est ce que la normalisation revérifie', () => {
    expect(SYSTEM_PROMPT_TRANSCRIPT).toContain('MOT POUR MOT');
  });

  it('interdit d’arrondir un montant « vers le beau »', () => {
    expect(SYSTEM_PROMPT_TRANSCRIPT).toContain('700 000');
  });

  it('est versionné — sans ça, impossible de dire quel prompt a produit quoi', () => {
    expect(PROMPT_VERSION).toMatch(/^transcript-v\d+$/);
  });
});

describe('Le contrat de sortie', () => {
  it('accepte la forme attendue', () => {
    const r = SortieExtractionSchema.safeParse({
      reponses: [{ questionId: 'identity-revenue-n1', value: 720000, confidence: 0.9, quote: 'x' }],
    });
    expect(r.success).toBe(true);
  });

  it('accepte une sortie vide — ne rien trouver est un résultat', () => {
    expect(SortieExtractionSchema.safeParse({ reponses: [] }).success).toBe(true);
  });

  it('refuse une réponse sans citation', () => {
    const r = SortieExtractionSchema.safeParse({
      reponses: [{ questionId: 'identity-revenue-n1', value: 720000, confidence: 0.9 }],
    });
    expect(r.success).toBe(false);
  });

  it('refuse une confiance textuelle', () => {
    const r = SortieExtractionSchema.safeParse({
      reponses: [
        { questionId: 'identity-revenue-n1', value: 1, confidence: 'haute', quote: 'x' },
      ],
    });
    expect(r.success).toBe(false);
  });
});

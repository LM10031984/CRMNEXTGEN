import { describe, expect, it } from 'vitest';

import { CreateDiagnosticSchema, parseAnswerValue, UpsertParticipantSchema } from '../diagnostic';

/**
 * Ces schémas sont la dernière barrière avant la base. Ils doivent accepter ce
 * qu'un commercial tape VRAIMENT en rendez-vous — « 1 250,50 € », « 45 % » —
 * et refuser ce qui ferait rendre un NaN au moteur budget.
 */
describe('Lecture des saisies chiffrées', () => {
  it('accepte un montant écrit à la française', () => {
    expect(parseAnswerValue('identity-revenue-n1', '720 000 €')).toEqual({
      ok: true,
      value: 720000,
    });
    expect(parseAnswerValue('identity-revenue-n1', '1 250,50')).toEqual({
      ok: true,
      value: 1250.5,
    });
  });

  it('accepte un pourcentage avec son signe', () => {
    expect(parseAnswerValue('identity-transaction-ancien-percent', '80 %')).toEqual({
      ok: true,
      value: 80,
    });
  });

  it('refuse un pourcentage au-dessus de 100', () => {
    const r = parseAnswerValue('identity-transaction-ancien-percent', 140);
    expect(r.ok).toBe(false);
  });

  it('refuse un entier écrit en toutes lettres plutôt que de le lire comme zéro', () => {
    const r = parseAnswerValue('identity-sales-n1', 'soixante-douze');
    expect(r.ok).toBe(false);
  });

  it('refuse un entier décimal là où le référentiel attend un compte', () => {
    expect(parseAnswerValue('identity-sales-n1', '72,5').ok).toBe(false);
  });

  it('accepte zéro — « zéro vente » est une réponse', () => {
    expect(parseAnswerValue('identity-sales-n1', 0)).toEqual({ ok: true, value: 0 });
  });

  it('traite une saisie effacée comme un effacement, pas comme une erreur', () => {
    expect(parseAnswerValue('identity-sales-n1', '')).toEqual({ ok: true, value: null });
    expect(parseAnswerValue('identity-sales-n1', null)).toEqual({ ok: true, value: null });
  });
});

describe('Réponses à choix', () => {
  it('accepte une valeur du référentiel', () => {
    expect(parseAnswerValue('funding-agefice-used', 'ne_sait_pas')).toEqual({
      ok: true,
      value: 'ne_sait_pas',
    });
  });

  it('refuse une valeur inventée', () => {
    expect(parseAnswerValue('funding-agefice-used', 'peut_etre').ok).toBe(false);
  });

  it('accepte une liste pour un multi-choix, et refuse un intrus dedans', () => {
    expect(parseAnswerValue('identity-activities', ['location', 'syndic']).ok).toBe(true);
    expect(parseAnswerValue('identity-activities', ['location', 'crypto']).ok).toBe(false);
  });

  it('n’accepte que oui ou non sur une question binaire', () => {
    expect(parseAnswerValue('funding-past-refusals', 'yes').ok).toBe(true);
    expect(parseAnswerValue('funding-past-refusals', 'peut-être').ok).toBe(false);
  });
});

describe('Questions hors référentiel', () => {
  it("refuse d'enregistrer une réponse à une question qui n'existe pas", () => {
    const r = parseAnswerValue('question-inventee', 'peu importe');
    expect(r.ok).toBe(false);
  });
});

describe('Création d’un diagnostic', () => {
  it('accepte un rattachement à un lead existant', () => {
    const r = CreateDiagnosticSchema.safeParse({
      variant: 'LEGER',
      leadId: '11111111-1111-1111-1111-111111111111',
    });
    expect(r.success).toBe(true);
  });

  it("accepte la création à la volée depuis le nom de l'agence", () => {
    const r = CreateDiagnosticSchema.safeParse({
      variant: 'COMPLET',
      newLeadCompanyName: 'Agence des Oliviers',
    });
    expect(r.success).toBe(true);
  });

  it('refuse les deux à la fois — sinon on ne sait plus qui est le prospect', () => {
    const r = CreateDiagnosticSchema.safeParse({
      variant: 'LEGER',
      leadId: '11111111-1111-1111-1111-111111111111',
      newLeadCompanyName: 'Agence des Oliviers',
    });
    expect(r.success).toBe(false);
  });

  it('refuse aucun des deux', () => {
    expect(CreateDiagnosticSchema.safeParse({ variant: 'LEGER' }).success).toBe(false);
  });
});

describe('Fiche équipe', () => {
  const base = {
    diagnosticId: '11111111-1111-1111-1111-111111111111',
    displayName: 'Marie D.',
    statut: 'INDEPENDANT' as const,
  };

  it('accepte une fiche minimale — en rendez-vous on saisit vite', () => {
    expect(UpsertParticipantSchema.safeParse(base).success).toBe(true);
  });

  it('lit une production N-1 tapée avec des espaces', () => {
    const r = UpsertParticipantSchema.safeParse({ ...base, caN1: '120 000' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.caN1).toBe(120000);
  });

  it('exige un nom : une ligne anonyme ne sert à rien dans une grille équipe', () => {
    expect(UpsertParticipantSchema.safeParse({ ...base, displayName: '  ' }).success).toBe(false);
  });

  it('inclut le participant dans la proposition par défaut', () => {
    const r = UpsertParticipantSchema.safeParse(base);
    expect(r.success && r.data.includedInProposal).toBe(true);
  });
});

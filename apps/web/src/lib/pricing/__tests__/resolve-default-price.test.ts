import { describe, it, expect } from 'vitest';
import { resolveDefaultParticipantPrice } from '../resolve-default-price';

/**
 * E-2 — la règle « pas de prix fourni → prix de session » était copiée en trois
 * endroits (sessions.ts, enroll-from-request.ts, sessions-create.ts). Trois
 * copies d'une règle tarifaire, c'est la maladie que le correctif prétendait
 * soigner. Cette fonction est désormais la seule source.
 *
 * PROTOCOLE DE MUTATION (non commité) : dans la branche forfait groupe,
 * renvoyer `Number(groupFlat)` au lieu de 0 → le test « ne répartit jamais un
 * forfait à l'aveugle » DOIT virer ROUGE (c'est l'erreur du 20/08 : ×8 sur le CA).
 */

const MORALE = { legalForm: 'SAS' };
const EI = { legalForm: 'AUTO_ENTREPRENEUR' };

describe('resolveDefaultParticipantPrice', () => {
  it('le tarif de session gagne quand il existe', () => {
    const r = resolveDefaultParticipantPrice(
      { pricePerLearner: 1400 },
      { priceHT: 900, groupFlatPrice: 4500 },
      MORALE,
    );
    expect(r).toMatchObject({ priceHT: 1400, source: 'session', needsReview: false });
  });

  it('un tarif de session à 0 est un choix explicite, pas un repli', () => {
    const r = resolveDefaultParticipantPrice({ pricePerLearner: 0 }, { priceHT: 900, groupFlatPrice: null }, EI);
    expect(r).toMatchObject({ priceHT: 0, source: 'session', needsReview: false });
  });

  it('sans tarif de session, un TNS prend le tarif unitaire du produit', () => {
    const r = resolveDefaultParticipantPrice(
      { pricePerLearner: null },
      { priceHT: 900, groupFlatPrice: 4500 },
      EI,
    );
    expect(r).toMatchObject({ priceHT: 900, source: 'produit', needsReview: false });
  });

  it('ne répartit JAMAIS un forfait groupe à l’aveugle', () => {
    // Le forfait est un montant pour le GROUPE. L'écrire sur chaque inscrit
    // multiplierait le CA par l'effectif — erreur commise le 20/08/2026.
    const r = resolveDefaultParticipantPrice(
      { pricePerLearner: null },
      { priceHT: 900, groupFlatPrice: 4500 },
      MORALE,
    );
    expect(r.priceHT).toBe(0);
    expect(r.source).toBe('forfait-groupe');
    expect(r.needsReview).toBe(true);
    expect(r.reason).toMatch(/4\s?500/);
  });

  it('aucun tarif nulle part : 0 SIGNALÉ, jamais un 0 silencieux', () => {
    const r = resolveDefaultParticipantPrice(
      { pricePerLearner: null },
      { priceHT: null, groupFlatPrice: null },
      EI,
    );
    expect(r).toMatchObject({ priceHT: 0, source: 'aucun', needsReview: true });
    expect(r.reason).toBeTruthy();
  });

  it('accepte les Decimal Prisma comme les nombres', () => {
    const decimal = { toString: () => '1250.50' } as unknown as number;
    const r = resolveDefaultParticipantPrice({ pricePerLearner: decimal }, { priceHT: null, groupFlatPrice: null }, EI);
    expect(r.priceHT).toBe(1250.5);
  });

  it('sans organisation payeuse connue, ne suppose pas une personne morale', () => {
    const r = resolveDefaultParticipantPrice(
      { pricePerLearner: null },
      { priceHT: 900, groupFlatPrice: 4500 },
      null,
    );
    expect(r).toMatchObject({ priceHT: 900, source: 'produit' });
  });

  it('personne morale sans forfait groupe : tarif unitaire du produit', () => {
    const r = resolveDefaultParticipantPrice(
      { pricePerLearner: null },
      { priceHT: 900, groupFlatPrice: null },
      MORALE,
    );
    expect(r).toMatchObject({ priceHT: 900, source: 'produit' });
  });

  it('sans produit connu, se rabat sur la session puis signale', () => {
    expect(resolveDefaultParticipantPrice({ pricePerLearner: 800 }, null, EI)).toMatchObject({
      priceHT: 800,
      source: 'session',
    });
    expect(resolveDefaultParticipantPrice({ pricePerLearner: null }, null, EI)).toMatchObject({
      source: 'aucun',
      needsReview: true,
    });
  });
});

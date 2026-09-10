/**
 * Vendu, facturé, encaissé — trois réalités que le pilotage confondait en une.
 *
 * Constat qui a motivé ce bloc (base, 10/09/2026) : 158 478 € comptés comme
 * vendus, 31 115 € facturés, 17 696 € encaissés. Un seul de ces trois chiffres
 * était affiché.
 */

import { describe, it, expect } from 'vitest';
import {
  assembleFlux,
  moisDeLAnnee,
  delaiEnJours,
  moyenneDelais,
} from '../flux-financiers';

const douze = (valeurs: Partial<Record<number, number>>): number[] =>
  Array.from({ length: 12 }, (_, i) => valeurs[i] ?? 0);

describe('assembleFlux', () => {
  it('rend les trois totaux et les deux écarts qui posent les vraies questions', () => {
    const flux = assembleFlux({
      vendu: douze({ 0: 10000, 6: 5000 }),
      facture: douze({ 0: 4000 }),
      encaisse: douze({ 1: 3000 }),
    });
    expect(flux.totalVendu).toBe(15000);
    expect(flux.totalFacture).toBe(4000);
    expect(flux.totalEncaisse).toBe(3000);
    expect(flux.resteAFacturer).toBe(11000);
    expect(flux.resteAEncaisser).toBe(1000);
  });

  it('ne rend jamais un reste négatif : une avance de facturation n’est pas une dette', () => {
    const flux = assembleFlux({
      vendu: douze({ 0: 1000 }),
      facture: douze({ 0: 4000 }),
      encaisse: douze({ 0: 4000 }),
    });
    expect(flux.resteAFacturer).toBe(0);
    expect(flux.resteAEncaisser).toBe(0);
  });

  it('additionne un avoir tel quel — son montant est DÉJÀ négatif en base', () => {
    // Vérifié : l'unique avoir de 2026 porte amountHT = −336 €.
    const flux = assembleFlux({
      vendu: douze({}),
      facture: douze({ 0: 1000, 1: -336 }),
      encaisse: douze({}),
    });
    expect(flux.totalFacture).toBe(664);
  });

  it('garde les douze mois, même vides — le graphe a besoin d’un axe complet', () => {
    const flux = assembleFlux({ vendu: douze({}), facture: douze({}), encaisse: douze({}) });
    expect(flux.mensuel).toHaveLength(12);
    expect(flux.mensuel[3]).toEqual({ mois: 3, vendu: 0, facture: 0, encaisse: 0 });
  });
});

describe('moisDeLAnnee', () => {
  it('range une date dans son mois UTC, comme le reste du pilotage', () => {
    expect(moisDeLAnnee(new Date('2026-01-15T23:30:00Z'), 2026)).toBe(0);
    expect(moisDeLAnnee(new Date('2026-12-31T00:00:00Z'), 2026)).toBe(11);
  });

  it('rend null pour une date d’une autre année ou absente', () => {
    expect(moisDeLAnnee(new Date('2025-06-01T00:00:00Z'), 2026)).toBeNull();
    expect(moisDeLAnnee(null, 2026)).toBeNull();
  });
});

describe('délai d’encaissement', () => {
  it('compte les jours entre l’émission et le paiement', () => {
    expect(
      delaiEnJours(new Date('2026-01-01T00:00:00Z'), new Date('2026-02-15T00:00:00Z')),
    ).toBe(45);
  });

  it('ignore un paiement antérieur à la facture plutôt que de rendre un délai négatif', () => {
    expect(
      delaiEnJours(new Date('2026-02-15T00:00:00Z'), new Date('2026-01-01T00:00:00Z')),
    ).toBeNull();
  });

  it('rend null quand la moyenne n’a rien à moyenner', () => {
    expect(moyenneDelais([])).toBeNull();
    expect(moyenneDelais([30, 60])).toBe(45);
  });
});

import { describe, it, expect } from 'vitest';
import { ageficeRights, contributionFromExtractedData } from '../agefice-rights';

describe('ageficeRights', () => {
  it('contribution nulle : aucun droit', () => {
    expect(ageficeRights(0)).toMatchObject({ niveau: 'aucun', montantEuros: 0 });
  });

  it('contribution sous 7 € : 500 € de droits', () => {
    expect(ageficeRights(1)).toMatchObject({ niveau: 'partiel', montantEuros: 500 });
    expect(ageficeRights(6.99)).toMatchObject({ niveau: 'partiel', montantEuros: 500 });
    // Un versement infime reste un versement : il ouvre les droits partiels.
    expect(ageficeRights(0.5)).toMatchObject({ niveau: 'partiel', montantEuros: 500 });
  });

  it('contribution de 7 € ou plus : 3 000 € de droits', () => {
    expect(ageficeRights(7)).toMatchObject({ niveau: 'plein', montantEuros: 3000 });
    expect(ageficeRights(7.01)).toMatchObject({ niveau: 'plein', montantEuros: 3000 });
    expect(ageficeRights(142.5)).toMatchObject({ niveau: 'plein', montantEuros: 3000 });
  });

  it('contribution non lue : droits inconnus, jamais 0 par défaut', () => {
    expect(ageficeRights(null)).toMatchObject({ niveau: 'inconnu', montantEuros: null });
    expect(ageficeRights(undefined)).toMatchObject({ niveau: 'inconnu', montantEuros: null });
    expect(ageficeRights(Number.NaN)).toMatchObject({ niveau: 'inconnu' });
  });

  it('un montant négatif est traité comme une absence de versement', () => {
    expect(ageficeRights(-3)).toMatchObject({ niveau: 'aucun' });
  });
});

describe('contributionFromExtractedData', () => {
  it('lit le montant extrait par l’OCR', () => {
    expect(contributionFromExtractedData({ cfp: { contributionAmount: 142.5 } })).toBe(142.5);
  });

  it('accepte une virgule décimale et un symbole euro', () => {
    expect(contributionFromExtractedData({ cfp: { contributionAmount: '6,50 €' } })).toBe(6.5);
  });

  it('renvoie null quand le champ est absent ou vide', () => {
    expect(contributionFromExtractedData(null)).toBeNull();
    expect(contributionFromExtractedData({})).toBeNull();
    expect(contributionFromExtractedData({ cfp: {} })).toBeNull();
    expect(contributionFromExtractedData({ cfp: { contributionAmount: null } })).toBeNull();
  });
});

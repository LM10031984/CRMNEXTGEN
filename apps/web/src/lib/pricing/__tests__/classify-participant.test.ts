import { describe, it, expect } from 'vitest';
import { estEngage, partitionnerPourCascade } from '../classify-participant';

/**
 * Règle validée par Laurent le 28/08 : le nouveau tarif d'une session ne
 * redescend QUE sur les inscrits dont aucun document contractuel ne porte
 * encore de montant. Une convention ou une facture émise ferme le prix.
 *
 * Test de puissance : faire tomber `aConvention` dans `estEngage` fait virer
 * ROUGE « un inscrit couvert par une convention est engagé ».
 */

const libre = { id: 'sp-libre', aFacture: false, aConvention: false };

describe('estEngage', () => {
  it('un inscrit sans pièce n’engage personne', () => {
    expect(estEngage(libre)).toBe(false);
  });

  it('un inscrit facturé est engagé', () => {
    expect(estEngage({ ...libre, aFacture: true })).toBe(true);
  });

  it('un inscrit couvert par une convention est engagé', () => {
    expect(estEngage({ ...libre, aConvention: true })).toBe(true);
  });
});

describe('partitionnerPourCascade', () => {
  it('ne retient que les inscrits sans pièce', () => {
    const r = partitionnerPourCascade([
      libre,
      { id: 'sp-facture', aFacture: true, aConvention: false },
      { id: 'sp-convention', aFacture: false, aConvention: true },
    ]);
    expect(r.aMettreAJour).toEqual(['sp-libre']);
    expect(r.exclus).toEqual([
      { id: 'sp-facture', motif: 'facture' },
      { id: 'sp-convention', motif: 'convention' },
    ]);
  });

  /** La facture prime : c'est la pièce qui a le plus de conséquences. */
  it('nomme la facture en premier quand les deux pièces existent', () => {
    const r = partitionnerPourCascade([{ id: 'sp-1', aFacture: true, aConvention: true }]);
    expect(r.exclus).toEqual([{ id: 'sp-1', motif: 'facture' }]);
  });

  it('sur une session vide, ne renvoie rien à faire', () => {
    expect(partitionnerPourCascade([])).toEqual({ aMettreAJour: [], exclus: [] });
  });
});

import { describe, it, expect } from 'vitest';

/**
 * Phase 15 Lot 2 (15-02) Task 1 — TDD RED — test PUR (pas de rendu).
 *
 * NON-DIVERGENCE DE SOURCE : le compteur « manquants » affiché par l'onglet
 * « Après » DOIT dériver de `docCompletion(items)` (la MÊME source que la
 * matrice / les step blocks), et BOUGER avec la source. On mute un item
 * (présent → manquant) et on prouve que le compteur de l'onglet varie dans le
 * même sens que `docCompletion`. Pas de re-implémentation parallèle du calcul.
 *
 * Le helper `apresMissingCount` est le point d'entrée de l'onglet Après pour le
 * compteur ; il doit déléguer à `docCompletion`. Si quelqu'un recompte
 * localement (ex. `items.length - generated`), ce test reste vert MAIS le test
 * de puissance (muter le helper pour ignorer un `state`) le fera virer rouge.
 */

import { docCompletion } from '@/lib/sessions/doc-completion';
import { apresMissingCount } from '../tab-apres-helpers';
import type { CompletionItem } from '@/lib/sessions/doc-completion';

describe('apresMissingCount — dérive de docCompletion (source unique)', () => {
  const base: CompletionItem[] = [
    { state: 'generated' },
    { state: 'generated' },
    { state: 'missing' },
    { state: 'pending' },
  ];

  it('le compteur de l’onglet == docCompletion(items).missing', () => {
    expect(apresMissingCount(base)).toBe(docCompletion(base).missing);
  });

  it('muter un item generated→missing fait MONTER le compteur, comme docCompletion', () => {
    const before = apresMissingCount(base);
    const mutated: CompletionItem[] = base.map((it, i) =>
      i === 0 ? { state: 'missing' } : it,
    );
    const after = apresMissingCount(mutated);
    // même sens que la source
    expect(after).toBe(before + 1);
    expect(after).toBe(docCompletion(mutated).missing);
  });

  it('muter un item missing→generated fait BAISSER le compteur, comme docCompletion', () => {
    const before = apresMissingCount(base);
    const mutated: CompletionItem[] = base.map((it, i) =>
      i === 2 ? { state: 'generated' } : it,
    );
    const after = apresMissingCount(mutated);
    expect(after).toBe(before - 1);
    expect(after).toBe(docCompletion(mutated).missing);
  });
});

import { describe, it, expect } from 'vitest';
import { stubPositionnementContent } from '../stub-content';
import type { ClosureContext } from '../shared-template';

const ctxFor = (seed: string) =>
  ({ apprenantPrenom: seed, apprenantNom: 'Test', sessionCode: 'SES-0001' }) as unknown as ClosureContext;

describe('stubPositionnementContent — varié + progression garantie', () => {
  it('progression TOUJOURS respectée (apres > avant sur chaque compétence)', () => {
    for (const id of ['p1', 'p2', 'p3', 'abc-123', 'xyz-999', 'jean-dupont']) {
      const c = stubPositionnementContent(ctxFor(id));
      for (const comp of c.competences) {
        expect(comp.apres).toBeGreaterThan(comp.avant);
        expect(comp.avant).toBeGreaterThanOrEqual(1);
        expect(comp.apres).toBeLessThanOrEqual(4);
      }
    }
  });

  it('déterministe : même stagiaire → même résultat (stable en régénération)', () => {
    const a = stubPositionnementContent(ctxFor('same-id'));
    const b = stubPositionnementContent(ctxFor('same-id'));
    expect(a.competences).toEqual(b.competences);
  });

  it('varié : deux stagiaires différents → écarts différents (pas le stub figé)', () => {
    const a = stubPositionnementContent(ctxFor('participant-A'));
    const b = stubPositionnementContent(ctxFor('participant-B'));
    const gapsA = a.competences.map((c) => `${c.avant}-${c.apres}`).join(',');
    const gapsB = b.competences.map((c) => `${c.avant}-${c.apres}`).join(',');
    expect(gapsA).not.toBe(gapsB);
  });

  it('les écarts ne sont pas tous identiques au sein d\'un même doc', () => {
    // Test de puissance : l\'ancien stub figé avait des écarts non tous égaux mais
    // IDENTIQUES entre tous les stagiaires ; ici on veut de la variété d\'écarts.
    const c = stubPositionnementContent(ctxFor('varied-check'));
    const ecarts = new Set(c.competences.map((x) => x.apres - x.avant));
    expect(ecarts.size).toBeGreaterThan(1); // au moins 2 tailles d'écart différentes
  });
});

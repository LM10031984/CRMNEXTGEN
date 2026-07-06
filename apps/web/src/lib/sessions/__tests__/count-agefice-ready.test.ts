import { describe, it, expect } from 'vitest';
import { countAgeficeReady } from '../count-agefice-ready';

describe('countAgeficeReady (HOTFIX 2 — plus de « 2/1 »)', () => {
  it('repro SES-0093 : 2 docs AGEFICE, 1 seul éligible → 1 (pas 2)', () => {
    // 2 participants ont un doc AGEFICE, mais 1 seul est encore éligible.
    const ageficeDocs = ['p1', 'p2'];
    const eligible = ['p1'];
    expect(countAgeficeReady(ageficeDocs, eligible)).toBe(1);
  });

  it('cas nominal : 1 doc pour 1 éligible → 1/1', () => {
    expect(countAgeficeReady(['p1'], ['p1'])).toBe(1);
  });

  it('éligible sans dossier généré : 0 sur 2 éligibles', () => {
    expect(countAgeficeReady([], ['p1', 'p2'])).toBe(0);
  });

  it('tous prêts : 3 docs pour 3 éligibles → 3', () => {
    expect(countAgeficeReady(['p1', 'p2', 'p3'], ['p1', 'p2', 'p3'])).toBe(3);
  });

  it('dossier orphelin (participant non éligible) ignoré', () => {
    // p9 a un doc mais n'est pas dans le set éligible → ne compte pas.
    expect(countAgeficeReady(['p1', 'p9'], ['p1', 'p2'])).toBe(1);
  });

  it('numérateur jamais supérieur au dénominateur (invariant X<=Y)', () => {
    const ready = countAgeficeReady(['p1', 'p2', 'p3'], ['p1']);
    expect(ready).toBeLessThanOrEqual(1);
    expect(ready).toBe(1);
  });

  it('doublons de participantId dans les docs comptés une seule fois', () => {
    expect(countAgeficeReady(['p1', 'p1', 'p1'], ['p1', 'p2'])).toBe(1);
  });

  it('aucun éligible → 0 même avec des docs', () => {
    expect(countAgeficeReady(['p1', 'p2'], [])).toBe(0);
  });
});

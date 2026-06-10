/**
 * Test unitaire pur (pas de BDD) du scoring Tréso section 4 — Phase 09.2.
 *
 * Prouve que le correctif de clé tient :
 *  - le MONTANT n'est plus un critère d'ENTRÉE (une session à montant faux 336€
 *    ne "gagne" plus par le montant) ;
 *  - le nb de stagiaires EST un critère d'entrée ;
 *  - à score d'entrée égal, le montant DÉPARTAGE (le plus proche gagne) ;
 *  - un no-match ne crashe pas et reste sous le seuil.
 */
import { describe, expect, it } from 'vitest';
import { scoreTresoRow, matchTresoRows, type SigLike, type TresoLike } from '../match-treso-agefice';

const START = new Date(Date.UTC(2025, 11, 1)); // 01/12/2025
const END = new Date(Date.UTC(2025, 11, 2)); // 02/12/2025

function makeSig(opts: {
  code: string;
  total: number;
  nbParticipants: number;
  names?: string[];
  start?: Date;
  end?: Date;
  opcos?: string[];
}): SigLike {
  return {
    session: {
      code: opts.code,
      id: 'id-' + opts.code,
      startDate: opts.start ?? START,
      endDate: opts.end ?? END,
      participants: new Array(opts.nbParticipants).fill({}),
    },
    stagNames: new Set((opts.names ?? ['eric perrien']).map((n) => n.toLowerCase())),
    total: opts.total,
    opcos: new Set(opts.opcos ?? []),
  };
}

function makeTreso(over: Partial<TresoLike> = {}): TresoLike {
  return {
    dateRange: { start: START, end: END },
    montant: 3024,
    nbStagiaires: null,
    stagiairesRaw: 'Eric PERRIEN',
    opcoLabel: null,
    ...over,
  };
}

describe('match-treso scoring (section 4)', () => {
  it('Test 1 — le montant n’influe PAS sur le score d’entrée (336 vs 3024)', () => {
    const t = makeTreso({ montant: 3024 });
    const sigFaux = makeSig({ code: 'A', total: 336, nbParticipants: 1 });
    const sigVrai = makeSig({ code: 'A', total: 3024, nbParticipants: 1 });
    // Même score d'entrée quel que soit sig.total → le montant n'est pas un critère d'entrée.
    expect(scoreTresoRow(t, sigFaux)).toBe(scoreTresoRow(t, sigVrai));
  });

  it('Test 2 — nb stagiaires en entrée : +15 quand t.nbStagiaires == participants.length', () => {
    const t = makeTreso({ nbStagiaires: 3 });
    const sigMatch = makeSig({ code: 'M', total: 0, nbParticipants: 3 });
    const sigDiff = makeSig({ code: 'D', total: 0, nbParticipants: 5 });
    expect(scoreTresoRow(t, sigMatch) - scoreTresoRow(t, sigDiff)).toBe(15);
  });

  it('Test 3 — départage par montant : à score d’entrée égal, le total le plus proche gagne', () => {
    const t = makeTreso({ montant: 3024, nbStagiaires: null });
    const sigLoin = makeSig({ code: 'LOIN', total: 336, nbParticipants: 1 });
    const sigProche = makeSig({ code: 'PROCHE', total: 3000, nbParticipants: 1 });
    // Scores d'entrée égaux (mêmes noms/dates) → départage par |total - montant|.
    expect(scoreTresoRow(t, sigLoin)).toBe(scoreTresoRow(t, sigProche));
    const [res] = matchTresoRows([t], [sigLoin, sigProche]);
    expect(res!.bestSession?.code).toBe('PROCHE');
  });

  it('Test 4 — no-match : aucun candidat, pas de crash, sous le seuil (< 40)', () => {
    const t = makeTreso({
      stagiairesRaw: 'Inconnu TOTAL',
      dateRange: { start: new Date(Date.UTC(2020, 0, 1)), end: new Date(Date.UTC(2020, 0, 2)) },
    });
    const sig = makeSig({ code: 'X', total: 1000, nbParticipants: 2, names: ['jean dupont'] });
    const [res] = matchTresoRows([t], [sig]);
    expect(res!.bestScore).toBeLessThan(40);
    expect(res!.bestSession).toBeNull();
  });
});

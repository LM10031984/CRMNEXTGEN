import { describe, it, expect } from 'vitest';

import {
  isZombieBatch,
  finalStatusFor,
  type ZombieBatchInput,
  type ZombieJobInput,
} from '../close-zombie-batches';

/**
 * Phase 15 Plan 15-04 Task 1 (RED) — Prédicat de clôture des batches « zombies ».
 *
 * Un ClosureBatch resté RUNNING/PENDING au-delà du seuil, SANS aucun job actif
 * récent, est un fantôme (le worker a été tué entre deux jobs → transition finale
 * jamais effectuée). Le prédicat DOIT :
 *   - repérer ces batches (cas 1),
 *   - ne JAMAIS toucher un batch réellement actif (job PROCESSING récent, cas 2),
 *   - ignorer un batch déjà finalisé (cas 3).
 *
 * `finalStatusFor` reproduit la logique du worker (bumpAndFinalize) :
 *   errorDocs === 0 → COMPLETED ; doneDocs === 0 → FAILED ; sinon → PARTIAL.
 *
 * Critère de zombie sûr (15-RESEARCH Q6), seuil aligné sur STUCK_PROCESSING_MINUTES=15.
 */

const NOW = new Date('2026-07-01T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

function batch(overrides: Partial<ZombieBatchInput> = {}): ZombieBatchInput {
  return {
    id: 'batch-1',
    status: 'RUNNING',
    totalDocs: 10,
    doneDocs: 10,
    errorDocs: 0,
    startedAt: minutesAgo(30),
    updatedAt: minutesAgo(30),
    ...overrides,
  };
}

function job(overrides: Partial<ZombieJobInput> = {}): ZombieJobInput {
  return {
    status: 'DONE',
    startedAt: minutesAgo(30),
    updatedAt: minutesAgo(30),
    ...overrides,
  };
}

describe('isZombieBatch — prédicat pur de clôture', () => {
  it('cas 1 : RUNNING stale (30min) + tous jobs terminés → zombie', () => {
    const b = batch({ status: 'RUNNING', updatedAt: minutesAgo(30), startedAt: minutesAgo(30) });
    const jobs = [job({ status: 'DONE' }), job({ status: 'ERROR' })];
    expect(isZombieBatch(b, jobs, NOW)).toBe(true);

    // finalStatusFor : 3 sous-assertions selon doneDocs/errorDocs
    expect(finalStatusFor(batch({ doneDocs: 10, errorDocs: 0 }))).toBe('COMPLETED');
    expect(finalStatusFor(batch({ doneDocs: 0, errorDocs: 10 }))).toBe('FAILED');
    expect(finalStatusFor(batch({ doneDocs: 7, errorDocs: 3 }))).toBe('PARTIAL');
  });

  it('cas 2 : RUNNING stale MAIS un job PROCESSING récent (2min) → NON touché', () => {
    const b = batch({ status: 'RUNNING', updatedAt: minutesAgo(30), startedAt: minutesAgo(30) });
    const jobs = [
      job({ status: 'DONE' }),
      job({ status: 'PROCESSING', startedAt: minutesAgo(2), updatedAt: minutesAgo(2) }),
    ];
    expect(isZombieBatch(b, jobs, NOW)).toBe(false);
  });

  it('cas 3 : récent → false ; COMPLETED → false ; PENDING stale sans job actif → true', () => {
    // Batch RUNNING récent (5min) → pas zombie
    expect(
      isZombieBatch(
        batch({ status: 'RUNNING', updatedAt: minutesAgo(5), startedAt: minutesAgo(5) }),
        [job({ status: 'DONE' })],
        NOW,
      ),
    ).toBe(false);

    // Batch déjà COMPLETED → ignoré
    expect(
      isZombieBatch(
        batch({ status: 'COMPLETED', updatedAt: minutesAgo(30) }),
        [job({ status: 'DONE' })],
        NOW,
      ),
    ).toBe(false);

    // Batch PENDING stale sans job actif récent → zombie
    expect(
      isZombieBatch(
        batch({ status: 'PENDING', updatedAt: minutesAgo(30), startedAt: null }),
        [job({ status: 'QUEUED', startedAt: null, updatedAt: minutesAgo(30) })],
        NOW,
      ),
    ).toBe(true);
  });

  it('un job QUEUED récent (< 15min) protège aussi le batch', () => {
    const b = batch({ status: 'PENDING', updatedAt: minutesAgo(30), startedAt: null });
    const jobs = [job({ status: 'QUEUED', startedAt: null, updatedAt: minutesAgo(3) })];
    expect(isZombieBatch(b, jobs, NOW)).toBe(false);
  });
});

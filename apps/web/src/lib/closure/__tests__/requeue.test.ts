import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @qualiof/db + la queue AVANT d'importer le module testé (vi.hoisted).
const { findMany, updateMany, enqueue } = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: { closureJob: { findMany, updateMany } },
}));
vi.mock('../queue-postgres', () => ({ enqueueClosureJob: enqueue }));

import { requeueStuckClosureJobs } from '../requeue';

const NOW = new Date('2026-07-03T12:00:00.000Z');

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset();
  enqueue.mockReset();
});

describe('requeueStuckClosureJobs', () => {
  it('marque les PROCESSING périmés en ERROR et ré-enfile les QUEUED orphelins', async () => {
    // 1er findMany = PROCESSING stale ; 2e findMany = QUEUED
    findMany
      .mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }])
      .mockResolvedValueOnce([
        { id: 'q1', kind: 'SATISFACTION_FROID', participantId: 'part1', batchId: 'b1', batch: { tenantId: 't1', sessionId: 's1' } },
        { id: 'q2', kind: 'ATTESTATION', participantId: 'part2', batchId: 'b1', batch: { tenantId: 't1', sessionId: 's1' } },
      ]);

    const r = await requeueStuckClosureJobs({ now: NOW });

    expect(r).toEqual({ markedError: 2, requeued: 2 });
    // PROCESSING → ERROR
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0]![0].data.status).toBe('ERROR');
    expect(updateMany.mock.calls[0]![0].where.id.in).toEqual(['p1', 'p2']);
    // QUEUED → enqueue avec le jobId existant + payload complet
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith({
      jobId: 'q1', batchId: 'b1', tenantId: 't1', sessionId: 's1', participantId: 'part1', kind: 'SATISFACTION_FROID',
    });
  });

  it('ne touche à rien si aucun job orphelin', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const r = await requeueStuckClosureJobs({ now: NOW });
    expect(r).toEqual({ markedError: 0, requeued: 0 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

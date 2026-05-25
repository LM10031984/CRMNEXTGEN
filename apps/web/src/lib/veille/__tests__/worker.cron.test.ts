import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 13 Plan 13-05 Task 0 — Tests Wave 0 RED pour le cron registration.
 *
 * Stratégie de mock :
 *  - `bullmq` Queue/Worker mockés (jamais de Redis dans les tests).
 *  - `../../closure/redis` getQueueRedis/getWorkerRedis mockés.
 *
 * Coverage (3 tests minimum) :
 *  1. scheduleWeeklyVeille appelle queue.add avec repeat.pattern='0 8 * * 1' (lundi 8h).
 *  2. tz='Europe/Paris'.
 *  3. jobId='weekly-veille-cron' (idempotence native BullMQ).
 */

vi.mock('bullmq', () => {
  const queueAdd = vi.fn().mockResolvedValue(undefined);
  return {
    Queue: vi.fn().mockImplementation(() => ({ add: queueAdd })),
    Worker: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    })),
    __queueAdd: queueAdd,
  };
});

vi.mock('../../closure/redis', () => ({
  getQueueRedis: vi.fn().mockReturnValue({}),
  getWorkerRedis: vi.fn().mockReturnValue({}),
}));

import * as bullmq from 'bullmq';
import { scheduleWeeklyVeille } from '../queue';

const queueAddMock = (bullmq as unknown as { __queueAdd: ReturnType<typeof vi.fn> }).__queueAdd;

beforeEach(() => {
  queueAddMock.mockReset();
  queueAddMock.mockResolvedValue(undefined);
});

describe('scheduleWeeklyVeille — cron registration', () => {
  it('registers the repeat pattern "0 8 * * 1" (lundi 8h)', async () => {
    await scheduleWeeklyVeille();
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const callArgs = queueAddMock.mock.calls[0]!;
    const opts = callArgs[2] as { repeat?: { pattern?: string; tz?: string }; jobId?: string };
    expect(opts.repeat?.pattern).toBe('0 8 * * 1');
  });

  it('uses tz=Europe/Paris', async () => {
    await scheduleWeeklyVeille();
    const callArgs = queueAddMock.mock.calls[0]!;
    const opts = callArgs[2] as { repeat?: { pattern?: string; tz?: string } };
    expect(opts.repeat?.tz).toBe('Europe/Paris');
  });

  it('uses fixed jobId=weekly-veille-cron for idempotence', async () => {
    await scheduleWeeklyVeille();
    const callArgs = queueAddMock.mock.calls[0]!;
    const opts = callArgs[2] as { jobId?: string };
    expect(opts.jobId).toBe('weekly-veille-cron');
  });
});

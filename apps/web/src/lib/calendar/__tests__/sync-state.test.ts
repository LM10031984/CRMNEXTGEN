import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 14 Plan 14-03 Task 2 — wrappers Prisma tenant-scopés `sync-state.ts`.
 *
 * Stratégie de mock (pattern repo, cf invoice-settings.test.ts) :
 *  - `@qualiof/db` → prisma mocké : sessionCalendarSync.{upsert,findMany}.
 *
 * Coverage (acceptance + défensifs) :
 *  1. upsertSyncRecord appelle upsert avec la clé composite sessionId_eventKey.
 *  2. getSyncRecordsForSession passe TOUJOURS tenantId dans le where (multi-tenant).
 *  3. Double upsert même clé = where identique (idempotence, pas de doublon possible).
 *  4. upsert sépare bien create/update (dayIndex optionnel propagé).
 */

// vi.mock est hoisté en haut du fichier : les mocks doivent l'être aussi via vi.hoisted,
// sinon `upsert`/`findMany` ne sont pas encore initialisés quand la factory s'exécute.
const { upsert, findMany } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionCalendarSync: { upsert, findMany },
  },
}));

import { upsertSyncRecord, getSyncRecordsForSession } from '../sync-state';

beforeEach(() => {
  upsert.mockReset();
  findMany.mockReset();
  upsert.mockResolvedValue(undefined);
  findMany.mockResolvedValue([]);
});

describe('upsertSyncRecord', () => {
  it('upsert avec la clé composite { sessionId_eventKey }', async () => {
    await upsertSyncRecord({
      tenantId: 't1',
      sessionId: 'sess-1',
      eventKey: 'qualiof_ses-0097_formation',
      googleEventId: 'gid-1',
      eventType: 'formation',
      syncMode: 'backfill',
      sentUpdates: 'none',
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0]![0];
    expect(arg.where).toEqual({
      sessionId_eventKey: { sessionId: 'sess-1', eventKey: 'qualiof_ses-0097_formation' },
    });
    // create porte le tenantId (defense-in-depth multi-tenant)
    expect(arg.create.tenantId).toBe('t1');
    expect(arg.create.googleEventId).toBe('gid-1');
    // update ne touche pas tenantId/sessionId (immutables) mais rafraîchit l'event
    expect(arg.update.googleEventId).toBe('gid-1');
  });

  it('propage dayIndex (rappel quotidien / relance froid) en create et update', async () => {
    await upsertSyncRecord({
      tenantId: 't1',
      sessionId: 'sess-1',
      eventKey: 'qualiof_ses-0097_rappel_3',
      googleEventId: 'gid-2',
      eventType: 'rappel',
      dayIndex: 3,
      syncMode: 'auto',
      sentUpdates: 'all',
    });

    const arg = upsert.mock.calls[0]![0];
    expect(arg.create.dayIndex).toBe(3);
    expect(arg.update.dayIndex).toBe(3);
    expect(arg.update.sentUpdates).toBe('all');
  });

  it('double upsert même clé = where identique (idempotence)', async () => {
    const rec = {
      tenantId: 't1',
      sessionId: 'sess-1',
      eventKey: 'qualiof_ses-0097_formation',
      googleEventId: 'gid-1',
      eventType: 'formation' as const,
      syncMode: 'backfill' as const,
      sentUpdates: 'none' as const,
    };
    await upsertSyncRecord(rec);
    await upsertSyncRecord({ ...rec, googleEventId: 'gid-1-bis' });

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]![0].where).toEqual(upsert.mock.calls[1]![0].where);
  });
});

describe('getSyncRecordsForSession', () => {
  it('passe TOUJOURS tenantId dans le where (multi-tenant)', async () => {
    await getSyncRecordsForSession('t1', 'sess-1');

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ tenantId: 't1', sessionId: 'sess-1' });
    expect(arg.where.tenantId).toBe('t1');
  });
});

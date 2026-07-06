import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 14 Plan 14-04 Task 2 — orchestrateur idempotent `sync-session.ts`.
 *
 * Stratégie de mock (pattern repo, hoist via vi.hoisted) :
 *  - `./google-client` → getCalendarClient mocké : events.{list,insert,update}.
 *  - `./sync-state`    → upsertSyncRecord mocké (on vérifie qu'il est tracé).
 *  On NE TOUCHE JAMAIS la vraie API Google.
 *
 * Coverage (acceptance) :
 *  (a) 19 events traités au total (1 formation + 15 rappels + 3 froid)
 *  (b) 1er run (events.list vide) = 19 insert, 0 update
 *  (c) 2e run (events.list renvoie un item) = 0 insert, 19 update (IDEMPOTENCE)
 *  (d) isPastSession=true → sendUpdates 'none' sur tous les appels
 *  (e) future + notifyLearners=true → sendUpdates 'all'
 *  (f) attendees contient TOUJOURS trainerEmail
 *  (g) upsertSyncRecord appelé après chaque insert/update (19 fois)
 */

const { eventsList, eventsInsert, eventsUpdate, upsertSyncRecord } = vi.hoisted(() => ({
  eventsList: vi.fn(),
  eventsInsert: vi.fn(),
  eventsUpdate: vi.fn(),
  upsertSyncRecord: vi.fn(),
}));

vi.mock('../google-client', () => ({
  CALENDAR_ID: 'cal-test',
  getCalendarClient: () => ({
    events: { list: eventsList, insert: eventsInsert, update: eventsUpdate },
  }),
}));

vi.mock('../sync-state', () => ({
  upsertSyncRecord,
}));

import { syncSessionCalendar, type SyncSessionInput } from '../sync-session';
import type { SessionEventCtx } from '../event-builders';

const ctx: SessionEventCtx = {
  code: 'SES-0097',
  name: 'Session pilote',
  productTitle: 'IA conseillers immobiliers',
  startDate: new Date('2026-07-15T00:00:00Z'),
  endDate: new Date('2026-07-23T00:00:00Z'),
  locationName: 'Century 21 Mandelieu',
  locationAddressText: '12 av. de Cannes, 06210 Mandelieu',
  programmeDriveId: '1bNZhx2mfPIjizEMo6Z3GGpP_Uj6CGIv7',
  trainerEmail: 'laurent@start-academy.fr',
  trainerName: 'M. Touati',
  learnerEmails: ['a@x.fr', 'b@x.fr'],
  dureeJours: '9',
  dureeH: '72',
  heureDebut: '9h00',
  salutationPrenoms: 'Alice, Bob',
};

function makeInput(over: Partial<SyncSessionInput> = {}): SyncSessionInput {
  return {
    tenantId: 't1',
    sessionId: 'sess-1',
    ctx,
    syncMode: 'auto',
    isPastSession: false,
    notifyLearners: false,
    ...over,
  };
}

beforeEach(() => {
  eventsList.mockReset();
  eventsInsert.mockReset();
  eventsUpdate.mockReset();
  upsertSyncRecord.mockReset();
  // par défaut : aucun event existant → insert
  eventsList.mockResolvedValue({ data: { items: [] } });
  eventsInsert.mockResolvedValue({ data: { id: 'new-id' } });
  eventsUpdate.mockResolvedValue({ data: { id: 'upd-id' } });
  upsertSyncRecord.mockResolvedValue(undefined);
});

describe('syncSessionCalendar — comptage & idempotence', () => {
  it('traite 19 events au total (1 + 15 + 3)', async () => {
    const recap = await syncSessionCalendar(makeInput());
    expect(recap.total).toBe(19);
    expect(recap.inserted + recap.updated + recap.skipped).toBe(19);
  });

  it('1er run = 19 insert, 0 update', async () => {
    const recap = await syncSessionCalendar(makeInput());
    expect(recap.inserted).toBe(19);
    expect(recap.updated).toBe(0);
    expect(eventsInsert).toHaveBeenCalledTimes(19);
    expect(eventsUpdate).not.toHaveBeenCalled();
  });

  it('2e run (event déjà présent) = 0 insert, 19 update (IDEMPOTENCE)', async () => {
    eventsList.mockResolvedValue({ data: { items: [{ id: 'existing-123' }] } });
    const recap = await syncSessionCalendar(makeInput());
    expect(recap.inserted).toBe(0);
    expect(recap.updated).toBe(19);
    expect(eventsInsert).not.toHaveBeenCalled();
    expect(eventsUpdate).toHaveBeenCalledTimes(19);
  });

  it('lookup via events.list privateExtendedProperty=qualiof_key', async () => {
    await syncSessionCalendar(makeInput());
    const call = eventsList.mock.calls[0]![0];
    // calendar_v3 attend un string[] pour privateExtendedProperty
    expect(call.privateExtendedProperty[0]).toMatch(/^qualiof_key=qualiof_ses-0097_/);
  });

  it('upsertSyncRecord tracé après chaque event (19 fois)', async () => {
    await syncSessionCalendar(makeInput());
    expect(upsertSyncRecord).toHaveBeenCalledTimes(19);
  });
});

describe('syncSessionCalendar — sendUpdates & invités', () => {
  it('isPastSession=true → sendUpdates none partout', async () => {
    await syncSessionCalendar(makeInput({ isPastSession: true, notifyLearners: true }));
    for (const call of eventsInsert.mock.calls) {
      expect(call[0].sendUpdates).toBe('none');
    }
  });

  it('future + notifyLearners=true → sendUpdates all', async () => {
    await syncSessionCalendar(makeInput({ isPastSession: false, notifyLearners: true }));
    expect(eventsInsert.mock.calls[0]![0].sendUpdates).toBe('all');
  });

  it('future + notifyLearners=false → sendUpdates none', async () => {
    await syncSessionCalendar(makeInput({ isPastSession: false, notifyLearners: false }));
    expect(eventsInsert.mock.calls[0]![0].sendUpdates).toBe('none');
  });

  it('attendees contient TOUJOURS le formateur (et les apprenants)', async () => {
    await syncSessionCalendar(makeInput());
    const body = eventsInsert.mock.calls[0]![0].requestBody;
    const emails = (body.attendees ?? []).map((a: { email: string }) => a.email);
    expect(emails).toContain('laurent@start-academy.fr');
    expect(emails).toContain('a@x.fr');
    expect(emails).toContain('b@x.fr');
  });
});

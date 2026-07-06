import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 14 Plan 14-05 Task 1 — `load-session-ctx.ts` (contexte session Prisma).
 *
 * Stratégie de mock (pattern repo, cf sync-state.test.ts) :
 *  - `@qualiof/db` → prisma mocké : trainingSession.findFirst.
 *  - findFirst mocké via vi.hoisted (sinon non initialisé quand la factory tourne).
 *
 * Coverage (acceptance) :
 *  1. where contient TOUJOURS tenantId ET id session (multi-tenant).
 *  2. Formateur principal (isPrimary) choisi parmi plusieurs trainers.
 *  3. Fallback sur trainers[0] si aucun isPrimary.
 *  4. learnerEmails filtrent les null et dédupliquent.
 *  5. missingTrainerEmail = true si aucun formateur avec e-mail.
 *  6. session inexistante → null.
 */

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@qualiof/db', () => ({
  prisma: { trainingSession: { findFirst } },
}));

import { loadSessionEventCtx } from '../load-session-ctx';

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    code: 'SES-0097',
    name: 'Cycle complet',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-03'),
    product: { title: 'Prospection IA', durationHours: 16 },
    location: {
      name: 'Century 21 Mandelieu',
      legalName: null,
      address: { street: '495 av. de Cannes', postalCode: '06210', city: 'Mandelieu' },
    },
    trainers: [],
    participants: [],
    ...overrides,
  };
}

beforeEach(() => {
  findFirst.mockReset();
});

describe('loadSessionEventCtx', () => {
  it('where contient tenantId ET id session (multi-tenant)', async () => {
    findFirst.mockResolvedValue(baseSession());
    await loadSessionEventCtx('tenant-1', 'sess-1');

    expect(findFirst).toHaveBeenCalledTimes(1);
    const arg = findFirst.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: 'sess-1', tenantId: 'tenant-1' });
  });

  it('choisit le formateur isPrimary parmi plusieurs trainers', async () => {
    findFirst.mockResolvedValue(
      baseSession({
        trainers: [
          { isPrimary: false, person: { firstName: 'Bob', lastName: 'Co', email: 'bob@x.fr' } },
          { isPrimary: true, person: { firstName: 'Alice', lastName: 'Prim', email: 'alice@x.fr' } },
        ],
      }),
    );
    const res = await loadSessionEventCtx('tenant-1', 'sess-1');
    expect(res!.ctx.trainerEmail).toBe('alice@x.fr');
    expect(res!.ctx.trainerName).toBe('Alice Prim');
    expect(res!.missingTrainerEmail).toBe(false);
  });

  it('fallback sur trainers[0] si aucun isPrimary', async () => {
    findFirst.mockResolvedValue(
      baseSession({
        trainers: [
          { isPrimary: false, person: { firstName: 'Bob', lastName: 'Co', email: 'bob@x.fr' } },
          { isPrimary: false, person: { firstName: 'Carl', lastName: 'Deux', email: 'carl@x.fr' } },
        ],
      }),
    );
    const res = await loadSessionEventCtx('tenant-1', 'sess-1');
    expect(res!.ctx.trainerEmail).toBe('bob@x.fr');
    expect(res!.ctx.trainerName).toBe('Bob Co');
  });

  it('learnerEmails filtre les null et déduplique', async () => {
    findFirst.mockResolvedValue(
      baseSession({
        participants: [
          { person: { firstName: 'A', email: 'a@x.fr' } },
          { person: { firstName: 'B', email: null } },
          { person: { firstName: 'C', email: 'a@x.fr' } }, // doublon
          { person: { firstName: 'D', email: 'd@x.fr' } },
        ],
      }),
    );
    const res = await loadSessionEventCtx('tenant-1', 'sess-1');
    expect(res!.ctx.learnerEmails).toEqual(['a@x.fr', 'd@x.fr']);
  });

  it('missingTrainerEmail = true si aucun formateur avec e-mail', async () => {
    findFirst.mockResolvedValue(baseSession({ trainers: [] }));
    const res = await loadSessionEventCtx('tenant-1', 'sess-1');
    expect(res!.ctx.trainerEmail).toBe('');
    expect(res!.missingTrainerEmail).toBe(true);
  });

  it('durée : 16h → 2 journées (8h = 1 jour)', async () => {
    findFirst.mockResolvedValue(baseSession());
    const res = await loadSessionEventCtx('tenant-1', 'sess-1');
    expect(res!.ctx.dureeH).toBe('16');
    expect(res!.ctx.dureeJours).toBe('2');
  });

  it('session inexistante → null', async () => {
    findFirst.mockResolvedValue(null);
    const res = await loadSessionEventCtx('tenant-1', 'absent');
    expect(res).toBeNull();
  });
});

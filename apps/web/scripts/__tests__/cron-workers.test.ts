import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 20 Plan 20-01 Task 2 — Tests hermétiques des 2 entry-points croner.
 *
 * WORK-02 (D-03 « Redis viré partout ») : les entry-points
 * `scripts/veille-worker.ts` et `scripts/invoice-reminder-worker.ts` enregistrent
 * leur planification via `croner` (plus de BullMQ/Redis). On prouve ici, SANS
 * démarrer aucun cron réel ni charger `.env`, que :
 *  1. veille-worker construit un `Cron('0 8 * * 1', { timezone:'Europe/Paris' })` (lundi 8h).
 *  2. invoice-reminder-worker construit un `Cron('0 8 * * *', { timezone:'Europe/Paris' })` (quotidien 8h).
 *  3. le callback passé à Cron appelle processVeilleJob / processReminderJob avec { triggered_by:'cron' }.
 *
 * Stratégie de mock (HERMÉTIQUE, pattern vi.hoisted projet — cf 17-02/18-01) :
 *  - `@qualiof/shared/env` → getter sur `mockEnv` hoisté (l'import top-level
 *    `import '@qualiof/shared/env'` ne charge pas `.env` réel au collect).
 *  - `croner` → faux `Cron` class dont le constructeur est spyable ; il CAPTURE
 *    le pattern, les options et le callback ; `nextRun()`/`stop()` sont des no-op.
 *  - les 2 handlers métier → mockés pour capturer l'appel du callback.
 *
 * Les modules entry-point s'exécutent au TOP-LEVEL à l'import (enregistrent le
 * cron, posent des handlers SIGINT/SIGTERM). On utilise `vi.resetModules()` +
 * `await import(...)` par test pour un enregistrement propre et isolé.
 *
 * PROTOCOLE DE MUTATION (non commité, à exécuter à la main pour prouver le garde —
 * feedback_test_de_puissance_mutation) :
 *   Dans veille-worker.ts, changer '0 8 * * 1' → '0 8 * * 2'.
 *   → Test 1 DOIT virer ROUGE. → restaurer → VERT.
 */

const { mockEnv, cronCtor, processVeilleJob, processReminderJob, purgeEmailMessages } = vi.hoisted(
  () => ({
    mockEnv: {
      DATABASE_URL: 'postgres://test',
      DIRECT_URL: 'postgres://test',
    },
    // Spy sur le constructeur croner : capture (pattern, options, callback).
    cronCtor: vi.fn(),
    processVeilleJob: vi.fn().mockResolvedValue([]),
    processReminderJob: vi.fn().mockResolvedValue({ processed: 0 }),
    // Lot 0 · 0.2 — purge RGPD des traces d'envoi, greffée sur le même cron.
    purgeEmailMessages: vi.fn().mockResolvedValue({ examinees: 0, supprimees: 0, dryRun: false }),
  }),
);

vi.mock('@qualiof/shared/env', () => ({
  get sharedEnv() {
    return mockEnv;
  },
}));

vi.mock('croner', () => {
  class Cron {
    constructor(pattern: string, options: unknown, callback: () => unknown) {
      cronCtor(pattern, options, callback);
    }
    nextRun() {
      return new Date('2026-01-05T08:00:00.000Z');
    }
    stop() {
      return true;
    }
  }
  return { Cron };
});

vi.mock('../../src/lib/veille/worker', () => ({
  processVeilleJob,
}));

vi.mock('../../src/lib/invoice-reminders/worker', () => ({
  processReminderJob,
}));

vi.mock('../../src/lib/rgpd/purge-email-messages', () => ({
  purgeExpiredEmailMessages: purgeEmailMessages,
}));

beforeEach(() => {
  cronCtor.mockClear();
  processVeilleJob.mockClear();
  processReminderJob.mockClear();
  purgeEmailMessages.mockClear();
  purgeEmailMessages.mockResolvedValue({ examinees: 0, supprimees: 0, dryRun: false });
  vi.resetModules();
});

describe('veille-worker — enregistrement croner', () => {
  it('Test 1 — construit Cron("0 8 * * 1", { timezone: "Europe/Paris" }) (lundi 8h)', async () => {
    await import('../veille-worker');

    expect(cronCtor).toHaveBeenCalledTimes(1);
    const [pattern, options] = cronCtor.mock.calls[0]!;
    expect(pattern).toBe('0 8 * * 1');
    expect((options as { timezone?: string }).timezone).toBe('Europe/Paris');
    expect((options as { name?: string }).name).toBe('veille');
  });

  it("Test 3a — le callback appelle processVeilleJob({ triggered_by: 'cron' })", async () => {
    await import('../veille-worker');

    const callback = cronCtor.mock.calls[0]![2] as () => Promise<unknown>;
    await callback();

    expect(processVeilleJob).toHaveBeenCalledTimes(1);
    expect(processVeilleJob).toHaveBeenCalledWith({ triggered_by: 'cron' });
  });
});

describe('invoice-reminder-worker — purge RGPD greffée sur le cron quotidien', () => {
  it('Test 4 — le callback quotidien lance la purge des traces d’envoi échues', async () => {
    await import('../invoice-reminder-worker');
    const callback = cronCtor.mock.calls[0]![2] as () => Promise<unknown>;
    await callback();

    expect(purgeEmailMessages).toHaveBeenCalledTimes(1);
  });

  it('Test 5 — une purge en échec ne prive pas Laurent de ses relances', async () => {
    // L'ordre compte : les relances passent d'abord, la purge ensuite et dans
    // son propre try. Une base indisponible côté purge ne doit ni faire tomber
    // le callback, ni empêcher l'envoi des relances déjà effectué.
    purgeEmailMessages.mockRejectedValueOnce(new Error('base indisponible'));

    await import('../invoice-reminder-worker');
    const callback = cronCtor.mock.calls[0]![2] as () => Promise<unknown>;

    await expect(callback()).resolves.toBeUndefined();
    expect(processReminderJob).toHaveBeenCalledTimes(1);
  });
});

describe('invoice-reminder-worker — enregistrement croner', () => {
  it('Test 2 — construit Cron("0 8 * * *", { timezone: "Europe/Paris" }) (quotidien 8h)', async () => {
    await import('../invoice-reminder-worker');

    expect(cronCtor).toHaveBeenCalledTimes(1);
    const [pattern, options] = cronCtor.mock.calls[0]!;
    expect(pattern).toBe('0 8 * * *');
    expect((options as { timezone?: string }).timezone).toBe('Europe/Paris');
    expect((options as { name?: string }).name).toBe('invoice-reminders');
  });

  it("Test 3b — le callback appelle processReminderJob({ triggered_by: 'cron' })", async () => {
    await import('../invoice-reminder-worker');

    const callback = cronCtor.mock.calls[0]![2] as () => Promise<unknown>;
    await callback();

    expect(processReminderJob).toHaveBeenCalledTimes(1);
    expect(processReminderJob).toHaveBeenCalledWith({ triggered_by: 'cron' });
  });
});

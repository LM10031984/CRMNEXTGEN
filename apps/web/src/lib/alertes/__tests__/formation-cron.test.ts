import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ flush: vi.fn(), check: vi.fn(), reimbursements: vi.fn() }));
vi.mock('../formation-notifier', () => ({ flushFormationEventAlerts: m.flush }));
vi.mock('../formation-check', () => ({
  checkFormationDocuments: m.check,
  checkReimbursementReminders: m.reimbursements,
}));
import { GET } from '@/app/api/cron/formation-alerts/route';
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'cron-test';
  m.flush.mockResolvedValue(0);
  m.check.mockImplementation(async (_now, _id, metrics) => {
    metrics.sent += 1;
    return 2;
  });
  m.reimbursements.mockResolvedValue(1);
});
describe('formation cron authorization', () => {
  it('rejects missing or incorrect secrets without reading or sending anything', async () => {
    expect((await GET(new Request('https://example.test/api/cron/formation-alerts'))).status).toBe(
      401,
    );
    delete process.env.CRON_SECRET;
    expect((await GET(new Request('https://example.test/api/cron/formation-alerts'))).status).toBe(
      503,
    );
    expect(m.flush).not.toHaveBeenCalled();
    expect(m.check).not.toHaveBeenCalled();
    expect(m.reimbursements).not.toHaveBeenCalled();
  });
  it('replays queued events and checks current dossiers when authorized', async () => {
    const result = await GET(
      new Request('https://example.test/api/cron/formation-alerts', {
        headers: { authorization: 'Bearer cron-test' },
      }),
    );
    expect(await result.json()).toEqual({
      ok: true,
      examined: 2,
      reimbursements: 1,
      sent: 1,
      errors: 0,
    });
    expect(m.flush).toHaveBeenCalledOnce();
    expect(m.check).toHaveBeenCalledOnce();
    expect(m.reimbursements).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock('@qualiof/db', () => ({ prisma: { emailMessage: m } }));
vi.mock('@/lib/mailer', () => ({ sendMail: m.sendMail }));
import { deliverFormationAlert, queueFormationAlert } from '../formation-notifier';
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = 'https://qualiof.example';
  m.updateMany.mockResolvedValue({ count: 1 });
  m.findUniqueOrThrow.mockResolvedValue({
    tenantId: 't',
    subject: 'Test',
    bodyHtml: '<p>Test</p>',
    relatedEntity: JSON.stringify({ sessionId: 's' }),
  });
});
describe('formation durable delivery', () => {
  it('derives tenant-scoped stable ids, escapes user text and stores no attachments', async () => {
    const input = {
      tenantId: 't',
      key: 'session:s',
      subject: 'Session',
      lines: ['<script>'],
      path: '/app/sessions/s',
    };
    expect(await queueFormationAlert(input)).toBe(await queueFormationAlert(input));
    const data = m.upsert.mock.calls[0]![0].create;
    expect(data.bodyHtml).toContain('&lt;script&gt;');
    expect(data.documentIds).toBeUndefined();
    expect(data.toEmails).toEqual(['formation@start-academy.fr']);
  });
  it.each([
    { ok: true, dryRun: true },
    { ok: true, suppressed: true },
  ])('does not mark a suppressed send as sent', async (result) => {
    m.sendMail.mockResolvedValue(result);
    await deliverFormationAlert('id');
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'id' },
      data: { status: 'queued', sentAt: null },
    });
  });
  it('only the winner of the atomic claim sends', async () => {
    m.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    m.sendMail.mockResolvedValue({ ok: true });
    await Promise.all([deliverFormationAlert('id'), deliverFormationAlert('id')]);
    expect(m.sendMail).toHaveBeenCalledTimes(1);
    expect(m.update.mock.calls[0]![0].data.status).toBe('sent');
  });
  it('replays a queued dry-run once delivery is enabled', async () => {
    m.sendMail
      .mockResolvedValueOnce({ ok: true, dryRun: true })
      .mockResolvedValueOnce({ ok: true });
    await deliverFormationAlert('id');
    await deliverFormationAlert('id');
    expect(m.update.mock.calls.map((call) => call[0].data.status)).toEqual(['queued', 'sent']);
  });
  it('keeps the event queued if the application URL is not configured', async () => {
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    await deliverFormationAlert('id');
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.sendMail).not.toHaveBeenCalled();
  });
  it('holds uncertain failures for review instead of blindly retrying', async () => {
    m.sendMail.mockResolvedValue({ ok: false, error: 'timeout' });
    await deliverFormationAlert('id');
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'id' }, data: { status: 'uncertain' } });
  });
});

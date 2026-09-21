import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  invoice: vi.fn(),
  participant: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@/lib/rbac', () => ({
  requireRole: m.auth,
  UnauthorizedError: class extends Error {},
  ForbiddenError: class extends Error {},
}));
vi.mock('@qualiof/db', () => ({
  prisma: { invoice: { findFirst: m.invoice }, sessionParticipant: { findFirst: m.participant } },
}));
vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'docs', downloadFile: m.download }));
import { GET } from '../route';
function invoice() {
  return {
    id: 'invoice',
    number: 'FAC-0001',
    status: 'ISSUED',
    pdfUrl: 'ordinary/invoice.pdf',
    paidAt: null,
    amountPaid: 0,
    participantId: 'learner',
    participantIds: null,
    sessionId: 'session',
    payerOrgId: 'payer',
    payerOrg: { legalName: 'Entreprise', brandName: null },
    participant: {
      sessionId: 'session',
      sponsorOrgId: 'payer',
      person: { firstName: 'Alice', lastName: 'Test' },
    },
  };
}
const request = () =>
  GET(new Request('https://example.test/api/after-training/session/attachments/invoice/invoice'), {
    params: Promise.resolve({ sessionId: 'session', kind: 'invoice', attachmentId: 'invoice' }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ id: 'admin', tenantId: 'tenant' });
  m.invoice.mockResolvedValue(invoice());
  m.download.mockResolvedValue(Buffer.from('ordinary invoice'));
});
it.each(['ISSUED', 'PARTIAL', 'OVERDUE', 'PAID'])(
  'sert le PDF ordinaire émis, sans condition de paiement : %s',
  async (status) => {
    m.invoice.mockResolvedValue({ ...invoice(), status });
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ordinary invoice');
    expect(m.download).toHaveBeenCalledWith('docs', 'ordinary/invoice.pdf');
    expect(response.headers.get('content-disposition')).toContain(
      'Facture-FAC-0001-Entreprise.pdf',
    );
    expect(m.invoice).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'invoice', tenantId: 'tenant' } }),
    );
  },
);
it.each(['DRAFT', 'CANCELLED', 'CREDIT_NOTE'])(
  'refuse une pièce qui n’est pas une facture ordinaire active : %s',
  async (status) => {
    m.invoice.mockResolvedValue({ ...invoice(), status });
    expect((await request()).status).toBe(404);
    expect(m.download).not.toHaveBeenCalled();
  },
);
it('conserve les contrôles de session, payeur, groupe et tenant', async () => {
  for (const change of [
    { sessionId: 'other-session' },
    { payerOrgId: 'other-payer' },
    { participantIds: ['learner', 'another'] },
  ]) {
    m.invoice.mockResolvedValue({ ...invoice(), ...change });
    expect((await request()).status).toBe(404);
  }
  m.invoice.mockResolvedValue(null);
  expect((await request()).status).toBe(404);
  expect(m.download).not.toHaveBeenCalled();
});

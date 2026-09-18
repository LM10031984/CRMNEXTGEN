import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), person: vi.fn(), doc: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateRequest: m.auth }));
vi.mock('@qualiof/db', () => ({
  prisma: { sessionParticipant: { findFirst: m.person }, document: { findFirst: m.doc } },
}));
vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'docs', downloadFile: m.download }));
import { GET } from '../route';
const context = { params: { sessionId: 'session', participantId: 'person', docType: 'ASSIDUITE' } };
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { tenantId: 'tenant' } });
  m.person.mockResolvedValue({
    docStatus: {
      ASSIDUITE: {
        state: 'MANUAL_OK',
        uploadedSignedPdfKey: 'scan.pdf',
        uploadedSignedAt: '2026-01-01',
      },
    },
  });
  m.doc.mockResolvedValue(null);
  m.download.mockResolvedValue(Buffer.from('%PDF-1.7'));
});
it('sert le scan en consultation privée et borne la requête au tenant et à la session', async () => {
  const r = await GET(new Request('https://example.test'), context);
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toContain('no-store');
  expect(r.headers.get('content-disposition')).toContain('inline');
  expect(m.person).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'person', sessionId: 'session', session: { tenantId: 'tenant' } },
    }),
  );
  expect(m.download).toHaveBeenCalledWith('docs', 'scan.pdf');
});
it('refuse un apprenant hors périmètre sans accéder au stockage', async () => {
  m.person.mockResolvedValue(null);
  expect((await GET(new Request('https://example.test'), context)).status).toBe(404);
  expect(m.download).not.toHaveBeenCalled();
});
it('exige une session authentifiée', async () => {
  m.auth.mockResolvedValue({ user: null });
  expect((await GET(new Request('https://example.test'), context)).status).toBe(401);
  expect(m.person).not.toHaveBeenCalled();
});
it('ne sert jamais le PDF vierge à la place du signé', async () => {
  m.person.mockResolvedValue({ docStatus: {} });
  m.doc.mockResolvedValue({ signedPdfUrl: null, createdAt: new Date() });
  expect((await GET(new Request('https://example.test'), context)).status).toBe(404);
  expect(m.download).not.toHaveBeenCalled();
});

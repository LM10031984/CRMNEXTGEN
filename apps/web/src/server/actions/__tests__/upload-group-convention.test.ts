import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  role: vi.fn(),
  participants: vi.fn(),
  doc: vi.fn(),
  create: vi.fn(),
  upload: vi.fn(),
  audit: vi.fn(),
  lock: vi.fn(),
}));
vi.mock('@/lib/rbac', () => ({ requireRole: m.role }));
vi.mock('@/lib/storage', () => ({ uploadFile: m.upload, DOCS_BUCKET: 'private' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@qualiof/db', () => {
  const db = {
    sessionParticipant: { findMany: m.participants },
    document: { findFirst: m.doc, create: m.create },
    auditLog: { create: m.audit },
    $executeRaw: m.lock,
  };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
import { uploadGroupConvention } from '../upload-group-convention';
const data = () => {
  const d = new FormData();
  d.set('sessionId', 's');
  d.set('sponsorOrgId', 'org');
  d.set('file', new File(['%PDF-1.7 test'], 'Convention OPCO.pdf'));
  return d;
};
beforeEach(() => {
  vi.resetAllMocks();
  m.role.mockResolvedValue({ id: 'u', tenantId: 'tenant' });
  m.participants.mockResolvedValue(
    ['a', 'b'].map((id) => ({
      id,
      sponsorOrgId: 'org',
      session: { regime: 'ENTREPRISE' },
      person: { legalLinks: [] },
    })),
  );
  m.doc.mockResolvedValue(null);
  m.create.mockResolvedValue({ id: 'doc' });
});
it('un seul PDF signé au nom de l’entreprise couvre ses deux salariés', async () => {
  expect(await uploadGroupConvention(data())).toEqual({ ok: true, covered: 2 });
  expect(m.participants.mock.calls[0]![0].where).toMatchObject({
    sessionId: 's',
    sponsorOrgId: 'org',
    session: { tenantId: 'tenant' },
  });
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.create.mock.calls[0]![0].data).toMatchObject({
    tenantId: 'tenant',
    entityType: 'organization',
    entityId: 'org',
    sessionId: 's',
    participantId: null,
    signatureKind: 'MANUAL_SCAN',
    status: 'signed',
    signedPdfUrl: expect.any(String),
  });
  expect(m.audit.mock.calls[0]![0].data.diff.coveredParticipantIds).toEqual(['a', 'b']);
});
it('refuse une entreprise hors session/tenant ou un groupe indépendant', async () => {
  m.participants
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        id: 'a',
        sponsorOrgId: 'org',
        session: { regime: 'INDIVIDUEL' },
        person: { legalLinks: [] },
      },
    ]);
  expect((await uploadGroupConvention(data())).ok).toBe(false);
  expect((await uploadGroupConvention(data())).ok).toBe(false);
  expect(m.upload).not.toHaveBeenCalled();
});
it('ne remplace pas une convention en cours de signature électronique', async () => {
  m.doc.mockResolvedValue({ id: 'active' });
  expect((await uploadGroupConvention(data())).ok).toBe(false);
  expect(m.upload).not.toHaveBeenCalled();
});
it('revérifie l’envoi DocuSeal avant de publier la convention commune', async () => {
  m.doc.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'new-active' });
  expect((await uploadGroupConvention(data())).ok).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
});

it('un salarié reste éligible au dépôt commun même si le même commanditaire porte aussi une inscription indépendante', async () => {
  const session = { regime: null, startDate: new Date('2026-11-20'), endDate: new Date('2026-11-20') };
  m.participants.mockResolvedValue([
    { id: 'pierre', sponsorOrgId: 'org', session, person: { legalLinks: [{ organizationId: 'org', role: 'SALARIE' }] } },
    { id: 'independant', sponsorOrgId: 'org', session, person: { legalLinks: [{ organizationId: 'org', role: 'AGENT_COMMERCIAL' }] } },
  ]);
  expect(await uploadGroupConvention(data())).toEqual({ ok: true, covered: 1 });
  expect(m.audit.mock.calls[0]![0].data.diff.coveredParticipantIds).toEqual(['pierre']);
});

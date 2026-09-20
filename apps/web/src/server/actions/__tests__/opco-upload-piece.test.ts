import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  role: vi.fn(),
  sub: vi.fn(),
  build: vi.fn(),
  upload: vi.fn(),
  cni: vi.fn(),
  rib: vi.fn(),
  cfp: vi.fn(),
  audit: vi.fn(),
  refresh: vi.fn(),
  lock: vi.fn(),
}));
vi.mock('@/lib/rbac', () => ({ requireRole: m.role }));
vi.mock('@/lib/storage', () => ({ uploadFile: m.upload, DOCS_BUCKET: 'private' }));
vi.mock('@/lib/opco/build-submission', () => ({ buildOpcoSubmission: m.build }));
vi.mock('../opco-submission', () => ({ refreshOpcoSubmissionDraft: m.refresh }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@qualiof/db', () => {
  const db = {
    opcoSubmission: { findFirst: m.sub },
    sensitiveData: { upsert: m.cni },
    person: { update: m.rib },
    ageficeProfile: { update: m.cfp },
    auditLog: { create: m.audit },
    $executeRaw: m.lock,
  };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
import { uploadOpcoPiece } from '../opco-upload-piece';
function data(kind = 'CNI', content = '%PDF-1.7 test') {
  const form = new FormData();
  form.set('submissionId', 'sub');
  form.set('kind', kind);
  form.set('file', new File([content], 'scan.pdf', { type: 'application/pdf' }));
  form.set('personId', 'attacker');
  form.set('organizationId', 'other-tenant');
  return form;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.role.mockResolvedValue({ id: 'u', tenantId: 'tenant', role: 'ADMIN' });
  m.sub.mockResolvedValue({ id: 'sub', participantId: 'p', stage: 'PRISE_EN_CHARGE' });
  m.build.mockResolvedValue({
    ok: true,
    agefice: true,
    profileId: 'correct-profile',
    participant: { personId: 'correct-person', sponsorOrgId: 'correct-org' },
  });
  m.refresh.mockResolvedValue({ ok: true });
});
describe('dépôt lié au dossier', () => {
  it('enregistre la CNI sur la personne du dossier puis actualise les pièces', async () => {
    expect(await uploadOpcoPiece(data())).toEqual({ ok: true });
    expect(m.sub).toHaveBeenCalledWith({
      where: { id: 'sub', tenantId: 'tenant', status: 'DRAFT', deliveryState: 'READY' },
    });
    expect(m.cni.mock.calls[0]![0]).toMatchObject({
      where: { personId: 'correct-person' },
      update: { idDocumentUrl: expect.stringContaining('apprenants/tenant/correct-person/') },
    });
    expect(m.refresh).toHaveBeenCalledWith('sub');
  });
  it('rattache la CFP au profil choisi par le dossier et non à la première EI', async () => {
    await uploadOpcoPiece(data('CFP_ATTESTATION'));
    expect(m.cfp.mock.calls[0]![0].where).toEqual({ id: 'correct-profile' });
    expect(m.cni).not.toHaveBeenCalled();
  });
  it('rattache le RIB à la fiche personne', async () => {
    await uploadOpcoPiece(data('RIB'));
    expect(m.rib.mock.calls[0]![0]).toMatchObject({
      where: { id: 'correct-person' },
      data: { ribKey: expect.any(String) },
    });
  });
  it('refuse un dossier hors tenant avant tout stockage', async () => {
    m.sub.mockResolvedValue(null);
    expect((await uploadOpcoPiece(data())).ok).toBe(false);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it('refuse un faux PDF et les pièces personnelles sur un dossier salarié', async () => {
    expect((await uploadOpcoPiece(data('CNI', '<html>test</html>'))).ok).toBe(false);
    m.build.mockResolvedValue({ ok: true, agefice: false });
    expect((await uploadOpcoPiece(data())).ok).toBe(false);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it('ne modifie pas les sources si un envoi a commencé pendant le téléversement', async () => {
    m.sub
      .mockResolvedValueOnce({ id: 'sub', participantId: 'p', stage: 'PRISE_EN_CHARGE' })
      .mockResolvedValueOnce(null);
    expect((await uploadOpcoPiece(data())).ok).toBe(false);
    expect(m.cni).not.toHaveBeenCalled();
    expect(m.refresh).not.toHaveBeenCalled();
  });
});

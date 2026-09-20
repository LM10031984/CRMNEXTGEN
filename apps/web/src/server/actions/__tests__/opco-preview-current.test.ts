import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  role: vi.fn(),
  sub: vi.fn(),
  build: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('@/lib/rbac', () => ({ requireRole: m.role }));
vi.mock('@qualiof/db', () => {
  const tx = {
    opcoSubmission: { findFirst: m.sub, updateMany: m.update },
    auditLog: { create: m.audit },
  };
  return { Prisma: {}, prisma: { ...tx, $transaction: (fn: any) => fn(tx) } };
});
vi.mock('@/lib/opco/build-submission', () => ({ buildOpcoSubmission: m.build }));
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn() }));
vi.mock('@/lib/storage', () => ({
  downloadFile: vi.fn(),
  objectExists: vi.fn(),
  DOCS_BUCKET: 'docs',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { getOpcoSubmission, updateOpcoSubmissionDraft } from '../opco-submission';
const current = [
  {
    kind: 'CONVENTION',
    filename: 'convention.pdf',
    key: 'signed.pdf',
    included: true,
    signe: true,
  },
  {
    kind: 'PROGRAMME',
    filename: 'programme.pdf',
    key: 'product-programme.pdf',
    included: true,
    signe: false,
  },
];
function sub(over: Record<string, unknown> = {}) {
  return {
    id: 'draft',
    tenantId: 'tenant',
    participantId: 'p',
    status: 'DRAFT',
    deliveryState: 'READY',
    stage: 'PRISE_EN_CHARGE',
    attachments: [current[0]],
    recipientEmail: 'initial@test.fr',
    participant: {
      sponsorOrgId: 'company',
      session: { regime: 'ENTREPRISE' },
      person: { legalLinks: [] },
    },
    ...over,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  m.update.mockResolvedValue({ count: 1 });
  m.role.mockResolvedValue({ id: 'user', tenantId: 'tenant', role: 'ADMIN' });
  m.sub.mockResolvedValue(sub());
  m.build.mockResolvedValue({
    ok: true,
    attachments: current,
    recipientEmail: 'history@test.fr',
    routing: { department: null, selected: null, options: [] },
  });
});
describe('aperçu des pièces courantes', () => {
  it('réintègre le programme catalogue absent de l’ancien brouillon sans modifier la base à la lecture', async () => {
    const view = await getOpcoSubmission('draft');
    expect(view?.attachments).toEqual(current);
    expect(m.sub.mock.calls[0]![0].where).toEqual({ id: 'draft', tenantId: 'tenant' });
  });
  it('conserve le choix de décocher une pièce déjà présente', async () => {
    m.sub.mockResolvedValue(sub({ attachments: [{ ...current[0], included: false }] }));
    const attachments = (await getOpcoSubmission('draft'))?.attachments as unknown as {
      included: boolean;
    }[];
    expect(attachments[0]?.included).toBe(false);
  });
  it.each(['SENT', 'ACK_RECEIVED', 'REIMBURSED'])(
    'conserve les pièces historiques pour %s',
    async (status) => {
      m.sub.mockResolvedValue(sub({ status }));
      expect((await getOpcoSubmission('draft'))?.attachments).toEqual([current[0]]);
    },
  );
  it('ne change pas un aperçu verrouillé en cours de remise SMTP', async () => {
    m.sub.mockResolvedValue(sub({ deliveryState: 'SENDING' }));
    expect((await getOpcoSubmission('draft'))?.attachments).toEqual([current[0]]);
  });
  it('reprend le destinataire historique dans l’aperçu de remboursement', async () => {
    m.sub.mockResolvedValue(sub({ stage: 'FIN_FORMATION' }));
    expect((await getOpcoSubmission('draft'))?.recipientEmail).toBe('history@test.fr');
  });
});

describe('enregistrer les pièces de l’aperçu courant', () => {
  it('accepte le programme courant relu au serveur même absent de l’ancien brouillon', async () => {
    const result = await updateOpcoSubmissionDraft('draft', { attachments: current as any });
    expect(result.ok).toBe(true);
    expect(m.update.mock.calls[0]![0].data.attachments).toEqual(current);
  });
  it('refuse une clé ou preuve de signature forgée', async () => {
    const result = await updateOpcoSubmissionDraft('draft', {
      attachments: [{ ...current[0], key: 'other-tenant/private.pdf' }, current[1]] as any,
    });
    expect(result.ok).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
});

it('refuse de falsifier la preuve de signature du programme courant', async () => {
  const result = await updateOpcoSubmissionDraft('draft', {
    attachments: current.map((a) => (a.kind === 'PROGRAMME' ? { ...a, signe: true } : a)) as any,
  });
  expect(result.ok).toBe(false);
  expect(m.update).not.toHaveBeenCalled();
});

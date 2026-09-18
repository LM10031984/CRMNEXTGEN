import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  sessions: vi.fn(),
  document: vi.fn(),
  previous: vi.fn(),
  queue: vi.fn(),
  deliver: vi.fn(),
}));
vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findMany: m.sessions },
    document: { findMany: m.document },
    emailMessage: { findFirst: m.previous },
  },
}));
vi.mock('../formation-notifier', () => ({
  queueFormationAlert: m.queue,
  deliverFormationAlert: m.deliver,
}));
import { checkFormationDocuments } from '../formation-check';
const now = new Date('2026-09-18T12:00:00Z');
beforeEach(() => {
  vi.clearAllMocks();
  m.previous.mockResolvedValue(null);
  m.queue.mockResolvedValue('mail');
  m.document.mockResolvedValue([{ id: 'signed',participantId:'p',signedPdfUrl:'signed.pdf' }]);
});
const session = () => ({
  id: 's',
  tenantId: 't',
  name: 'Formation',
  status: 'OPEN',
  startDate: new Date('2026-09-20'),
  participants: [
    {
      id: 'p',
      sponsorOrgId: 'org',
      personId: 'person',
      person: {
        firstName: 'Jean',
        lastName: 'Martin',
        ribKey: 'rib',
        sensitiveData: { idDocumentUrl: 'cni' },
      },
      sponsorOrg: { ageficeProfile: { cfpAttestationKey: 'cfp' } },
    },
  ],
  preEnrollments: [],
});
describe('current dossier validation before alert', () => {
  it('does not deliver any old queued reminder once the dossier is complete', async () => {
    m.sessions.mockResolvedValue([session()]);
    await checkFormationDocuments(now);
    expect(m.deliver).not.toHaveBeenCalled();
  });
  it('requires a signed document, not just a participant checkbox', async () => {
    m.sessions.mockResolvedValue([session()]);
    m.document.mockResolvedValue([]);
    await checkFormationDocuments(now);
    expect(m.queue.mock.calls[0]![0].lines.join(' ')).toContain('convention signée');
    expect(m.deliver).toHaveBeenCalledWith('mail');
  });
  it('alerts late public enrollments before conversion and without sensitive data', async () => {
    m.sessions.mockResolvedValue([
      {
        ...session(),
        participants: [],
        preEnrollments: [
          {
            id: 'pe',
            firstName: 'Jeanne',
            lastName: 'Martin',
            cniKey: 'cni',
            ribKey: null,
            cfpKey: 'cfp',
          },
        ],
      },
    ]);
    await checkFormationDocuments(now, 's');
    const input = m.queue.mock.calls[0]![0];
    expect(input.path).toBe('/app/inscriptions/pe');
    expect(input.lines.join(' ')).toContain('RIB, convention signée');
    expect(input.attachments).toBeUndefined();
  });
  it('suppresses reminders less than seven days after real delivery', async () => {
    m.sessions.mockResolvedValue([session()]);
    m.document.mockResolvedValue([]);
    m.previous.mockResolvedValue({ sentAt: new Date('2026-09-17') });
    await checkFormationDocuments(now);
    expect(m.queue).not.toHaveBeenCalled();
  });
});


it('ne réutilise pas la signature d’une ancienne convention quand la dernière est non signée', async()=>{
  m.sessions.mockResolvedValue([session()]);
  m.document.mockResolvedValue([{id:'new',participantId:'p',signedPdfUrl:null},{id:'old',participantId:'p',signedPdfUrl:'old.pdf'}]);
  await checkFormationDocuments(now);
  expect(m.queue.mock.calls[0]![0].lines.join(' ')).toContain('convention signée');
});

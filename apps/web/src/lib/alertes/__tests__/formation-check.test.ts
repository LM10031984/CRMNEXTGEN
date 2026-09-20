import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  sessions: vi.fn(),
  documents: vi.fn(),
  previous: vi.fn(),
  invoices: vi.fn(),
  programme: vi.fn(),
  queue: vi.fn(),
  deliver: vi.fn(),
}));
vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findMany: m.sessions },
    document: { findMany: m.documents },
    emailMessage: { findFirst: m.previous },
    invoice: { findMany: m.invoices },
  },
}));
vi.mock('@/lib/opco/programme', () => ({ resolveProgrammeDocument: m.programme }));
vi.mock('../formation-notifier', () => ({
  queueFormationAlert: m.queue,
  deliverFormationAlert: m.deliver,
}));
import { checkFormationDocuments, checkReimbursementReminders } from '../formation-check';

const now = new Date('2026-09-18T12:00:00Z');
function participant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    sponsorOrgId: 'org-agefice',
    participantType: 'Dirigeant',
    financingMode: 'OPCO',
    enrollmentStatus: 'CONFIRMED',
    opcoDepositedAt: null,
    opcoDepositedByEmail: null,
    docStatus: null,
    person: {
      firstName: 'Jean',
      lastName: 'Martin',
      ribKey: 'rib.pdf',
      sensitiveData: { idDocumentUrl: 'cni.pdf' },
      legalLinks: [
        {
          organizationId: 'org-agefice',
          role: 'EI_SELF',
          startDate: new Date('2025-01-01'),
          endDate: null,
          organization: { id: 'org-agefice', ageficeProfile: { cfpAttestationKey: 'cfp.pdf' } },
        },
      ],
    },
    sponsorOrg: {
      legalName: 'Martin EI',
      opcoCode: 'AGEFICE',
      ageficeProfile: { cfpAttestationKey: 'cfp.pdf' },
    },
    opcoSubmissions: [],
    ...overrides,
  };
}
function session(participants = [participant()]) {
  return {
    id: 's1',
    tenantId: 'tenant-1',
    productId: 'product-1',
    name: 'Formation',
    status: 'OPEN',
    regime: 'INDIVIDUEL',
    startDate: new Date('2026-09-20T08:00:00+02:00'),
    endDate: new Date('2026-09-22T17:00:00+02:00'),
    participants,
    preEnrollments: [],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.previous.mockResolvedValue(null);
  m.queue.mockResolvedValue('queued-id');
  m.programme.mockResolvedValue({ id: 'programme', pdfUrl: 'programme.pdf' });
  m.documents.mockImplementation(({ where }: any) => {
    if (where.type === 'CONVENTION')
      return Promise.resolve([
        { id: 'convention', participantId: 'p1', signedPdfUrl: 'signed-convention.pdf' },
      ]);
    if (where.type === 'AGEFICE')
      return Promise.resolve([
        { id: 'agefice', participantId: 'p1', signedPdfUrl: 'signed-agefice.pdf' },
      ]);
    return Promise.resolve([
      { id: 'attendance', type: 'EMARGEMENT', participantId: 'p1', signedPdfUrl: 'attendance.pdf' },
      { id: 'assiduity', type: 'ASSIDUITE', participantId: 'p1', signedPdfUrl: 'assiduity.pdf' },
    ]);
  });
  m.invoices.mockResolvedValue([
    {
      id: 'invoice',
      status: 'PAID',
      paidAt: new Date('2026-09-17'),
      amountPaid: 1200,
      amountTTC: 1200,
      creditNotes: [],
      payments: [],
    },
  ]);
});

describe('J-21 funding alerts', () => {
  it('requires all six AGEFICE pieces, including signed form and shared programme', async () => {
    m.sessions.mockResolvedValue([session()]);
    m.documents.mockResolvedValue([]);
    m.programme.mockResolvedValue(null);
    await checkFormationDocuments(now);
    const text = m.queue.mock.calls[0]![0].lines.join(' ');
    expect(text).toContain('convention signée');
    expect(text).toContain('formulaire AGEFICE signé');
    expect(text).toContain('programme de formation');
    expect(m.programme).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      sessionId: 's1',
      productId: 'product-1',
      participantId: 'p1',
      sponsorOrgId: 'org-agefice',
    });
    expect(m.documents.mock.calls.every((call) => call[0].where.tenantId === 'tenant-1')).toBe(
      true,
    );
  });

  it('alerts when a complete AGEFICE dossier has no real successful initial send', async () => {
    m.sessions.mockResolvedValue([
      session([
        participant({
          opcoSubmissions: [
            {
              stage: 'PRISE_EN_CHARGE',
              status: 'SENT',
              deliveryState: 'READY',
              sentAt: null,
              recipientEmail: 'pa@example.fr',
            },
          ],
        }),
      ]),
    ]);
    await checkFormationDocuments(now);
    expect(m.queue.mock.calls[0]![0].subject).toContain('complet non déposé');
    expect(m.queue.mock.calls[0]![0].lines.join(' ')).toContain('envoi AGEFICE initial confirmé');
  });

  it('does not alert a complete AGEFICE dossier after an actual successful send', async () => {
    m.sessions.mockResolvedValue([
      session([
        participant({
          opcoSubmissions: [
            {
              stage: 'PRISE_EN_CHARGE',
              status: 'SENT',
              deliveryState: 'READY',
              sentAt: new Date('2026-09-15'),
              recipientEmail: 'pa@example.fr',
            },
          ],
        }),
      ]),
    ]);
    await checkFormationDocuments(now);
    expect(m.queue).not.toHaveBeenCalled();
  });

  it('groups employees by employer and only requests company pieces', async () => {
    const employee = (id: string, deposited: Date | null) =>
      participant({
        id,
        sponsorOrgId: 'employer',
        participantType: 'Salarié',
        opcoDepositedAt: deposited,
        person: {
          firstName: id,
          lastName: 'Salarié',
          ribKey: null,
          sensitiveData: null,
          legalLinks: [
            {
              organizationId: 'employer',
              role: 'EMPLOYEE',
              startDate: null,
              endDate: null,
              organization: { id: 'employer', ageficeProfile: null },
            },
          ],
        },
        sponsorOrg: { legalName: 'ACME', opcoCode: 'OPCO_EP', ageficeProfile: null },
      });
    m.sessions.mockResolvedValue([
      { ...session([employee('p1', new Date()), employee('p2', null)]), regime: 'ENTREPRISE' },
    ]);
    m.documents.mockResolvedValue([
      {
        id: 'group-convention',
        participantId: null,
        entityType: 'organization',
        entityId: 'employer',
        signedPdfUrl: 'signed-group.pdf',
      },
    ]);
    await checkFormationDocuments(now);
    expect(m.queue).toHaveBeenCalledTimes(1);
    const alert = m.queue.mock.calls[0]![0];
    expect(alert.subject).toContain('ACME');
    expect(alert.lines.join(' ')).toContain('déclaration de dépôt par un déposant');
    expect(alert.lines.join(' ')).not.toMatch(/CNI|RIB|CFP|AGEFICE signé/);
  });

  it('checks every employee instead of letting the first individual convention cover the employer', async () => {
    const employee = (id: string, firstName: string) =>
      participant({
        id,
        sponsorOrgId: 'employer',
        participantType: 'Salarié',
        person: {
          firstName,
          lastName: 'Salarié',
          ribKey: null,
          sensitiveData: null,
          legalLinks: [
            {
              organizationId: 'employer',
              role: 'EMPLOYEE',
              startDate: null,
              endDate: null,
              organization: { id: 'employer', ageficeProfile: null },
            },
          ],
        },
        sponsorOrg: { legalName: 'ACME', opcoCode: 'OPCO_EP', ageficeProfile: null },
      });
    m.sessions.mockResolvedValue([
      { ...session([employee('p1', 'Alice'), employee('p2', 'Bob')]), regime: 'ENTREPRISE' },
    ]);
    m.documents.mockResolvedValue([
      {
        id: 'individual-p1',
        participantId: 'p1',
        entityType: 'participant',
        entityId: 'p1',
        signedPdfUrl: 'signed-p1.pdf',
      },
    ]);

    await checkFormationDocuments(now);

    expect(m.queue).toHaveBeenCalledTimes(1);
    const text = m.queue.mock.calls[0]![0].lines.join(' ');
    expect(text).toContain('Bob Salarié : convention signée');
    expect(text).not.toContain('Alice Salarié : convention signée');
    expect(m.programme).toHaveBeenCalledTimes(2);
  });

  it('ignores an independent whose active sponsor funding is not AGEFICE', async () => {
    const other = participant({
      sponsorOrgId: 'other-org',
      sponsorOrg: { legalName: 'Autre', opcoCode: 'FIFPL', ageficeProfile: null },
      person: {
        firstName: 'Jean',
        lastName: 'Martin',
        ribKey: null,
        sensitiveData: null,
        legalLinks: [
          {
            organizationId: 'other-org',
            role: 'EI_SELF',
            startDate: null,
            endDate: null,
            organization: { id: 'other-org', ageficeProfile: null },
          },
        ],
      },
    });
    m.sessions.mockResolvedValue([session([other])]);
    await checkFormationDocuments(now);
    expect(m.queue).not.toHaveBeenCalled();
  });
});

describe('J+1 reimbursement reminders', () => {
  it('uses the most recent confirmed initial recipient', async () => {
    const p = participant({
      opcoSubmissions: [
        {
          id: 'new',
          stage: 'PRISE_EN_CHARGE',
          status: 'SENT',
          deliveryState: 'READY',
          sentAt: new Date('2026-09-10'),
          recipientEmail: 'nouveau@example.fr',
        },
        {
          id: 'old',
          stage: 'PRISE_EN_CHARGE',
          status: 'SENT',
          deliveryState: 'READY',
          sentAt: new Date('2026-09-01'),
          recipientEmail: 'ancien@example.fr',
        },
      ],
    });
    m.sessions.mockResolvedValue([
      {
        ...session([p]),
        startDate: new Date('2026-09-15T08:00:00+02:00'),
        endDate: new Date('2026-09-17T17:00:00+02:00'),
      },
    ]);
    await checkReimbursementReminders(now);
    const text = m.queue.mock.calls[0]![0].lines.join(' ');
    expect(text).toContain('nouveau@example.fr');
    expect(text).not.toContain('ancien@example.fr');
  });

  it('targets the actual initial recipient and lists current missing pieces', async () => {
    const p = participant({
      person: { ...participant().person, ribKey: null },
      opcoSubmissions: [
        {
          stage: 'PRISE_EN_CHARGE',
          status: 'SENT',
          deliveryState: 'READY',
          sentAt: new Date('2026-09-10'),
          recipientEmail: 'point-accueil@example.fr',
        },
      ],
    });
    m.sessions.mockResolvedValue([
      {
        ...session([p]),
        startDate: new Date('2026-09-15T08:00:00+02:00'),
        endDate: new Date('2026-09-17T17:00:00+02:00'),
      },
    ]);
    m.documents.mockResolvedValue([]);
    m.invoices.mockResolvedValue([]);
    await checkReimbursementReminders(now);
    const alert = m.queue.mock.calls[0]![0];
    expect(alert.lines.join(' ')).toContain('point-accueil@example.fr');
    expect(alert.lines.join(' ')).toContain(
      'RIB, émargement signé, assiduité signée, facture payée permettant l’édition acquittée',
    );
    expect(m.invoices.mock.calls[0]![0].where.tenantId).toBe('tenant-1');
  });

  it('does not remind once a final submission was actually sent', async () => {
    const p = participant({
      opcoSubmissions: [
        {
          stage: 'PRISE_EN_CHARGE',
          status: 'SENT',
          deliveryState: 'READY',
          sentAt: new Date('2026-09-10'),
          recipientEmail: 'point-accueil@example.fr',
        },
        {
          stage: 'FIN_FORMATION',
          status: 'SENT',
          deliveryState: 'READY',
          sentAt: new Date('2026-09-18'),
          recipientEmail: 'point-accueil@example.fr',
        },
      ],
    });
    m.sessions.mockResolvedValue([
      {
        ...session([p]),
        startDate: new Date('2026-09-15T08:00:00+02:00'),
        endDate: new Date('2026-09-17T17:00:00+02:00'),
      },
    ]);
    await checkReimbursementReminders(now);
    expect(m.queue).not.toHaveBeenCalled();
  });
});

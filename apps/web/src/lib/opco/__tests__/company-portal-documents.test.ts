import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), build: vi.fn() }));
vi.mock('@qualiof/db', () => ({ prisma: { sessionParticipant: { findMany: mocks.findMany } } }));
vi.mock('../build-submission', () => ({ buildOpcoSubmission: mocks.build }));

import { loadCompanyPortalGroups, resolveCompanyPortalPiece } from '../company-portal-documents';

const user = { id: 'user', tenantId: 'tenant' } as never;
const participant = (id: string, firstName: string) => ({
  id,
  sponsorOrgId: 'org',
  participantType: 'salarie',
  financingMode: 'OPCO',
  person: { firstName, lastName: 'DUPONT', legalLinks: [] },
  sponsorOrg: { opcoCode: 'OPCO_EP' },
  session: { startDate: new Date(), endDate: new Date(), regime: 'ENTREPRISE' },
});
const built = (id: string, conventionKey = 'common-convention') => ({
  ok: true,
  company: true,
  participant: { id, sessionId: 'session', sponsorOrgId: 'org', enrollmentStatus: 'CONFIRMED' },
  attachments: [
    {
      kind: 'CONVENTION',
      key: conventionKey,
      filename: 'Convention.pdf',
      included: true,
      signe: true,
    },
    { kind: 'PROGRAMME', key: 'common-programme', filename: 'Programme.pdf', included: true },
  ],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([participant('p1', 'Anne'), participant('p2', 'Benoît')]);
  mocks.build.mockImplementation((id: string) => Promise.resolve(built(id)));
});

describe('pièces portail OPCO entreprise', () => {
  it('déduplique la convention groupe et le programme partagé', async () => {
    const group = (await loadCompanyPortalGroups('session', user)).get('org')!;
    expect(group.pieces).toHaveLength(2);
    expect(group.pieces.map((piece) => piece.kind)).toEqual(['CONVENTION', 'PROGRAMME']);
    expect(group.pieces[0]!.label).toContain('groupe de 2 salariés');
    expect(group.missingLearners).toEqual([]);
  });

  it('propose chaque convention individuelle et n’efface pas un salarié incomplet', async () => {
    mocks.build.mockResolvedValueOnce(built('p1', 'convention-p1')).mockResolvedValueOnce({
      ...built('p2', 'convention-p2'),
      attachments: [
        { kind: 'PROGRAMME', key: 'common-programme', filename: 'Programme.pdf', included: true },
      ],
    });
    const group = (await loadCompanyPortalGroups('session', user)).get('org')!;
    expect(group.pieces.filter((piece) => piece.kind === 'CONVENTION')).toHaveLength(1);
    expect(group.missingLearners).toEqual(['Benoît DUPONT']);
    expect(group.pieces.filter((piece) => piece.kind === 'PROGRAMME')).toHaveLength(1);
  });

  it('ne sert que la pièce exacte d’un membre du bon groupe et exige une convention signée', async () => {
    await expect(
      resolveCompanyPortalPiece({
        sessionId: 'session',
        sponsorOrgId: 'org',
        participantId: 'p1',
        kind: 'CONVENTION',
        user,
      }),
    ).resolves.toEqual({ key: 'common-convention', filename: 'Convention.pdf' });
    mocks.build.mockResolvedValueOnce({
      ...built('p1'),
      participant: { ...built('p1').participant, sponsorOrgId: 'other' },
    });
    await expect(
      resolveCompanyPortalPiece({
        sessionId: 'session',
        sponsorOrgId: 'org',
        participantId: 'p1',
        kind: 'CONVENTION',
        user,
      }),
    ).resolves.toBeNull();
    mocks.build.mockResolvedValueOnce({
      ...built('p1'),
      attachments: [
        {
          kind: 'CONVENTION',
          key: 'unsigned',
          filename: 'Convention.pdf',
          included: true,
          signe: false,
        },
      ],
    });
    await expect(
      resolveCompanyPortalPiece({
        sessionId: 'session',
        sponsorOrgId: 'org',
        participantId: 'p1',
        kind: 'CONVENTION',
        user,
      }),
    ).resolves.toBeNull();
    await expect(
      resolveCompanyPortalPiece({
        sessionId: 'session',
        sponsorOrgId: 'org',
        participantId: 'p1',
        kind: 'RIB',
        user,
      }),
    ).resolves.toBeNull();
  });
});

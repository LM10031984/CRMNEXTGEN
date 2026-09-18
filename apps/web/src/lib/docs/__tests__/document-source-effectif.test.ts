import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: vi.fn(), tenant: vi.fn() }));
vi.mock('@qualiof/db', () => ({ prisma: {
  trainingSession: { findFirst: m.session }, tenant: { findUnique: m.tenant },
} }));

import { loadDocumentSourceContext, computeDocumentFingerprint } from '../document-source';
import { buildDocumentSource } from '../source-fingerprint';

function participant(id: string, enrollmentStatus: string, sponsorOrgId = 'org') {
  return {
    id, enrollmentStatus, sponsorOrgId, priceHT: 100,
    financingMode: null, financingRequestDate: null,
    sponsorOrg: { id: sponsorOrgId, legalName: 'Entreprise test', address: null },
    person: { firstName: `Prénom ${id}`, lastName: `NOM ${id}`, email: `${id}@example.test` },
  };
}

const anchor = { tenantId: 'tenant', docType: 'CONVENTION', sessionId: 'ses', participantId: 'moi' };

beforeEach(() => {
  vi.clearAllMocks();
  m.tenant.mockResolvedValue(null);
});

describe('chargement de l’effectif sans exposer les autres inscrits', () => {
  it('compte tous les commanditaires, exclut les annulés et garde le seul nom du dossier', async () => {
    m.session.mockResolvedValue({
      id: 'ses', trainers: [], slots: [], product: null,
      participants: [participant('moi', 'CONFIRMED'), participant('autre', 'PRE_ENROLLED', 'autre-org'), participant('annulé', 'CANCELLED')],
    });
    const ctx = await loadDocumentSourceContext(anchor);
    expect(ctx!.session!.participantCount).toBe(2);
    const source = buildDocumentSource('CONVENTION', ctx!)!;
    expect(source.effectifSession).toBe(2);
    expect(source.stagiaire).toEqual(participant('moi', 'CONFIRMED').person);
    expect(source.groupStagiaires).toBeNull();
    expect(JSON.stringify(source)).not.toContain('autre@example.test');
    expect(JSON.stringify(source)).not.toContain('annulé@example.test');
    expect(m.session.mock.calls[0]![0].where).toEqual({ id: 'ses', tenantId: 'tenant' });
  });

  it('un nouvel inscrit rend la convention à actualiser, le nom d’un autre inscrit ne le fait pas', async () => {
    const session = { id: 'ses', trainers: [], slots: [], product: null, participants: [participant('moi', 'CONFIRMED')] };
    m.session.mockResolvedValue(session);
    const one = await computeDocumentFingerprint(anchor);
    session.participants.push(participant('autre', 'PRE_ENROLLED', 'autre-org'));
    const two = await computeDocumentFingerprint(anchor);
    expect(one).not.toBeNull();
    expect(two).not.toBe(one);
    session.participants[1]!.person.lastName = 'Nouveau nom';
    expect(await computeDocumentFingerprint(anchor)).toBe(two);
  });
});

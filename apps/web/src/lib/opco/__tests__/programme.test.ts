import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ documents: vi.fn() }));
vi.mock('@qualiof/db', () => ({ prisma: { document: { findMany: db.documents } } }));
import { resolveProgrammeDocument } from '../programme';
const input = {
  tenantId: 'tenant',
  sessionId: 'session',
  participantId: 'learner',
  productId: 'product',
  sponsorOrgId: 'company',
};
const catalogue = {
  id: 'catalogue',
  type: 'PROGRAMME',
  entityType: 'product',
  entityId: 'product',
  participantId: null,
  sessionId: null,
  pdfUrl: 'catalogue.pdf',
  signedPdfUrl: null,
};
beforeEach(() => vi.resetAllMocks());
describe('programme intégré à la session', () => {
  it('récupère le programme catalogue comme la fiche session (régression Chantal Agier)', async () => {
    db.documents.mockResolvedValue([catalogue]);
    expect((await resolveProgrammeDocument(input))?.id).toBe('catalogue');
    expect(db.documents.mock.calls[0]![0].where).toMatchObject({
      tenantId: 'tenant',
      type: 'PROGRAMME',
    });
  });
  it('préfère le programme spécifique même si le catalogue est plus récent', async () => {
    db.documents.mockResolvedValue([
      catalogue,
      {
        ...catalogue,
        id: 'specific',
        sessionId: 'session',
        participantId: 'learner',
        entityType: 'participant',
        entityId: 'learner',
      },
    ]);
    expect((await resolveProgrammeDocument(input))?.id).toBe('specific');
  });
  it('ne récupère pas un programme d’une autre entreprise, personne, session ou produit', async () => {
    db.documents.mockResolvedValue([
      { ...catalogue, entityId: 'other' },
      { ...catalogue, sessionId: 'other' },
      { ...catalogue, participantId: 'other' },
      { ...catalogue, sessionId: 'session', entityType: 'organization', entityId: 'other' },
    ]);
    expect(await resolveProgrammeDocument(input)).toBeNull();
  });
  it('ignore une ligne sans PDF utilisable', async () => {
    db.documents.mockResolvedValue([{ ...catalogue, pdfUrl: ' ' }]);
    expect(await resolveProgrammeDocument(input)).toBeNull();
  });
});

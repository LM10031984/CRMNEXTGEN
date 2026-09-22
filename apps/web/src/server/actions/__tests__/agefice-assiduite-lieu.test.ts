import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * « Fait à … » de l'ATTESTATION D'ASSIDUITÉ AGEFICE.
 *
 * LA RÈGLE : la mention porte la ville où la formation s'est RÉELLEMENT tenue.
 * Le siège de l'OF n'est qu'un REPLI, quand la session n'a pas de lieu.
 *
 * Constat de Laurent le 21/09/2026 : l'assiduité signait « Fait à
 * Cagnes-sur-Mer » — le siège — quelle que soit la ville de la formation. Sur
 * un dossier AGEFICE, cette mention est confrontée à la convention et à
 * l'émargement, qui portent, eux, le lieu réel : trois pièces du même dossier
 * ne pouvaient pas se contredire sans appeler la question.
 *
 * MÊME SOURCE QUE PARTOUT AILLEURS : `villeLieuFormation`, le module unique de
 * composition du lieu. Trois copies divergentes avaient valu un refus de prise
 * en charge le 28/08/2026 (« Feuille(s) d'émargement incomplet : raison
 * sociale du lieu de formation ») — d'où l'interdiction d'une composition
 * maison ici.
 *
 * Test de puissance (joué le 21/09/2026) : remettre `lieuDelivrance:
 * of.addressVille || ''` dans le générateur fait virer au ROUGE les deux
 * premiers tests. Les deux derniers restent verts, et c'est voulu : ils
 * décrivent le REPLI, qui ne change pas d'une version à l'autre.
 */

const findFirstParticipant = vi.fn();

vi.mock('@qualiof/db', () => ({
  prisma: {
    document: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    sessionParticipant: { findFirst: (...a: unknown[]) => findFirstParticipant(...a) },
  },
}));

vi.mock('@/lib/auth', () => ({
  validateRequest: vi.fn().mockResolvedValue({ user: { tenantId: 'tnt-1', id: 'u-1' } }),
}));

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    rnq: '93 06 10481 06',
    addressVille: 'Cagnes-sur-Mer',
    resp: { prenom: 'Laurent', nom: 'MARX', titre: 'PDG' },
  }),
}));

const renderAgeficeAttendanceHtml = vi.fn().mockReturnValue('<html></html>');
vi.mock('@/lib/closure/agefice-attendance-template', () => ({
  renderAgeficeAttendanceHtml: (d: unknown) => renderAgeficeAttendanceHtml(d),
}));

vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));

vi.mock('@/lib/docs/document-source', () => ({
  computeDocumentFingerprint: vi.fn().mockResolvedValue(null),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { generateAgeficeAttendanceForParticipant } from '../agefice-attendance-generator';

/** Inscription minimale — seul le lieu de la session varie d'un cas à l'autre. */
function participant(location: unknown) {
  return {
    id: 'part-1',
    priceHT: 3024,
    sponsorOrg: {
      id: 'org-ei',
      legalName: 'KING Kristin EI',
      legalForm: 'EI',
      opcoCode: 'AGEFICE',
    },
    person: {
      id: 'p-1',
      firstName: 'Kristin',
      lastName: 'KING',
      civility: 'Mme',
      legalLinks: [],
    },
    session: {
      id: 'ses-1',
      code: 'SES-0042',
      name: 'IA immobilier (72h)',
      modality: 'PRESENTIEL',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-06-11T00:00:00.000Z'),
      product: { title: 'IA immobilier', durationHours: 72, priceHT: 3024 },
      location,
      trainers: [],
      _count: { participants: 1 },
    },
  };
}

/** La ville réellement imprimée sous « Fait à : … ». */
function villeSignee(): string | undefined {
  const data = renderAgeficeAttendanceHtml.mock.calls.at(-1)?.[0] as
    | { lieuDelivrance?: string }
    | undefined;
  return data?.lieuDelivrance;
}

beforeEach(() => {
  renderAgeficeAttendanceHtml.mockClear();
  findFirstParticipant.mockReset();
});

describe("attestation d'assiduité — « Fait à »", () => {
  it('porte la ville du lieu de la session, pas le siège de l’OF', async () => {
    findFirstParticipant.mockResolvedValue(
      participant({
        legalName: 'AKORIMMO SARL',
        name: 'Agence Nice Centre',
        address: { street: '12 rue Masséna', postalCode: '06000', city: 'Nice' },
      }),
    );

    await generateAgeficeAttendanceForParticipant('part-1');

    expect(villeSignee()).toBe('Nice');
    // Le siège ne doit PAS s'imprimer quand la session a un lieu.
    expect(villeSignee()).not.toBe('Cagnes-sur-Mer');
  });

  it('accepte une adresse saisie en texte libre et en extrait la ville', async () => {
    // Beaucoup de lieux historiques portent l'adresse dans une seule chaîne.
    findFirstParticipant.mockResolvedValue(
      participant({
        legalName: 'GÎTE DE COURCY',
        name: 'Gîte',
        address: '880 route de Courcy, 45170 Chilleurs-aux-Bois',
      }),
    );

    await generateAgeficeAttendanceForParticipant('part-1');

    expect(villeSignee()).toBe('Chilleurs-aux-Bois');
  });

  it('se replie sur le siège de l’OF quand la session n’a pas de lieu', async () => {
    findFirstParticipant.mockResolvedValue(participant(null));

    await generateAgeficeAttendanceForParticipant('part-1');

    expect(villeSignee()).toBe('Cagnes-sur-Mer');
  });

  it('se replie aussi quand le lieu existe mais n’a pas d’adresse exploitable', async () => {
    // Un lieu à moitié saisi ne doit pas produire un « Fait à : » vide : la
    // mention est obligatoire sur une pièce signée.
    findFirstParticipant.mockResolvedValue(
      participant({ legalName: 'SALLE À PRÉCISER', name: null, address: null }),
    );

    await generateAgeficeAttendanceForParticipant('part-1');

    expect(villeSignee()).toBe('Cagnes-sur-Mer');
  });
});

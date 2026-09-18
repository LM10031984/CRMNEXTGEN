import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lieu de formation sur la DEMANDE DE PRISE EN CHARGE AGEFICE.
 *
 * Deux exigences, toutes deux formulées par l'AGEFICE elle-même :
 *
 *  1. **La raison sociale du lieu doit figurer** — motif exact du refus du
 *     28/08/2026 (« Le document est incomplet : raison sociale du lieu de
 *     formation »). Quand la session n'a AUCUN lieu rattaché (coaching
 *     individuel, cas SES-0099), le repli sur le siège sortait l'adresse NUE —
 *     « 12 avenue des Camélias, 06800 Cagnes-sur-Mer » — sans « Start
 *     Academy ». Constaté par Laurent le 11/09/2026 sur des dossiers déjà
 *     signés, avant envoi.
 *
 *  2. **Aucun segment répété.** Le nom d'usage d'un lieu contient souvent déjà
 *     la rue ou la ville ; elles s'imprimaient alors deux fois.
 *
 * Ces deux règles sont DÉJÀ tenues par `lib/locations/format-lieu.ts`, la
 * source unique (émargement, convention, pack de clôture). Ce générateur en
 * était resté à une copie inline — la 4ᵉ divergence, sur le document qui part
 * justement à l'AGEFICE. Ces tests verrouillent le raccordement.
 *
 * Test de puissance : rebrancher `lieuAdresseComplete` sur `of.addressFull`
 * fait virer le test 1 ROUGE (« Start Academy » absent).
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
    ageficePointAccueil: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
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
    addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
    addressStreet: '12 avenue des Camélias',
    addressCp: '06800',
    addressVille: 'Cagnes-sur-Mer',
  }),
}));

const fillAgeficePdf = vi.fn().mockResolvedValue(Buffer.from('pdf'));
vi.mock('@/lib/agefice-form-fill', () => ({ fillAgeficePdf: (d: unknown) => fillAgeficePdf(d) }));

vi.mock('@/lib/agefice-options', () => ({ isCanonicalExperience: () => true }));
vi.mock('@/lib/pedagogy-templates', () => ({ buildDeroulementPedagogique: () => '' }));
vi.mock('@/lib/agefice/select-point-accueil', () => ({
  departmentOfPostalCode: () => '06',
  pickPointAccueil: () => null,
}));
vi.mock('@/lib/docs/document-source', () => ({
  computeDocumentFingerprint: vi.fn().mockResolvedValue(null),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { generateAgeficeForParticipant } from '../agefice-generator';

/** Inscription minimale mais complète : une EI AGEFICE, un prix, un produit. */
function participantAvecLieu(location: unknown) {
  return {
    id: 'part-1',
    priceHT: 3024,
    sponsorOrg: {
      id: 'org-ei',
      legalName: 'Nicolas JILBERT',
      legalForm: 'EI',
      opcoCode: 'AGEFICE',
      siret: '87838743000019',
      naf: '6831Z',
      address: null,
      ageficeProfile: null,
    },
    person: {
      id: 'p-1',
      firstName: 'Nicolas',
      lastName: 'JILBERT',
      civility: 'M',
      birthName: null,
      birthDate: null,
      phone: null,
      email: null,
      diplomas: null,
      educationLevel: null,
      professionalExperience: null,
      personalAddress: { street: '28 route de la badine', postalCode: '06600', city: 'Antibes' },
      sensitiveData: null,
      legalLinks: [],
    },
    session: {
      id: 'ses-1',
      code: 'SES-0099',
      modality: 'PRESENTIEL',
      startDate: new Date('2026-09-28'),
      endDate: new Date('2026-10-30'),
      location,
      product: { title: 'IA immobilier', theme: 'immobilier', durationHours: 72, priceHT: 3024 },
      trainers: [],
    },
  };
}

/** Le libellé de lieu réellement écrit dans le Cerfa. */
function lieuEcrit(): string | null {
  const payload = fillAgeficePdf.mock.calls.at(-1)?.[0] as
    | { formation?: { lieuAdresseComplete?: string | null } }
    | undefined;
  return payload?.formation?.lieuAdresseComplete ?? null;
}

beforeEach(() => {
  fillAgeficePdf.mockClear();
  findFirstParticipant.mockReset();
});

describe('demande AGEFICE — lieu de formation', () => {
  it("sans lieu rattaché, le repli porte la raison sociale de l'OF", async () => {
    findFirstParticipant.mockResolvedValue(participantAvecLieu(null));

    await generateAgeficeForParticipant('part-1');

    // La mention que l'AGEFICE réclame — absente avant le 11/09/2026.
    expect(lieuEcrit()).toContain('Start Academy');
    expect(lieuEcrit()).toBe('Start Academy, 12 avenue des Camélias');
  });

  it("sans lieu rattaché, le repli est SIGNALÉ et non appliqué en silence", async () => {
    findFirstParticipant.mockResolvedValue(participantAvecLieu(null));

    const r = await generateAgeficeForParticipant('part-1');

    // La convocation de la même session affiche « à préciser » : sans cet
    // avertissement, les deux documents d'un même dossier se contredisent sans
    // que personne ne le voie.
    expect(r.warnings?.some((w) => /Aucun lieu/.test(w))).toBe(true);
    expect(r.warnings?.some((w) => w.includes('Start Academy'))).toBe(true);
  });

  it('sépare la raison sociale, le nom et la rue des cases code postal et ville', async () => {
    findFirstParticipant.mockResolvedValue(
      participantAvecLieu({
        legalName: "SARL L'Agence Signature",
        name: 'Agence Nice Centre',
        address: { street: '12 rue Masséna', postalCode: '06000', city: 'Nice' },
      }),
    );

    await generateAgeficeForParticipant('part-1');

    expect(lieuEcrit()).toBe("SARL L'Agence Signature — Agence Nice Centre, 12 rue Masséna");
    expect(fillAgeficePdf.mock.calls.at(-1)?.[0].formation).toMatchObject({lieuPostalCode: '06000', lieuVille: 'Nice'});
  });

  it("ne répète pas la rue déjà contenue dans le nom d'usage du lieu", async () => {
    findFirstParticipant.mockResolvedValue(
      participantAvecLieu({
        legalName: 'AKORIMMO',
        name: '63 bd de Cessole',
        address: { street: '63 Bd de Cessole', postalCode: '06100', city: 'Nice' },
      }),
    );

    await generateAgeficeForParticipant('part-1');

    expect(lieuEcrit()).toBe('AKORIMMO — 63 bd de Cessole');
  });

  it("n'avertit pas quand la session a bien un lieu", async () => {
    findFirstParticipant.mockResolvedValue(
      participantAvecLieu({
        legalName: 'AKORIMMO',
        name: 'Agence Nice Nord',
        address: { street: '63 bd de Cessole', postalCode: '06100', city: 'Nice' },
      }),
    );

    const r = await generateAgeficeForParticipant('part-1');

    expect(r.warnings?.some((w) => /Aucun lieu/.test(w))).toBe(false);
  });
});


describe('demande AGEFICE — adresse entreprise et lieu réel', () => {
  it.each([true, false])('adresse de rue sans raison sociale (adresse entreprise disponible : %s)', async (withOrgAddress) => {
    const participant = participantAvecLieu(null);
    if (withOrgAddress) participant.sponsorOrg.address = { street: '16 rue de la Démonstration', postalCode: '06200', city: 'Nice' } as any;
    findFirstParticipant.mockResolvedValue(participant);
    expect((await generateAgeficeForParticipant('part-1')).ok).toBe(true);
    expect(fillAgeficePdf.mock.calls.at(-1)?.[0].entreprise).toMatchObject({
      raisonSociale: 'Nicolas JILBERT',
      address: withOrgAddress ? '16 rue de la Démonstration' : '28 route de la badine',
      postalCode: withOrgAddress ? '06200' : '06600',
      city: withOrgAddress ? 'Nice' : 'Antibes',
    });
  });

  it.each(['PRESENTIEL', 'MIXTE'])('coche entreprise pour un lieu client (%s), même si le produit dit non', async (modality) => {
    const participant = participantAvecLieu({legalName: 'SAS', name: 'Agence de démonstration', address: {street: '3 avenue des Fleurs', postalCode: '06000', city: 'Nice'}});
    participant.session.modality = modality;
    Object.assign(participant.session.product, {ageficeEnEntreprise: false});
    findFirstParticipant.mockResolvedValue(participant);
    await generateAgeficeForParticipant('part-1');
    expect(fillAgeficePdf.mock.calls.at(-1)?.[0].formation.enEntreprise).toBe(true);
  });

  it.each([
    {legalName: 'SAS START ACADEMY', name: 'Salle 1', address: {street: '12 avenue des Camélias', postalCode: '06800', city: 'Cagnes-sur-Mer'}},
    {legalName: null, name: 'Salle principale', address: {street: '12 avenue des Camélias', postalCode: '06800', city: 'Cagnes-sur-Mer'}},
  ])('ne coche pas entreprise pour les locaux de l’OF (%j)', async (location) => {
    const participant = participantAvecLieu(location);
    Object.assign(participant.session.product, {ageficeEnEntreprise: true});
    findFirstParticipant.mockResolvedValue(participant);
    await generateAgeficeForParticipant('part-1');
    expect(fillAgeficePdf.mock.calls.at(-1)?.[0].formation.enEntreprise).toBe(false);
  });

  it('ne coche pas entreprise en distanciel malgré un lieu conservé sur la session', async () => {
    const participant = participantAvecLieu({legalName: 'Agence cliente', name: 'Salle de réunion', address: {street: '3 avenue des Fleurs', postalCode: '06000', city: 'Nice'}});
    participant.session.modality = 'DISTANCIEL';
    Object.assign(participant.session.product, {ageficeEnEntreprise: true});
    findFirstParticipant.mockResolvedValue(participant);
    await generateAgeficeForParticipant('part-1');
    expect(fillAgeficePdf.mock.calls.at(-1)?.[0].formation.enEntreprise).toBe(false);
  });
});

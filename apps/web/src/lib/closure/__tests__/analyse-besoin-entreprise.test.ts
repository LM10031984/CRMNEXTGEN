import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Analyse des besoins ENTREPRISE (28/08) — règle payeur du 12/08 appliquée au
 * document de l'indicateur 4.
 *
 * Constat Laurent : « pour l'analyse du besoin il doit y en avoir une pour
 * l'entreprise, pas une par salarié ». La quick 260821-md8 avait fait la
 * moitié qui protège (arrêter d'en produire une par stagiaire) ; aucun
 * générateur applicatif ne produisait la variante entreprise — elle n'existait
 * que par script hors app (`_gen-assalit-experta-analyses.ts`, SES-0107/0108).
 *
 * Harnais hermétique repris de `convention-entreprise.test.ts` : Prisma,
 * storage, rendu PDF et génération IA mockés.
 *
 * Test de puissance : supprimer le `deleteMany` des analyses par stagiaire
 * fait virer ROUGE « retire les analyses nominatives des salariés couverts ».
 */

const { orgFindFirstMock, participantsFindManyMock, assetDeleteManyMock, assetCreateMock, txMock, iaMock, uploadMock } =
  vi.hoisted(() => ({
    orgFindFirstMock: vi.fn(),
    participantsFindManyMock: vi.fn(),
    assetDeleteManyMock: vi.fn().mockResolvedValue({ count: 0 }),
    assetCreateMock: vi.fn().mockResolvedValue({ id: 'asset-1' }),
    txMock: vi.fn(),
    iaMock: vi.fn(),
    uploadMock: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@qualiof/db', () => ({
  prisma: {
    organization: { findFirst: orgFindFirstMock },
    sessionParticipant: { findMany: participantsFindManyMock },
    pedagogicalAsset: { deleteMany: assetDeleteManyMock, create: assetCreateMock },
    $transaction: txMock,
  },
}));

vi.mock('@/lib/storage', () => ({ DOCS_BUCKET: 'qualiof-docs', uploadFile: uploadMock }));
vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdfWeasy: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));
vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
    handicapReferent: 'Jean-Guy Ourmières',
    resp: { nom: 'Ourmières', prenom: 'Jean-Guy', email: 'jean-guy@start-academy.fr', phone: '06 10 23 00 60', titre: 'Responsable pédagogique', civilite: 'MR' },
    contact: { nom: 'MARX', prenom: 'Laurent', email: 'laurent@start-academy.fr', phone: '06 00 00 00 00', titre: 'Dirigeant', civilite: 'MR' },
  }),
}));
vi.mock('../ollama-generators', () => ({
  generateAnalyseBesoinEntrepriseContent: iaMock,
}));
// Les loaders d'assets lisent le disque : on neutralise, le reste du gabarit
// partagé (escapeHtml, wrapHtml, couleurs) reste RÉEL.
vi.mock('../shared-template', async () => {
  const actual = await vi.importActual<typeof import('../shared-template')>('../shared-template');
  return {
    ...actual,
    renderBrandHeader: () => '<header></header>',
    // `wrapHtml` lit la config OF en synchrone (getOfConfig) : hors runtime
    // applicatif elle n'existe pas. Le corps du document, lui, reste réel —
    // c'est ce que les tests inspectent.
    wrapHtml: ({ bodyHtml }: { bodyHtml: string }) => bodyHtml,
    loadSignatureDataUrl: () => '',
    loadStampDataUrl: () => '',
  };
});

const SESSION = {
  id: 'ses-1',
  code: 'SES-0107',
  startDate: new Date('2026-10-07T08:00:00Z'),
  endDate: new Date('2026-10-21T17:00:00Z'),
  modality: 'PRESENTIEL',
  location: { name: 'ASSALIT SYNDIC', legalName: 'ASSALIT SYNDIC', address: { street: '15 rue Masséna', postalCode: '06000', city: 'Nice' } },
  product: { title: "Intégrer l'IA dans son entreprise", durationHours: 88, programMd: '# Programme' },
};

function salarie(id: string, firstName: string, lastName: string, fonction: string | null = 'Gestionnaire') {
  return {
    id,
    person: { id: `per-${id}`, firstName, lastName, legalLinks: fonction ? [{ organizationId: 'org-assalit', function: fonction }] : [] },
    session: SESSION,
  };
}

const ORG = {
  id: 'org-assalit',
  legalName: 'ASSALIT SYNDIC',
  legalForm: 'SARL',
  siret: '12345678900011',
  naf: '68.32A',
  address: { street: '15 rue Masséna', postalCode: '06000', city: 'Nice' },
  representative: 'Gilles Blanchon',
  activityDescription: null,
  contacts: [],
};

const IA_OK = {
  activite: "société d'administration de biens",
  contexte: 'x'.repeat(120),
  besoins_exprimes: ['Réduire le temps des écrits normés', 'Accélérer la lecture des documents longs', 'Harmoniser la communication'],
  objectifs_attendus: ['Outiller les écrits récurrents', 'Fiabiliser la synthèse'],
  public_prerequis: 'Huit salariés, toutes fonctions confondues. Aucun prérequis technique.',
  modalites: "Formation intra-entreprise en présentiel dans les locaux de l'entreprise, 88 heures.",
  adaptation_proposee: 'y'.repeat(120),
};

async function importCore() {
  return await import('../analyse-besoin-entreprise-core');
}

beforeEach(() => {
  vi.clearAllMocks();
  assetDeleteManyMock.mockResolvedValue({ count: 0 });
  assetCreateMock.mockResolvedValue({ id: 'asset-1' });
  txMock.mockImplementation(async () => [{ count: 0 }, { count: 0 }, { id: 'asset-1' }]);
  iaMock.mockResolvedValue(IA_OK);
  orgFindFirstMock.mockResolvedValue(ORG);
  participantsFindManyMock.mockResolvedValue([
    salarie('sp-1', 'Alice', 'Martin'),
    salarie('sp-2', 'Bruno', 'Durand', 'Comptable'),
  ]);
});

describe('generateAnalyseBesoinEntrepriseCore', () => {
  it('produit UN seul asset de niveau session pour N salariés', async () => {
    const { generateAnalyseBesoinEntrepriseCore } = await importCore();
    const res = await generateAnalyseBesoinEntrepriseCore('tnt-1', 'ses-1', 'org-assalit');

    expect(res.ok).toBe(true);
    expect(res.count).toBe(2);
    expect(iaMock).toHaveBeenCalledTimes(1); // UNE génération, pas une par salarié
    const data = txMock.mock.calls.length > 0 ? assetCreateMock.mock.calls[0]![0].data : assetCreateMock.mock.calls[0]![0].data;
    expect(data.participantId).toBeNull();
    expect(data.sessionId).toBe('ses-1');
    expect(data.kind).toBe('ANALYSE_BESOIN');
    expect(data.rawJson.scope).toBe('entreprise');
    expect(data.rawJson.entreprise).toBe('ASSALIT SYNDIC');
  });

  it('ne nomme AUCUN salarié dans le document produit', async () => {
    const { renderHtmlToPdfWeasy } = await import('@/lib/pdf-render');
    const { generateAnalyseBesoinEntrepriseCore } = await importCore();
    await generateAnalyseBesoinEntrepriseCore('tnt-1', 'ses-1', 'org-assalit');

    const html = (renderHtmlToPdfWeasy as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0];
    expect(html).toContain('ASSALIT SYNDIC');
    expect(html).not.toContain('Alice');
    expect(html).not.toContain('Martin');
    expect(html).not.toContain('Bruno');
  });

  it('transmet à l’IA l’effectif et les fonctions, sans les noms', async () => {
    const { generateAnalyseBesoinEntrepriseCore } = await importCore();
    await generateAnalyseBesoinEntrepriseCore('tnt-1', 'ses-1', 'org-assalit');

    const entreprise = iaMock.mock.calls[0]![1];
    expect(entreprise.raisonSociale).toBe('ASSALIT SYNDIC');
    expect(entreprise.effectif).toBe(2);
    expect(entreprise.fonctions).toEqual(['Gestionnaire', 'Comptable']);
    expect(JSON.stringify(iaMock.mock.calls[0])).not.toContain('Alice');
  });

  it('retire les analyses nominatives des salariés couverts', async () => {
    const { generateAnalyseBesoinEntrepriseCore } = await importCore();
    await generateAnalyseBesoinEntrepriseCore('tnt-1', 'ses-1', 'org-assalit');

    const wheres = assetDeleteManyMock.mock.calls.map((c) => c[0].where);
    expect(
      wheres.some(
        (w) => w.kind === 'ANALYSE_BESOIN' && JSON.stringify(w.participantId) === JSON.stringify({ in: ['sp-1', 'sp-2'] }),
      ),
    ).toBe(true);
    // …et l'ancienne analyse d'entreprise (idempotence).
    expect(wheres.some((w) => w.participantId === null && w.sessionId === 'ses-1')).toBe(true);
  });

  it('refuse un commanditaire personne physique (auto-payeur)', async () => {
    orgFindFirstMock.mockResolvedValue({ ...ORG, legalForm: 'EI' });
    const { generateAnalyseBesoinEntrepriseCore } = await importCore();
    const res = await generateAnalyseBesoinEntrepriseCore('tnt-1', 'ses-1', 'org-assalit');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/individuel/i);
    expect(iaMock).not.toHaveBeenCalled();
  });

  it('refuse si aucun salarié n’est rattaché au commanditaire', async () => {
    participantsFindManyMock.mockResolvedValue([]);
    const { generateAnalyseBesoinEntrepriseCore } = await importCore();
    const res = await generateAnalyseBesoinEntrepriseCore('tnt-1', 'ses-1', 'org-assalit');

    expect(res.ok).toBe(false);
    expect(iaMock).not.toHaveBeenCalled();
  });

  /**
   * Pas de stub sur CE document : une analyse générique au nom d'une entreprise
   * est une non-conformité à l'indicateur 4, pire qu'un document absent. Le
   * cœur échoue en le disant, il ne fabrique rien.
   */
  it('échoue proprement quand l’IA ne rend rien — aucun asset, aucun stub', async () => {
    iaMock.mockResolvedValue(null);
    const { generateAnalyseBesoinEntrepriseCore } = await importCore();
    const res = await generateAnalyseBesoinEntrepriseCore('tnt-1', 'ses-1', 'org-assalit');

    expect(res.ok).toBe(false);
    expect(assetCreateMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

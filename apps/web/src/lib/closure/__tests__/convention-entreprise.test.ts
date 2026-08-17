import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Quick 260817-mm0 — convention ENTREPRISE (groupe par commanditaire).
 *
 * Règle métier figée par Laurent le 12/08 : payeur personne morale ⇒ UNE
 * convention unique signée par le chef d'entreprise pour tout le groupe,
 * JAMAIS une par stagiaire (une convention par salarié là où le besoin est
 * celui de l'entreprise est une non-conformité en audit).
 *
 * Cas de référence : session OPTIMMO, 11 salariées, dossier OPCO EP — la
 * convention devait être produite hors app par script.
 *
 * Harnais hermétique repris de `generators-idempotent.test.ts` : Prisma,
 * storage, rendu PDF et template mockés.
 *
 * Test de puissance (consigne Laurent) : supprimer le `deleteMany` ciblant
 * `participantId: { in: ... }` dans `generateConventionEntrepriseCore` fait
 * virer ROUGE « supprime les conventions individuelles du groupe ».
 */

const { deleteManyMock, createMock, findManyMock, orgFindFirstMock, txMock, renderMock } =
  vi.hoisted(() => ({
    deleteManyMock: vi.fn().mockResolvedValue({ count: 0 }),
    createMock: vi.fn().mockResolvedValue({ id: 'doc-groupe-1' }),
    findManyMock: vi.fn(),
    orgFindFirstMock: vi.fn(),
    txMock: vi.fn(),
    renderMock: vi.fn().mockReturnValue('<html></html>'),
  }));

vi.mock('@qualiof/db', () => ({
  prisma: {
    organization: { findFirst: orgFindFirstMock },
    sessionParticipant: { findMany: findManyMock },
    document: { deleteMany: deleteManyMock, create: createMock },
    // Le cœur passe un TABLEAU d'opérations : on renvoie les valeurs résolues
    // dans l'ordre, le 3ᵉ élément étant le Document créé.
    $transaction: txMock,
  },
}));

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/pdf-render', () => ({
  renderHtmlToPdfWeasy: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({ name: 'Start Academy', addressFull: 'Cagnes-sur-Mer' }),
}));

vi.mock('@/lib/convention-template', () => ({
  renderConventionHtml: renderMock,
}));

const SESSION = {
  id: 'ses-1',
  code: 'SES-0106',
  name: null,
  startDate: new Date('2026-09-14T08:30:00Z'),
  endDate: new Date('2026-09-18T17:30:00Z'),
  location: null,
  product: {
    title: 'IA pour conseillers immobiliers',
    durationHours: 21,
    priceHT: 700,
    objectives: ['Objectif A'],
    programMd: '# Programme',
    trainerProfile: null,
  },
};

function participant(id: string, firstName: string, lastName: string, priceHT = 700) {
  return {
    id,
    priceHT,
    person: { id: `p-${id}`, firstName, lastName, email: `${firstName}@ex.fr` },
    session: SESSION,
  };
}

async function importCore() {
  return await import('../convention-core');
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteManyMock.mockResolvedValue({ count: 0 });
  createMock.mockResolvedValue({ id: 'doc-groupe-1' });
  txMock.mockImplementation(async () => [{ count: 0 }, { count: 0 }, { id: 'doc-groupe-1' }]);
  renderMock.mockReturnValue('<html></html>');
});

describe('generateConventionEntrepriseCore — groupe par commanditaire', () => {
  it('produit UN seul document pour N salariés du même commanditaire', async () => {
    orgFindFirstMock.mockResolvedValue({
      id: 'org-1', legalName: 'OPTIMMO', siret: '123', legalForm: 'SAS',
      representative: 'Mme Dupont', address: { city: 'Nice' },
    });
    findManyMock.mockResolvedValue([
      participant('sp-1', 'Alice', 'Martin'),
      participant('sp-2', 'Bruno', 'Durand'),
      participant('sp-3', 'Chloé', 'Petit'),
    ]);

    const { generateConventionEntrepriseCore } = await importCore();
    const res = await generateConventionEntrepriseCore('tnt-1', 'ses-1', 'org-1');

    expect(res.ok).toBe(true);
    expect(res.count).toBe(3);
    // UNE seule création de Document, pas trois.
    expect(txMock).toHaveBeenCalledTimes(1);
  });

  it('liste les N stagiaires dans la convention, nom + prénom seulement', async () => {
    orgFindFirstMock.mockResolvedValue({
      id: 'org-1', legalName: 'OPTIMMO', siret: '123', legalForm: 'SAS',
      representative: 'Mme Dupont', address: { city: 'Nice' },
    });
    findManyMock.mockResolvedValue([
      participant('sp-1', 'Alice', 'Martin'),
      participant('sp-2', 'Bruno', 'Durand'),
    ]);

    const { generateConventionEntrepriseCore } = await importCore();
    await generateConventionEntrepriseCore('tnt-1', 'ses-1', 'org-1');

    const data = renderMock.mock.calls[0]![0] as { stagiaires: unknown[]; beneficiaireRaisonSociale: string };
    expect(data.stagiaires).toHaveLength(2);
    expect(data.beneficiaireRaisonSociale).toBe('OPTIMMO');
    // Consigne Laurent : aucune CSP / poste occupé sur les documents.
    for (const s of data.stagiaires as Record<string, unknown>[]) {
      expect(Object.keys(s).sort()).toEqual(['email', 'nom', 'prenom']);
    }
  });

  it('supprime les conventions individuelles des salariés du groupe', async () => {
    orgFindFirstMock.mockResolvedValue({
      id: 'org-1', legalName: 'OPTIMMO', siret: '123', legalForm: 'SARL',
      representative: 'M. Chef', address: { city: 'Nice' },
    });
    findManyMock.mockResolvedValue([participant('sp-1', 'Alice', 'Martin'), participant('sp-2', 'Bruno', 'Durand')]);

    const { generateConventionEntrepriseCore } = await importCore();
    await generateConventionEntrepriseCore('tnt-1', 'ses-1', 'org-1');

    const wheres = deleteManyMock.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);
    const individuelles = wheres.find((w) => 'participantId' in w);
    expect(individuelles).toBeDefined();
    expect(individuelles!.participantId).toEqual({ in: ['sp-1', 'sp-2'] });
    expect(individuelles!.type).toBe('CONVENTION');
  });

  it('date la convention à J-15 jours OUVRÉS avant le début (jamais aujourd’hui)', async () => {
    orgFindFirstMock.mockResolvedValue({
      id: 'org-1', legalName: 'OPTIMMO', siret: '123', legalForm: 'SAS',
      representative: 'M. Chef', address: null,
    });
    findManyMock.mockResolvedValue([participant('sp-1', 'Alice', 'Martin')]);

    const { generateConventionEntrepriseCore } = await importCore();
    await generateConventionEntrepriseCore('tnt-1', 'ses-1', 'org-1');

    const data = renderMock.mock.calls[0]![0] as { conventionDate: Date };
    // Session du 14/09/2026 (lundi) → 15 jours ouvrés avant = 24/08/2026.
    expect(data.conventionDate.toISOString().slice(0, 10)).toBe('2026-08-24');
  });
});

describe('generateConventionEntrepriseCore — gardes métier', () => {
  it.each(['EI', 'EIRL', 'AUTO_ENTREPRENEUR', 'PARTICULIER'])(
    'refuse un commanditaire personne physique (%s) et renvoie vers le contrat',
    async (legalForm) => {
      orgFindFirstMock.mockResolvedValue({
        id: 'org-ei', legalName: 'Alice Martin EI', siret: '999', legalForm,
        representative: null, address: null,
      });

      const { generateConventionEntrepriseCore } = await importCore();
      const res = await generateConventionEntrepriseCore('tnt-1', 'ses-1', 'org-ei');

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/contrat de formation professionnelle individuel/i);
      expect(txMock).not.toHaveBeenCalled();
    },
  );

  it('refuse si aucun participant n’est rattaché au commanditaire', async () => {
    orgFindFirstMock.mockResolvedValue({
      id: 'org-1', legalName: 'OPTIMMO', siret: '123', legalForm: 'SAS',
      representative: null, address: null,
    });
    findManyMock.mockResolvedValue([]);

    const { generateConventionEntrepriseCore } = await importCore();
    const res = await generateConventionEntrepriseCore('tnt-1', 'ses-1', 'org-1');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/aucun participant/i);
  });

  it('refuse des prix hétérogènes plutôt que d’imprimer un total faux', async () => {
    orgFindFirstMock.mockResolvedValue({
      id: 'org-1', legalName: 'OPTIMMO', siret: '123', legalForm: 'SAS',
      representative: null, address: null,
    });
    findManyMock.mockResolvedValue([
      participant('sp-1', 'Alice', 'Martin', 700),
      participant('sp-2', 'Bruno', 'Durand', 900),
    ]);

    const { generateConventionEntrepriseCore } = await importCore();
    const res = await generateConventionEntrepriseCore('tnt-1', 'ses-1', 'org-1');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/même prix HT/i);
    expect(txMock).not.toHaveBeenCalled();
  });

  it('refuse une organisation introuvable dans le tenant', async () => {
    orgFindFirstMock.mockResolvedValue(null);

    const { generateConventionEntrepriseCore } = await importCore();
    const res = await generateConventionEntrepriseCore('tnt-1', 'ses-1', 'org-absente');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/introuvable/i);
  });
});

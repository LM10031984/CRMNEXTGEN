import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Quick 260821-md8 — routage des conventions à la préparation d'une session.
 *
 * Règle métier figée par Laurent le 12/08 : payeur personne morale ⇒ UNE
 * convention de groupe signée par le chef d'entreprise, JAMAIS une par
 * stagiaire. Jusqu'ici cette règle ne vivait que dans des scripts ponctuels :
 * un clic « préparer la formation » sur SES-0107 (ASSALIT SYNDIC, 8 salariés)
 * ou SES-0108 (EXPERTA, 1 salariée) produisait encore des conventions
 * nominatives, en doublon de la convention d'entreprise correcte.
 *
 * Les DEUX orchestrateurs sont couverts : `prepareSession` (création de
 * session, fire-and-forget) et `prepareTrainingForSession` (bouton
 * « Préparer »). Ils sont appelés depuis des chemins différents — corriger un
 * seul laisserait l'autre produire le mauvais document.
 *
 * Test de puissance : retirer le `!` de `isPersonneMoralePayeur` fait rougir
 * tout ce fichier (les salariés repartent sur le chemin individuel).
 */

const m = vi.hoisted(() => ({
  validateRequest: vi.fn(),
  sessionFindFirst: vi.fn(),
  participantFindMany: vi.fn(),
  pedagogicalAssetFindMany: vi.fn(),
  pedagogicalAssetFindFirst: vi.fn(),
  documentFindMany: vi.fn(),
  documentDeleteMany: vi.fn(),
  closureBatchCreate: vi.fn(),
  closureBatchFindFirst: vi.fn(),
  auditLogCreate: vi.fn(),
  productUpdate: vi.fn(),
  generateConventionCore: vi.fn(),
  generateConventionEntrepriseCore: vi.fn(),
  generateConvocationForParticipant: vi.fn(),
  generateProgrammeForProduct: vi.fn(),
  generateDerouleForProduct: vi.fn(),
  generateChecklistForSession: vi.fn(),
  generateAgeficeForParticipant: vi.fn(),
  enqueueClosureJob: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: m.sessionFindFirst },
    trainingProduct: { update: m.productUpdate },
    sessionParticipant: { findMany: m.participantFindMany },
    pedagogicalAsset: { findMany: m.pedagogicalAssetFindMany, findFirst: m.pedagogicalAssetFindFirst },
    document: { findMany: m.documentFindMany, deleteMany: m.documentDeleteMany },
    closureBatch: { create: m.closureBatchCreate, findFirst: m.closureBatchFindFirst },
    auditLog: { create: m.auditLogCreate },
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: m.validateRequest }));

// Le routeur `routeConventionsByPayerRule` (extrait le 28/08 vers
// `@/lib/closure/route-conventions`) n'appelle QUE les cœurs sans auth — d'où
// le mock du cœur individuel et non plus celui du wrapper server action.
vi.mock('@/lib/closure/convention-core', () => ({
  generateConventionCore: m.generateConventionCore,
  generateConventionEntrepriseCore: m.generateConventionEntrepriseCore,
}));
vi.mock('../convocation-generator', () => ({
  generateConvocationForParticipant: m.generateConvocationForParticipant,
}));
vi.mock('../programme-generator', () => ({
  generateProgrammeForProduct: m.generateProgrammeForProduct,
}));
vi.mock('../deroule-product-generator', () => ({
  generateDerouleForProduct: m.generateDerouleForProduct,
}));
vi.mock('../generate-checklist-formation', () => ({
  generateChecklistForSession: m.generateChecklistForSession,
}));
vi.mock('../agefice-generator', () => ({
  generateAgeficeForParticipant: m.generateAgeficeForParticipant,
}));
vi.mock('@/lib/closure/queue-postgres', () => ({ enqueueClosureJob: m.enqueueClosureJob }));

const USER = { id: 'usr-1', tenantId: 'tnt-1' };

/** Inscrit tel que le `select` de prepare-training doit désormais le charger. */
function inscrit(
  id: string,
  firstName: string,
  sponsorOrgId: string,
  legalForm: string | null,
  legalName: string | null,
) {
  return {
    id,
    sponsorOrgId,
    sponsorOrg: legalForm ? { id: sponsorOrgId, legalName, legalForm } : null,
    person: { firstName, lastName: 'TEST' },
  };
}

/** SES-0107 : 8 salariés d'ASSALIT SYNDIC (SARL), payeur = l'employeur. */
const ASSALIT = Array.from({ length: 8 }, (_, i) =>
  inscrit(`sp-${i + 1}`, `Salarie${i + 1}`, 'org-assalit', 'SARL', 'ASSALIT SYNDIC'),
);

/** SES-0108 : une seule salariée — reste un groupe, pas un contrat individuel. */
const EXPERTA = [inscrit('sp-e1', 'Sandrine', 'org-experta', 'SARL', 'EXPERTA')];

const AUTO_PAYEURS = [
  inscrit('sp-a1', 'Alice', 'org-ei-alice', 'AUTO_ENTREPRENEUR', 'Alice EI'),
  inscrit('sp-a2', 'Bob', 'org-ei-bob', 'EI', 'Bob EI'),
];

function seedSession(participants: unknown[]) {
  m.sessionFindFirst.mockResolvedValue({
    id: 'ses-1',
    productId: 'prod-1',
    pricePerLearner: 2500,
    product: { id: 'prod-1', title: 'IA immobilier', priceHT: 2500 },
    participants,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.validateRequest.mockResolvedValue({ user: USER });
  m.generateProgrammeForProduct.mockResolvedValue({ ok: true });
  m.generateDerouleForProduct.mockResolvedValue({ ok: true });
  m.generateChecklistForSession.mockResolvedValue({ ok: true });
  m.generateConventionCore.mockResolvedValue({ ok: true, documentId: 'doc-indiv' });
  m.generateConventionEntrepriseCore.mockResolvedValue({ ok: true, documentId: 'doc-groupe', count: 1 });
  m.generateConvocationForParticipant.mockResolvedValue({ ok: true, documentId: 'doc-convoc' });
  m.generateAgeficeForParticipant.mockResolvedValue({ ok: true });
  m.participantFindMany.mockResolvedValue([]); // aucun éligible AGEFICE
  m.pedagogicalAssetFindMany.mockResolvedValue([]);
  m.pedagogicalAssetFindFirst.mockResolvedValue(null);
  m.documentFindMany.mockResolvedValue([]);
  m.documentDeleteMany.mockResolvedValue({ count: 0 });
  m.closureBatchCreate.mockResolvedValue({ id: 'batch-1', jobs: [] });
  m.closureBatchFindFirst.mockResolvedValue(null);
  m.auditLogCreate.mockResolvedValue({});
  m.enqueueClosureJob.mockResolvedValue(undefined);
});

async function importActions() {
  return await import('../prepare-training');
}

describe.each([
  ['prepareSession', 'prepareSession' as const],
  ['prepareTrainingForSession', 'prepareTrainingForSession' as const],
])('%s — règle payeur personne morale', (_label, fn) => {
  it('produit UNE convention de groupe et ZÉRO convention nominative (SES-0107)', async () => {
    seedSession(ASSALIT);
    const actions = await importActions();
    await actions[fn]('ses-1');

    expect(m.generateConventionEntrepriseCore).toHaveBeenCalledTimes(1);
    expect(m.generateConventionEntrepriseCore).toHaveBeenCalledWith('tnt-1', 'ses-1', 'org-assalit');
    // Le cœur SANS auth, jamais le wrapper individuel.
    expect(m.generateConventionCore).not.toHaveBeenCalled();
  });

  it('traite une salariée seule comme un groupe (SES-0108 EXPERTA)', async () => {
    seedSession(EXPERTA);
    const actions = await importActions();
    await actions[fn]('ses-1');

    expect(m.generateConventionEntrepriseCore).toHaveBeenCalledWith('tnt-1', 'ses-1', 'org-experta');
    expect(m.generateConventionCore).not.toHaveBeenCalled();
  });

  it('laisse les auto-payeurs sur le chemin individuel (non-régression)', async () => {
    seedSession(AUTO_PAYEURS);
    const actions = await importActions();
    await actions[fn]('ses-1');

    expect(m.generateConventionEntrepriseCore).not.toHaveBeenCalled();
    expect(m.generateConventionCore).toHaveBeenCalledTimes(2);
    expect(m.generateConventionCore).toHaveBeenCalledWith('tnt-1', 'sp-a1');
    expect(m.generateConventionCore).toHaveBeenCalledWith('tnt-1', 'sp-a2');
  });

  it('sépare correctement une session mixte', async () => {
    seedSession([...EXPERTA, ...AUTO_PAYEURS, ...ASSALIT.slice(0, 2)]);
    const actions = await importActions();
    await actions[fn]('ses-1');

    const orgs = m.generateConventionEntrepriseCore.mock.calls.map((c) => c[2]).sort();
    expect(orgs).toEqual(['org-assalit', 'org-experta']);
    expect(m.generateConventionCore).toHaveBeenCalledTimes(2);
  });

  it('convoque CHAQUE salarié nominativement (la convocation reste par stagiaire)', async () => {
    seedSession(ASSALIT);
    const actions = await importActions();
    await actions[fn]('ses-1');

    expect(m.generateConvocationForParticipant).toHaveBeenCalledTimes(8);
  });

  it('compte les inscrits COUVERTS, pas le nombre d’appels', async () => {
    // Sinon la fiche session afficherait « 1 convention / 8 inscrits » et
    // déclencherait à tort l'action de masse qui régénère des individuelles.
    seedSession(ASSALIT);
    const actions = await importActions();
    const res = await actions[fn]('ses-1');

    expect(res.conventionsGenerated).toBe(8);
  });

  it('remonte l’échec d’un groupe en nommant l’entreprise', async () => {
    seedSession(EXPERTA);
    m.generateConventionEntrepriseCore.mockResolvedValue({
      ok: false,
      error: 'Prix HT manquant pour Sandrine TEST',
    });
    const actions = await importActions();
    const res = await actions[fn]('ses-1');

    const err = res.errors.find((e) => e.doc === 'CONVENTION');
    expect(err).toBeDefined();
    expect(err!.participantName).toBe('EXPERTA');
    expect(err!.message).toMatch(/Prix HT manquant/);
    expect(res.conventionsGenerated).toBe(0);
  });
});

describe('prepareSession — analyse des besoins', () => {
  beforeEach(() => {
    // Le batch renvoie les jobs réellement demandés.
    m.closureBatchCreate.mockImplementation(async (args: any) => ({
      id: 'batch-1',
      jobs: (args.data.jobs?.create ?? []).map((j: any, i: number) => ({
        id: `job-${i}`,
        participantId: j.participantId,
        kind: j.kind,
      })),
    }));
  });

  it('n’enfile AUCUNE analyse par stagiaire quand le payeur est une personne morale', async () => {
    seedSession(ASSALIT);
    const { prepareSession } = await importActions();
    const res = await prepareSession('ses-1');

    expect(res.analyseBesoinEnqueued).toBe(0);
    expect(m.enqueueClosureJob).not.toHaveBeenCalled();
    // Un batch vide pollue la barre de progression : on n'en crée pas.
    expect(m.closureBatchCreate).not.toHaveBeenCalled();
  });

  it('affiche honnêtement l’analyse d’ENTREPRISE manquante', async () => {
    seedSession(EXPERTA);
    const { prepareSession } = await importActions();
    const res = await prepareSession('ses-1');

    expect(res.analyseBesoinEntrepriseAttendue).toBe(1);
    expect(res.analyseBesoinEntreprisePresente).toBe(0);
    // Surtout pas gonfler le compteur par stagiaire : deux natures de document.
    expect(res.analyseBesoinEnqueued).toBe(0);
  });

  it('voit l’analyse d’entreprise déjà rendue (asset session, participantId=null)', async () => {
    seedSession(EXPERTA);
    m.pedagogicalAssetFindFirst.mockResolvedValue({ id: 'asset-ent' });
    const { prepareSession } = await importActions();
    const res = await prepareSession('ses-1');

    expect(res.analyseBesoinEntreprisePresente).toBe(1);
    expect(res.analyseBesoinEntrepriseAttendue).toBe(0);

    const where = m.pedagogicalAssetFindFirst.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.tenantId).toBe('tnt-1');
    expect(where.sessionId).toBe('ses-1');
    expect(where.kind).toBe('ANALYSE_BESOIN');
    expect(where.participantId).toBeNull();
  });

  it('conserve le comportement historique pour les auto-payeurs', async () => {
    seedSession(AUTO_PAYEURS);
    const { prepareSession } = await importActions();
    const res = await prepareSession('ses-1');

    expect(res.analyseBesoinEnqueued).toBe(2);
    expect(m.enqueueClosureJob).toHaveBeenCalledTimes(2);
    expect(res.analyseBesoinEntrepriseAttendue).toBe(0);
  });

  it('sur une session mixte, n’enfile que les auto-payeurs', async () => {
    seedSession([...ASSALIT.slice(0, 3), ...AUTO_PAYEURS]);
    const { prepareSession } = await importActions();
    const res = await prepareSession('ses-1');

    expect(res.analyseBesoinEnqueued).toBe(2);
    const enfiles = m.enqueueClosureJob.mock.calls.map((c) => c[0].participantId).sort();
    expect(enfiles).toEqual(['sp-a1', 'sp-a2']);
    expect(res.analyseBesoinEntrepriseAttendue).toBe(1);
  });
});

describe('prepareSession — traçabilité', () => {
  it('journalise le nombre de conventions groupe et individuelles', async () => {
    seedSession([...ASSALIT, ...AUTO_PAYEURS]);
    const { prepareSession } = await importActions();
    await prepareSession('ses-1');

    const diff = m.auditLogCreate.mock.calls[0]![0].data.diff as Record<string, unknown>;
    expect(diff.conventionsGroupe).toBe(1);
    expect(diff.conventionsIndividuelles).toBe(2);
  });
});

describe('getSessionPreparationStatus — les deux formes de convention groupe', () => {
  it('interroge les deux entityType, pas seulement `organization`', async () => {
    m.sessionFindFirst.mockResolvedValue({
      id: 'ses-1',
      productId: 'prod-1',
      participants: [{ id: 'sp-1', sponsorOrgId: 'org-experta' }],
    });
    const { getSessionPreparationStatus } = await importActions();
    await getSessionPreparationStatus('ses-1');

    const or = m.documentFindMany.mock.calls[0]![0].where.OR as Array<Record<string, any>>;
    const branche = or.find((b) => b.type === 'CONVENTION' && b.sessionId === 'ses-1');
    expect(branche).toBeDefined();
    expect(branche!.entityType).toEqual({ in: ['organization', 'session'] });
  });

  it('compte la convention produite par script (forme `session`) comme couvrante', async () => {
    // Sans ça, le statut réclame une convention qui existe déjà et propose
    // l'action de masse qui régénère des nominatives.
    m.sessionFindFirst.mockResolvedValue({
      id: 'ses-1',
      productId: 'prod-1',
      participants: [
        { id: 'sp-1', sponsorOrgId: 'org-experta' },
        { id: 'sp-2', sponsorOrgId: 'org-experta' },
      ],
    });
    m.documentFindMany.mockResolvedValue([
      { type: 'CONVENTION', entityType: 'session', entityId: 'ses-1', participantId: null },
    ]);

    const { getSessionPreparationStatus } = await importActions();
    const res = await getSessionPreparationStatus('ses-1');

    expect(res.conventionsCount).toBe(2);
  });

  it('expose les compteurs d’analyse besoin séparés (stagiaire vs entreprise)', async () => {
    m.sessionFindFirst.mockResolvedValue({
      id: 'ses-1',
      productId: 'prod-1',
      participants: [
        {
          id: 'sp-1',
          sponsorOrgId: 'org-experta',
          sponsorOrg: { id: 'org-experta', legalName: 'EXPERTA', legalForm: 'SARL' },
        },
      ],
    });
    const { getSessionPreparationStatus } = await importActions();
    const res = await getSessionPreparationStatus('ses-1');

    // Aucune analyse par stagiaire n'est attendue : le payeur est l'employeur.
    expect(res.analyseBesoinAttendue).toBe(0);
    expect(res.analyseBesoinEntrepriseAttendue).toBe(1);
    expect(res.analyseBesoinEntreprisePresente).toBe(0);
  });

  it('attend une analyse par stagiaire pour chaque auto-payeur', async () => {
    m.sessionFindFirst.mockResolvedValue({
      id: 'ses-1',
      productId: 'prod-1',
      participants: [
        {
          id: 'sp-1',
          sponsorOrgId: 'org-ei',
          sponsorOrg: { id: 'org-ei', legalName: 'Alice EI', legalForm: 'AUTO_ENTREPRENEUR' },
        },
      ],
    });
    const { getSessionPreparationStatus } = await importActions();
    const res = await getSessionPreparationStatus('ses-1');

    expect(res.analyseBesoinAttendue).toBe(1);
    expect(res.analyseBesoinEntrepriseAttendue).toBe(0);
  });

  it('n’enregistre JAMAIS un sessionId comme identifiant de participant', async () => {
    m.sessionFindFirst.mockResolvedValue({
      id: 'ses-1',
      productId: 'prod-1',
      participants: [{ id: 'sp-1', sponsorOrgId: 'org-experta' }],
    });
    m.documentFindMany.mockResolvedValue([
      { type: 'CONVENTION', entityType: 'session', entityId: 'ses-1', participantId: null },
    ]);

    const { getSessionPreparationStatus } = await importActions();
    const res = await getSessionPreparationStatus('ses-1');

    // 1 inscrit couvert — et surtout pas 2 (le doc + le participant).
    expect(res.conventionsCount).toBe(1);
  });
});

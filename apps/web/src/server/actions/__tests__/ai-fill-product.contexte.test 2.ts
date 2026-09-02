import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Donner plus de contexte à l'IA au moment de créer un programme — demande de
 * Laurent (28/08) :
 *
 *   « quand j'ai déjà fait une proposition à un client sur des modules je
 *     voudrais lui mettre ce que je lui ai proposé et qu'elle me le
 *     retranscrive en programme »
 *   « je veux aussi qu'elle se base sur nos programmes déjà présents dans
 *     QualiOF car ils sont conformes Qualiopi »
 *
 * Deux modes qui ne doivent PAS se confondre :
 *  - sans proposition → l'IA RÉDIGE depuis le thème (comportement historique) ;
 *  - avec proposition → elle TRANSCRIT, et n'a plus le droit d'inventer un
 *    module absent. C'est la règle de fidélité déjà éprouvée sur la
 *    normalisation de programme.
 *
 * Test de puissance : retirer le bloc de fidélité du prompt fait virer ROUGE
 * « interdit d'inventer un module absent de la proposition ».
 */

const { callLlmMock, validateRequestMock, productFindManyMock } = vi.hoisted(() => ({
  callLlmMock: vi.fn(),
  validateRequestMock: vi.fn(),
  productFindManyMock: vi.fn(),
}));

vi.mock('@/lib/llm-client', () => ({ callLlm: callLlmMock }));
vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: validateRequestMock }));
vi.mock('@qualiof/db', () => ({
  prisma: { trainingProduct: { findMany: productFindManyMock } },
}));

const DRAFT = {
  objectives: ['Prospecter avec méthode'],
  targetAudience: 'Conseillers',
  prerequisites: 'Aucun',
  pedagogicalMethods: 'Présentiel',
  pedagogicalSupport: 'Livret',
  evaluationMethods: '- QCM',
  trainerProfile: 'Formateurs expérimentés',
  accessibility: 'La loi du 5 septembre 2018…',
  accessConditions: 'Afin de vous inscrire…',
  programMd: '## Jour 1\n- Contenu',
};

const CATALOGUE_CONFORME = {
  id: 'p-ref',
  code: 'PROD-0042',
  title: 'IA pour conseillers immobiliers',
  theme: 'Immobilier',
  durationHours: 21,
  programMd: '### Jour 1 — Structurer sa prospection\n'.padEnd(400, 'contenu audité '),
  aiDraftedAt: null,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({ user: { id: 'u1', tenantId: 'tnt-1' } });
  productFindManyMock.mockResolvedValue([CATALOGUE_CONFORME]);
  callLlmMock.mockResolvedValue({ parsedJson: DRAFT, durationMs: 1200 });
});

async function appeler(extra: Record<string, unknown> = {}) {
  const { aiPreFillProduct } = await import('../ai-fill-product');
  const r = await aiPreFillProduct({
    title: 'Prospecter avec l’IA',
    theme: 'Immobilier',
    durationHours: 21,
    ...extra,
  });
  return { r, appel: callLlmMock.mock.calls[0]![0] };
}

describe('aiPreFillProduct — proposition client', () => {
  it('transmet la proposition telle quelle à l’IA', async () => {
    const proposition = 'Module 1 : audit du portefeuille\nModule 2 : relance des mandats expirés';
    const { r, appel } = await appeler({ propositionClient: proposition });

    expect(r.ok).toBe(true);
    expect(appel.prompt).toContain('audit du portefeuille');
    expect(appel.prompt).toContain('relance des mandats expirés');
  });

  it('interdit d’inventer un module absent de la proposition', async () => {
    const { appel } = await appeler({ propositionClient: 'Module 1 : audit du portefeuille' });
    const envoye = `${appel.systemPrompt}\n${appel.prompt}`.toLowerCase();

    // Le mode transcription doit être explicite : décliner, pas enrichir.
    expect(envoye).toContain('transcri');
    expect(envoye).toMatch(/n['’]ajoute|sans rien ajouter|aucun (module|thème) absent/);
  });

  it('sans proposition, garde le mode rédaction historique', async () => {
    const { appel } = await appeler();
    expect(appel.prompt).not.toContain('PROPOSITION');
  });
});

describe('aiPreFillProduct — programmes de référence du catalogue', () => {
  it('montre à l’IA un programme conforme déjà en base', async () => {
    const { appel } = await appeler();
    expect(appel.systemPrompt).toContain('IA pour conseillers immobiliers');
    expect(appel.systemPrompt).toContain('contenu audité');
  });

  it('encadre l’usage des références : la forme, jamais le fond', async () => {
    const { appel } = await appeler();
    expect(appel.systemPrompt).toMatch(/INTERDIT d['’]en reprendre le CONTENU/i);
  });

  it('ne montre jamais un brouillon IA non relu', async () => {
    productFindManyMock.mockResolvedValue([
      { ...CATALOGUE_CONFORME, aiDraftedAt: new Date('2026-08-01') },
    ]);
    const { appel } = await appeler();
    expect(appel.systemPrompt).not.toContain('contenu audité');
  });

  it('retombe sur les exemples de référence intégrés quand le catalogue est vide', async () => {
    productFindManyMock.mockResolvedValue([]);
    const { appel } = await appeler();
    // Le style Start Academy reste enseigné : un tenant neuf n'est pas laissé nu.
    expect(appel.systemPrompt).toContain('EXEMPLES DE PROGRAMMES START ACADEMY');
  });

  it('scope la lecture du catalogue au tenant', async () => {
    await appeler();
    const where = productFindManyMock.mock.calls[0]![0].where;
    expect(where.tenantId).toBe('tnt-1');
  });
});

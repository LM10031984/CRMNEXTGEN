import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Devis monté depuis un compte rendu de rendez-vous — idée de Laurent (28/08).
 *
 * Ce que l'action garantit :
 *  - les MONTANTS viennent de la saisie (jours × tarif), jamais du modèle ;
 *  - rien n'est créé si l'extraction échoue — un devis coquille vide chez un
 *    client est pire que pas de devis ;
 *  - le programme n'est créé que si Laurent le demande, et toujours en
 *    BROUILLON : il part d'un compte rendu, personne ne l'a encore relu.
 *
 * Test de puissance : retirer le `aiDrafted: true` de la création du produit
 * fait virer ROUGE « crée le programme en brouillon ».
 */

const m = vi.hoisted(() => ({
  extraire: vi.fn(),
  createQuote: vi.fn(),
  addLine: vi.fn(),
  updateQuote: vi.fn(),
  aiPreFill: vi.fn(),
  createProduct: vi.fn(),
  quoteUpdate: vi.fn(),
  validateRequest: vi.fn(),
}));

vi.mock('@/lib/quotes/rdv-extraction', () => ({ extraireDevisDuRdv: m.extraire }));
vi.mock('../quotes', () => ({
  createQuote: m.createQuote,
  addLine: m.addLine,
  updateQuote: m.updateQuote,
}));
vi.mock('../ai-fill-product', () => ({ aiPreFillProduct: m.aiPreFill }));
vi.mock('../crud-edits', () => ({ createTrainingProduct: m.createProduct }));
vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: m.validateRequest }));
vi.mock('@qualiof/db', () => ({ prisma: { quote: { update: m.quoteUpdate } } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const BESOIN = {
  intituleFormation: 'Prospection immobilière assistée par IA',
  contexteClient: 'Cabinet de 8 négociateurs.',
  besoins: ['Relancer les mandats expirés'],
  objectifs: ['Structurer une campagne de relance'],
  modules: ['Module 1 : audit du portefeuille', 'Module 2 : relance des mandats'],
  publicConcerne: 'Négociateurs',
  descriptionLigne: 'Formation « Prospection immobilière assistée par IA » — 3 jours (21 h)',
  argumentaire: 'Vous nous avez exposé…',
};

const ENTREE = {
  recipientName: 'ASSALIT SYNDIC',
  transcript: 'Le client a 8 négociateurs et des mandats qui dorment…',
  jours: 3,
  tarifJourHT: 1200,
  creerProgramme: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.validateRequest.mockResolvedValue({ user: { id: 'u1', tenantId: 'tnt-1' } });
  m.extraire.mockResolvedValue(BESOIN);
  m.createQuote.mockResolvedValue({ ok: true, data: { id: 'q-1', number: 'DEV-0001' } });
  m.addLine.mockResolvedValue({ ok: true, data: { lineId: 'l-1' } });
  m.updateQuote.mockResolvedValue({ ok: true });
  m.aiPreFill.mockResolvedValue({ ok: true, draft: { programMd: '## Jour 1', objectives: ['O1'] } });
  m.createProduct.mockResolvedValue({ ok: true, productId: 'prod-1', code: 'FRM-0007' });
});

async function lancer(extra: Record<string, unknown> = {}) {
  const { createQuoteFromRdv } = await import('../quote-from-rdv');
  return createQuoteFromRdv({ ...ENTREE, ...extra });
}

describe('createQuoteFromRdv', () => {
  it('crée le devis au nom de la formation comprise en rendez-vous', async () => {
    const r = await lancer();
    expect(r.ok).toBe(true);
    expect(r.number).toBe('DEV-0001');
    expect(m.createQuote.mock.calls[0]![0]).toMatchObject({
      recipientName: 'ASSALIT SYNDIC',
      title: 'Prospection immobilière assistée par IA',
    });
  });

  it('chiffre la ligne avec CE QUE L’ORGANISME A SAISI, jamais avec le modèle', async () => {
    await lancer();
    expect(m.addLine.mock.calls[0]![0]).toMatchObject({
      quoteId: 'q-1',
      quantity: 3,
      unitPriceHT: 1200,
    });
    expect(m.addLine.mock.calls[0]![0].description).toContain('Prospection immobilière');
  });

  it('porte l’argumentaire sur le devis', async () => {
    await lancer();
    expect(m.updateQuote.mock.calls[0]![0]).toMatchObject({
      quoteId: 'q-1',
      notes: 'Vous nous avez exposé…',
    });
  });

  it('ne crée aucun programme tant qu’on ne le demande pas', async () => {
    await lancer();
    expect(m.aiPreFill).not.toHaveBeenCalled();
    expect(m.createProduct).not.toHaveBeenCalled();
  });

  it('crée le programme en BROUILLON, transcrit des modules compris en rendez-vous', async () => {
    const r = await lancer({ creerProgramme: true });

    expect(m.aiPreFill.mock.calls[0]![0]).toMatchObject({
      title: 'Prospection immobilière assistée par IA',
      durationHours: 24, // 3 jours × 8 h (règle Start Academy)
    });
    expect(m.aiPreFill.mock.calls[0]![0].propositionClient).toContain('audit du portefeuille');
    // Brouillon : il sort d'un compte rendu, personne ne l'a relu.
    expect(m.createProduct.mock.calls[0]![0]).toMatchObject({ aiDrafted: true });
    expect(r.productCode).toBe('FRM-0007');
    // …et le devis pointe le programme qu'il vend.
    expect(m.quoteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sourceProductId: 'prod-1' } }),
    );
  });

  it('ne crée RIEN quand l’extraction échoue', async () => {
    m.extraire.mockResolvedValue(null);
    const r = await lancer();
    expect(r.ok).toBe(false);
    expect(m.createQuote).not.toHaveBeenCalled();
  });

  it('refuse un chiffrage absurde plutôt que d’émettre un devis à zéro', async () => {
    expect((await lancer({ jours: 0 })).ok).toBe(false);
    expect((await lancer({ tarifJourHT: 0 })).ok).toBe(false);
    expect(m.createQuote).not.toHaveBeenCalled();
  });

  /**
   * Le programme est un CONFORT : s'il échoue, le devis reste valable et part
   * chez le client. On le signale sans faire échouer l'ensemble.
   */
  it('rend le devis même si la génération du programme échoue', async () => {
    m.aiPreFill.mockResolvedValue({ ok: false, error: 'IA indisponible' });
    const r = await lancer({ creerProgramme: true });
    expect(r.ok).toBe(true);
    expect(r.quoteId).toBe('q-1');
    expect(r.productWarning).toMatch(/IA indisponible/);
  });
});

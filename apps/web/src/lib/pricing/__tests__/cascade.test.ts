import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Cascade du tarif de session vers les inscrits (écart E-2 de l'audit du 28/08).
 *
 * Ce que la cascade doit garantir, et qui vaut plus que la propagation
 * elle-même : ne JAMAIS réécrire le prix d'un inscrit dont une pièce
 * contractuelle porte déjà un montant. La fiche et la convention diraient alors
 * deux sommes différentes.
 *
 * Test de puissance : retirer le filtre des engagés fait virer ROUGE
 * « ne touche pas à un inscrit déjà facturé ».
 */

const m = vi.hoisted(() => ({
  participantFindMany: vi.fn(),
  documentFindMany: vi.fn(),
  invoiceFindMany: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionParticipant: { findMany: m.participantFindMany, updateMany: m.updateMany },
    document: { findMany: m.documentFindMany },
    invoice: { findMany: m.invoiceFindMany },
    auditLog: { create: m.auditCreate },
  },
  Prisma: { Decimal: class { constructor(public v: number) {} } },
}));

const BASE = { tenantId: 'tnt-1', userId: 'u-1', sessionId: 'ses-1', newPrice: 850 };

beforeEach(() => {
  vi.clearAllMocks();
  m.participantFindMany.mockResolvedValue([
    { id: 'sp-1', sponsorOrgId: 'org-1' },
    { id: 'sp-2', sponsorOrgId: 'org-1' },
  ]);
  m.documentFindMany.mockResolvedValue([]);
  m.invoiceFindMany.mockResolvedValue([]);
  m.updateMany.mockResolvedValue({ count: 2 });
  m.auditCreate.mockResolvedValue({});
});

async function cascader(over = {}) {
  const { applyPriceCascade } = await import('../cascade');
  return applyPriceCascade({ ...BASE, ...over });
}

describe('applyPriceCascade', () => {
  it('aligne les inscrits libres sur le nouveau tarif', async () => {
    const r = await cascader();
    expect(r.updated).toBe(2);
    expect(m.updateMany.mock.calls[0]![0].where.id).toEqual({ in: ['sp-1', 'sp-2'] });
  });

  it('ne touche pas à un inscrit déjà facturé', async () => {
    m.invoiceFindMany.mockResolvedValue([{ participantId: 'sp-1', participantIds: [] }]);
    const r = await cascader();
    expect(m.updateMany.mock.calls[0]![0].where.id).toEqual({ in: ['sp-2'] });
    expect(r.skipped).toEqual([{ id: 'sp-1', motif: 'facture' }]);
  });

  it('reconnaît une facture GROUPÉE, qui porte plusieurs inscrits', async () => {
    m.invoiceFindMany.mockResolvedValue([{ participantId: null, participantIds: ['sp-1', 'sp-2'] }]);
    const r = await cascader();
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(r.updated).toBe(0);
  });

  it('ne touche pas à un inscrit couvert par une convention NOMINATIVE', async () => {
    m.documentFindMany.mockResolvedValue([
      { id: 'd-1', type: 'CONVENTION', entityType: 'participant', entityId: 'sp-1', participantId: 'sp-1' },
    ]);
    const r = await cascader();
    expect(r.skipped).toEqual([{ id: 'sp-1', motif: 'convention' }]);
  });

  /**
   * La convention d'ENTREPRISE ne porte aucun `participantId` : elle couvre les
   * salariés par le commanditaire. Un filtre écrit à la main la manquerait —
   * d'où le passage par le helper de couverture partagé.
   */
  it('ne touche pas aux salariés couverts par une convention d’ENTREPRISE', async () => {
    m.documentFindMany.mockResolvedValue([
      { id: 'd-g', type: 'CONVENTION', entityType: 'organization', entityId: 'org-1', participantId: null },
    ]);
    const r = await cascader();
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(r.skipped.map((s) => s.id)).toEqual(['sp-1', 'sp-2']);
  });

  it('ne propage RIEN quand le tarif est effacé — pas de conventions à zéro euro', async () => {
    const r = await cascader({ newPrice: null });
    expect(r.updated).toBe(0);
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.participantFindMany).not.toHaveBeenCalled();
  });

  it('journalise ce qui a bougé ET ce qui a été laissé', async () => {
    m.invoiceFindMany.mockResolvedValue([{ participantId: 'sp-1', participantIds: [] }]);
    await cascader();
    const diff = m.auditCreate.mock.calls[0]![0].data.diff;
    expect(m.auditCreate.mock.calls[0]![0].data.action).toBe('pricing.cascade');
    expect(diff.updated).toEqual(['sp-2']);
    expect(diff.skipped).toEqual([{ id: 'sp-1', motif: 'facture' }]);
  });

  it('scope toutes ses lectures au tenant', async () => {
    await cascader();
    expect(m.participantFindMany.mock.calls[0]![0].where.session).toEqual({ tenantId: 'tnt-1' });
    expect(m.documentFindMany.mock.calls[0]![0].where.tenantId).toBe('tnt-1');
    expect(m.invoiceFindMany.mock.calls[0]![0].where.tenantId).toBe('tnt-1');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9.3 (plan 09.3-01) — tests comportementaux des wrappers Prisma
 * du résolveur. Verrouille la règle PII D-09.3 :
 *   - racine résolue via findFirst({ where: { id, tenantId } })
 *   - racine hors tenant → null, AUCUNE autre requête émise
 *
 * Stratégie de mock : clone-strict du harness update-session-details.test.ts.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    person: { findFirst: vi.fn() },
    trainingProduct: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    document: { findMany: vi.fn() },
    pedagogicalAsset: { findMany: vi.fn() },
  },
}));

import { prisma } from '@qualiof/db';
import {
  resolveDocsForLearner,
  resolveDocsForProduct,
  resolveDocsForTenant,
} from '../resolve-docs-db';

const TENANT = 'tenant-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveDocsForLearner — scoping tenant (PII)', () => {
  it('personne hors tenant → null, aucune requête document/asset émise', async () => {
    vi.mocked(prisma.person.findFirst).mockResolvedValue(null);

    const result = await resolveDocsForLearner(TENANT, 'pers-autre-tenant');

    expect(result).toBeNull();
    expect(prisma.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pers-autre-tenant', tenantId: TENANT },
      }),
    );
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.pedagogicalAsset.findMany).not.toHaveBeenCalled();
  });

  it('happy path : union Documents + assets + CNI + RIB + CFP, requêtes scopées tenantId', async () => {
    vi.mocked(prisma.person.findFirst).mockResolvedValue({
      id: 'pers-1',
      ribKey: 'rib/pers-1.pdf',
      sensitiveData: { id: 'sd-1', idDocumentUrl: 'cni/pers-1.pdf', idDocumentType: 'CNI' },
      legalLinks: [
        {
          organization: {
            id: 'org-1',
            ageficeProfile: { id: 'agf-1', cfpAttestationKey: 'cfp/org-1.pdf' },
          },
        },
      ],
      participations: [{ id: 'part-1' }],
    } as never);
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      {
        id: 'doc-1',
        type: 'CONVENTION',
        entityType: 'participant',
        entityId: 'part-1',
        sessionId: 'ses-1',
        participantId: 'part-1',
        createdAt: new Date('2026-05-01'),
      },
    ] as never);
    vi.mocked(prisma.pedagogicalAsset.findMany).mockResolvedValue([
      {
        id: 'asset-1',
        kind: 'QCM',
        sessionId: 'ses-1',
        participantId: 'part-1',
        pdfUrl: 'x.pdf',
        rawJson: { source: 'stub' },
        generatedAt: new Date('2026-05-02'),
      },
    ] as never);

    const result = await resolveDocsForLearner(TENANT, 'pers-1');

    expect(result).not.toBeNull();
    const tables = result!.map((d) => d.sourceTable).sort();
    expect(tables).toEqual(
      ['AgeficeProfile', 'Document', 'PedagogicalAsset', 'Person', 'SensitiveData'].sort(),
    );
    expect(result!.find((d) => d.sourceId === 'asset-1')?.usedStub).toBe(true);

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
    );
    expect(prisma.pedagogicalAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
    );
  });

  it('apprenant sans participation → pas de findMany inutile, identité quand même exposée', async () => {
    vi.mocked(prisma.person.findFirst).mockResolvedValue({
      id: 'pers-2',
      ribKey: 'rib/pers-2.pdf',
      sensitiveData: null,
      legalLinks: [],
      participations: [],
    } as never);

    const result = await resolveDocsForLearner(TENANT, 'pers-2');

    expect(result!.map((d) => d.sourceTable)).toEqual(['Person']);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.pedagogicalAsset.findMany).not.toHaveBeenCalled();
  });
});

describe('resolveDocsForProduct — scoping tenant', () => {
  it('produit hors tenant → null, aucune requête document', async () => {
    vi.mocked(prisma.trainingProduct.findFirst).mockResolvedValue(null);

    const result = await resolveDocsForProduct(TENANT, 'prod-x');

    expect(result).toBeNull();
    expect(prisma.trainingProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prod-x', tenantId: TENANT } }),
    );
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it("happy path : Documents entityType='product' scopés tenant", async () => {
    vi.mocked(prisma.trainingProduct.findFirst).mockResolvedValue({ id: 'prod-1' } as never);
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      {
        id: 'doc-prog',
        type: 'PROGRAMME',
        entityType: 'product',
        entityId: 'prod-1',
        sessionId: null,
        participantId: null,
        createdAt: new Date('2026-04-01'),
      },
    ] as never);

    const result = await resolveDocsForProduct(TENANT, 'prod-1');

    expect(result).toHaveLength(1);
    expect(result![0]!.scope).toBe('product');
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, entityType: 'product', entityId: 'prod-1' },
      }),
    );
  });
});

describe('resolveDocsForTenant', () => {
  it('expose les docs légaux markdown + leurs PDFs générés (entityType=tenant)', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      cgvMarkdown: '# CGV',
      reglementInterieurMarkdown: null,
    } as never);
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      {
        id: 'doc-cgv-pdf',
        type: 'CGV',
        entityType: 'tenant',
        entityId: TENANT,
        sessionId: null,
        participantId: null,
        createdAt: new Date('2026-05-20'),
      },
    ] as never);

    const result = await resolveDocsForTenant(TENANT);

    const markdown = result.find((d) => d.sourceTable === 'Tenant');
    const pdf = result.find((d) => d.sourceTable === 'Document' && d.scope === 'tenant');
    expect(markdown?.docType).toBe('CGV');
    expect(pdf?.scope).toBe('tenant');
    // RI non rédigé → pas d'entrée fantôme
    expect(
      result.find((d) => d.sourceTable === 'Tenant' && d.docType === 'REGLEMENT_INTERIEUR'),
    ).toBeUndefined();
  });
});

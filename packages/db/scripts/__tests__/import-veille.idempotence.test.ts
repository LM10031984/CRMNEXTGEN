import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 13 Plan 13-01 Task 0 (Wave 0) — tests RED pour l'idempotence du script
 * d'import xlsx `import-veille-from-xlsx.ts`.
 *
 * Couvre VEILLE-01 : "Import xlsx idempotent (2 runs successifs = même count)".
 *
 * Stratégie de mock : on remplace `@qualiof/db` par un singleton prisma factice
 * et on inspecte les appels findFirst / create / update / auditLog.create.
 *
 * Conventions Phase 13 :
 *  - Idempotence : findFirst sur (tenantId, theme, title, url) AVANT create.
 *  - Sur match → update (pas create).
 *  - Sur match SANS modification → NE PAS créer d'AuditLog.
 *  - Convention AuditLog `regulatoryWatch.created` (1ère instanciation D-Phase 13).
 *
 * Note d'architecture : la fonction testée `processAndPersistRows` est exposée
 * depuis le script `import-veille-from-xlsx.ts` (export nommé) afin de pouvoir
 * être testée sans exécuter `main()`.
 */

vi.mock('@qualiof/db', () => {
  return {
    prisma: {
      regulatoryWatch: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    },
  };
});

import { prisma } from '@qualiof/db';
import { persistVeilleRow } from '../import-veille-from-xlsx';

const findFirst = prisma.regulatoryWatch.findFirst as unknown as ReturnType<typeof vi.fn>;
const createRow = prisma.regulatoryWatch.create as unknown as ReturnType<typeof vi.fn>;
const updateRow = prisma.regulatoryWatch.update as unknown as ReturnType<typeof vi.fn>;
const auditCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;

const sampleRow = {
  title: 'Ministère du Travail',
  url: 'https://travail-emploi.gouv.fr/actualites/',
  modeSuivi: 'consultation régulière',
  typeSource: 'Site web institutionnel',
  responsable: 'Laurent',
  frequency: 'Régulière',
  exploitation: 'Mise à jour des certificats de réalisation',
  rawSnippet: null,
  dateLastReviewed: null,
};

describe('persistVeilleRow — idempotence (Plan 13-01)', () => {
  beforeEach(() => {
    findFirst.mockReset();
    createRow.mockReset();
    updateRow.mockReset();
    auditCreate.mockReset();
  });

  it('Test 1 — premier run : pas de match → create + AuditLog `regulatoryWatch.created`', async () => {
    findFirst.mockResolvedValueOnce(null);
    createRow.mockResolvedValueOnce({ id: 'rw-1' });

    const out = await persistVeilleRow('tenant-A', 'INDIC_23', sampleRow);

    expect(findFirst).toHaveBeenCalledTimes(1);
    const findArgs = findFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({
      tenantId: 'tenant-A',
      theme: 'INDIC_23',
      title: sampleRow.title,
      url: sampleRow.url,
    });

    expect(createRow).toHaveBeenCalledTimes(1);
    expect(updateRow).not.toHaveBeenCalled();

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const auditArgs = auditCreate.mock.calls[0]?.[0] as {
      data: { action: string; entity: string; entityId: string; tenantId: string };
    };
    expect(auditArgs.data.action).toBe('regulatoryWatch.created');
    expect(auditArgs.data.entity).toBe('RegulatoryWatch');
    expect(auditArgs.data.entityId).toBe('rw-1');
    expect(auditArgs.data.tenantId).toBe('tenant-A');

    expect(out.result).toBe('inserted');
  });

  it('Test 2 — second run avec ligne modifiée → update (pas create)', async () => {
    findFirst.mockResolvedValueOnce({ id: 'rw-1' });
    updateRow.mockResolvedValueOnce({ id: 'rw-1' });

    const enriched = { ...sampleRow, exploitation: 'Exploitation enrichie 2026' };
    const out = await persistVeilleRow('tenant-A', 'INDIC_23', enriched);

    expect(updateRow).toHaveBeenCalledTimes(1);
    expect(createRow).not.toHaveBeenCalled();

    const updateArgs = updateRow.mock.calls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.where.id).toBe('rw-1');
    expect(updateArgs.data.exploitation).toBe('Exploitation enrichie 2026');

    expect(out.result).toBe('updated');
  });

  it('Test 3 — second run identique : pas de nouvel AuditLog `regulatoryWatch.created`', async () => {
    findFirst.mockResolvedValueOnce({ id: 'rw-1' });
    updateRow.mockResolvedValueOnce({ id: 'rw-1' });

    await persistVeilleRow('tenant-A', 'INDIC_23', sampleRow);

    const auditCreatedCalls = auditCreate.mock.calls.filter((c) => {
      const args = c[0] as { data: { action: string } };
      return args.data.action === 'regulatoryWatch.created';
    });
    expect(auditCreatedCalls.length).toBe(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 18 Plan 18-02 — Tests hermétiques du script de migration MinIO→Supabase.
 *
 * Le script `migrate-storage.ts` copie chaque objet référencé en base de MinIO
 * (source) vers Supabase (cible), en DRY par défaut (WRITE=1 explicite), puis
 * vérifie 0 lien mort et écrit un rapport daté audit-réutilisable.
 *
 * PÉRIMÈTRE COMPLET (vérifié dans schema.prisma) — 8 champs de clé storage
 * sur 8 tables, 2 buckets :
 *   Bucket qualiof-docs :
 *     Person.ribKey / SensitiveData.idDocumentUrl / Invoice.pdfUrl /
 *     Quote.pdfUrl / Document.pdfUrl / AgeficeProfile.cfpAttestationKey /
 *     PedagogicalAsset.pdfUrl
 *   Bucket preinscriptions :
 *     PreEnrollment.cniKey / ribKey / cfpKey
 *
 * Stratégie de mock (HERMÉTIQUE, pattern vi.hoisted projet) :
 *  - `@qualiof/db` (prisma.*.findMany) mocké → collectAllKeys testable sans DB.
 *  - Les dépendances I/O (downloadFromMinio / uploadToSupabase / verifyExists)
 *    sont INJECTÉES dans runMigration (aucun client réel en test).
 *  - Le script EXPORTE ses fonctions pures : collectAllKeys(prisma),
 *    isInvalidSupabaseKey(key), runMigration({...}). main() n'est PAS exécuté.
 *
 * Coverage (5 tests) :
 *  1. collectAllKeys → 9 entrées (8 champs, cfpKey null exclu), 2 bucket
 *     preinscriptions + 7 bucket qualiof-docs.
 *  2. isInvalidSupabaseKey → leading /, //, %, accent = true ; clés propres = false.
 *  3. DRY (write:false) → uploadToSupabase JAMAIS appelé, report.migrated vide.
 *  4. orphelin : downloadFromMinio throw → report.orphans, PAS report.migrated,
 *     le run ne throw pas (try/catch par clé).
 *  5. clé invalide (accent) en WRITE → report.invalidKeys, uploader NON appelé.
 */

const {
  personFindMany,
  sensitiveDataFindMany,
  invoiceFindMany,
  quoteFindMany,
  documentFindMany,
  ageficeProfileFindMany,
  pedagogicalAssetFindMany,
  preEnrollmentFindMany,
} = vi.hoisted(() => ({
  personFindMany: vi.fn(),
  sensitiveDataFindMany: vi.fn(),
  invoiceFindMany: vi.fn(),
  quoteFindMany: vi.fn(),
  documentFindMany: vi.fn(),
  ageficeProfileFindMany: vi.fn(),
  pedagogicalAssetFindMany: vi.fn(),
  preEnrollmentFindMany: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    person: { findMany: personFindMany },
    sensitiveData: { findMany: sensitiveDataFindMany },
    invoice: { findMany: invoiceFindMany },
    quote: { findMany: quoteFindMany },
    document: { findMany: documentFindMany },
    ageficeProfile: { findMany: ageficeProfileFindMany },
    pedagogicalAsset: { findMany: pedagogicalAssetFindMany },
    preEnrollment: { findMany: preEnrollmentFindMany },
    $disconnect: vi.fn(),
  },
}));

import { prisma } from '@qualiof/db';
import { collectAllKeys, isInvalidSupabaseKey, runMigration } from '../migrate-storage';

beforeEach(() => {
  personFindMany.mockReset().mockResolvedValue([]);
  sensitiveDataFindMany.mockReset().mockResolvedValue([]);
  invoiceFindMany.mockReset().mockResolvedValue([]);
  quoteFindMany.mockReset().mockResolvedValue([]);
  documentFindMany.mockReset().mockResolvedValue([]);
  ageficeProfileFindMany.mockReset().mockResolvedValue([]);
  pedagogicalAssetFindMany.mockReset().mockResolvedValue([]);
  preEnrollmentFindMany.mockReset().mockResolvedValue([]);
});

describe('collectAllKeys', () => {
  it('Test 1 : collecte les 8 champs storage sur 2 buckets, cfpKey null exclu → 9 entrées', async () => {
    personFindMany.mockResolvedValue([{ id: 'p1', ribKey: 'apprenants/t/u/rib.pdf' }]);
    sensitiveDataFindMany.mockResolvedValue([{ id: 's1', idDocumentUrl: 'apprenants/t/u/cni.jpg' }]);
    invoiceFindMany.mockResolvedValue([{ id: 'i1', pdfUrl: 'factures/f1.pdf' }]);
    quoteFindMany.mockResolvedValue([{ id: 'q1', pdfUrl: 'devis/q1.pdf' }]);
    documentFindMany.mockResolvedValue([{ id: 'd1', pdfUrl: 'docs/d1.pdf' }]);
    ageficeProfileFindMany.mockResolvedValue([{ id: 'a1', cfpAttestationKey: 'cfp/a1.pdf' }]);
    pedagogicalAssetFindMany.mockResolvedValue([{ id: 'pa1', pdfUrl: 'assets/pa1.pdf' }]);
    preEnrollmentFindMany.mockResolvedValue([
      { id: 'pe1', cniKey: 'tok/cni.jpg', ribKey: 'tok/rib.jpg', cfpKey: null },
    ]);

    const keys = await collectAllKeys(prisma as any);

    // 8 champs non-null : 7 docs + 2 preinscriptions (cniKey, ribKey), cfpKey null exclu → 9.
    expect(keys).toHaveLength(9);
    expect(keys.filter((k) => k.bucket === 'preinscriptions')).toHaveLength(2);
    expect(keys.filter((k) => k.bucket === 'qualiof-docs')).toHaveLength(7);
    // cfpKey null ne doit PAS être collecté.
    expect(keys.some((k) => k.key === null || k.key === undefined)).toBe(false);
  });

  it('exclut les valeurs null/vides (aucune clé si toutes les tables vides)', async () => {
    const keys = await collectAllKeys(prisma as any);
    expect(keys).toHaveLength(0);
  });
});

describe('isInvalidSupabaseKey', () => {
  it('Test 2 : leading /, //, %, accent → true ; clés propres → false', () => {
    expect(isInvalidSupabaseKey('/x')).toBe(true);
    expect(isInvalidSupabaseKey('a//b')).toBe(true);
    expect(isInvalidSupabaseKey('a%b')).toBe(true);
    expect(isInvalidSupabaseKey('café/x')).toBe(true);
    expect(isInvalidSupabaseKey('apprenants/t1/uuid/cni.pdf')).toBe(false);
    expect(isInvalidSupabaseKey('token/rib-123.jpg')).toBe(false);
  });
});

describe('runMigration', () => {
  it('Test 3 : DRY (write:false) → uploadToSupabase JAMAIS appelé, migrated vide', async () => {
    const upMock = vi.fn();
    const report = await runMigration({
      keys: [{ bucket: 'qualiof-docs', table: 'Document', field: 'pdfUrl', id: 'd1', key: 'docs/d1.pdf' }],
      write: false,
      downloadFromMinio: async () => Buffer.from('x'),
      uploadToSupabase: upMock,
      verifyExists: async () => true,
    });

    expect(upMock).not.toHaveBeenCalled();
    expect(report.migrated).toHaveLength(0);
  });

  it('Test 4 : orphelin — downloadFromMinio throw → report.orphans, PAS migrated, ne throw pas', async () => {
    const upMock = vi.fn();
    const report = await runMigration({
      keys: [
        { bucket: 'qualiof-docs', table: 'Person', field: 'ribKey', id: 'p1', key: 'apprenants/t/u/rib.pdf' },
      ],
      write: true,
      downloadFromMinio: async () => {
        throw new Error('NoSuchKey');
      },
      uploadToSupabase: upMock,
      verifyExists: async () => true,
    });

    expect(report.orphans.some((o) => o.key === 'apprenants/t/u/rib.pdf')).toBe(true);
    expect(report.migrated.some((m) => m.key === 'apprenants/t/u/rib.pdf')).toBe(false);
    expect(upMock).not.toHaveBeenCalled();
  });

  it('Test 5 : clé invalide (accent) en WRITE → report.invalidKeys, uploader NON appelé', async () => {
    const upMock = vi.fn();
    const report = await runMigration({
      keys: [{ bucket: 'qualiof-docs', table: 'Document', field: 'pdfUrl', id: 'x', key: 'café/x.pdf' }],
      write: true,
      downloadFromMinio: async () => Buffer.from('x'),
      uploadToSupabase: upMock,
      verifyExists: async () => true,
    });

    expect(report.invalidKeys.some((k) => k.key === 'café/x.pdf')).toBe(true);
    expect(upMock).not.toHaveBeenCalled();
  });
});

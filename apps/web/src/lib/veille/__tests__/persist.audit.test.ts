import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 13 Plan 13-05 Task 0 — Tests Wave 0 RED pour `persistAutoSuggestion` —
 * focus AuditLog et statut DRAFT/AUTO.
 *
 * Coverage (3 tests minimum) :
 *  1. Insert nominal → prisma.regulatoryWatch.create appelé avec status='DRAFT' suggestedBy='AUTO'.
 *  2. AuditLog créé avec action='regulatoryWatch.auto_inserted' actorUserId=null (system).
 *  3. theme='OTHER' → outcome='skipped_other' PAS d'INSERT regulatoryWatch ni AuditLog.
 *
 * D-08 (CONTEXT.md) : toujours DRAFT, jamais auto-accept même si confidence>=90.
 */

const regulatoryWatchFindFirst = vi.fn();
const regulatoryWatchCreate = vi.fn();
const auditLogCreate = vi.fn();
vi.mock('@qualiof/db', () => ({
  prisma: {
    regulatoryWatch: { findFirst: regulatoryWatchFindFirst, create: regulatoryWatchCreate },
    auditLog: { create: auditLogCreate },
  },
}));

import { persistAutoSuggestion } from '../persist';

beforeEach(() => {
  regulatoryWatchFindFirst.mockReset();
  regulatoryWatchCreate.mockReset();
  auditLogCreate.mockReset();
});

describe('persistAutoSuggestion — AuditLog & status', () => {
  it('inserts with status=DRAFT and suggestedBy=AUTO (D-08 NO auto-accept)', async () => {
    regulatoryWatchFindFirst.mockResolvedValueOnce(null);
    regulatoryWatchCreate.mockResolvedValueOnce({ id: 'rw-1' });

    const outcome = await persistAutoSuggestion({
      tenantId: 'tenant-1',
      item: {
        title: 'Évolution OPCO 2026',
        link: 'https://opco.example.com/news/1',
        pubDate: null,
        contentSnippet: 'L\'OPCO ATLAS modifie ses conditions...',
      },
      classification: {
        theme: 'INDIC_23',
        confidence: 95, // > 90 → mais on garde DRAFT (D-08)
        exploitation_draft: 'Action : mettre à jour le process OPCO dans Qualiopi.',
      },
      sourceConfig: {
        name: 'OPCO ATLAS',
        url: 'https://opco.example.com/feed',
        theme: 'INDIC_23',
      },
    });
    expect(outcome).toBe('inserted');
    expect(regulatoryWatchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          theme: 'INDIC_23',
          status: 'DRAFT',
          suggestedBy: 'AUTO',
        }),
      }),
    );
  });

  it('logs AuditLog regulatoryWatch.auto_inserted with actorUserId=null', async () => {
    regulatoryWatchFindFirst.mockResolvedValueOnce(null);
    regulatoryWatchCreate.mockResolvedValueOnce({ id: 'rw-2' });

    await persistAutoSuggestion({
      tenantId: 'tenant-1',
      item: {
        title: 't',
        link: 'https://x.example/1',
        pubDate: null,
        contentSnippet: 's',
      },
      classification: {
        theme: 'INDIC_24',
        confidence: 80,
        exploitation_draft: 'Action concrète pour le secteur immobilier.',
      },
      sourceConfig: {
        name: 'Immo2',
        url: 'https://immo2.example/feed',
        theme: 'INDIC_24',
      },
    });
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          userId: null,
          entity: 'RegulatoryWatch',
          entityId: 'rw-2',
          action: 'regulatoryWatch.auto_inserted',
        }),
      }),
    );
  });

  it('does NOT insert or log when theme=OTHER (returns skipped_other)', async () => {
    const outcome = await persistAutoSuggestion({
      tenantId: 'tenant-1',
      item: {
        title: 'Foot PSG',
        link: 'https://lequipe.example/1',
        pubDate: null,
        contentSnippet: 's',
      },
      classification: {
        theme: 'OTHER' as never, // narrow elsewhere
        confidence: 20,
        exploitation_draft: 'Hors scope.',
      },
      sourceConfig: {
        name: 'L\'Équipe',
        url: 'https://lequipe.example/feed',
        // sourceConfig.theme reste un thème Qualiopi (la classification a viré OTHER)
        theme: 'INDIC_24',
      },
    });
    expect(outcome).toBe('skipped_other');
    expect(regulatoryWatchCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});

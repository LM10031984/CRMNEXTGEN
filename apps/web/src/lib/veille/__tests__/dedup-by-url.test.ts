import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 13 Plan 13-05 Task 0 — Tests Wave 0 RED dédup `(tenantId, url, theme)`.
 *
 * D-11 (CONTEXT.md) : dédup par tuple (url, theme) — pas par url seule.
 * La même URL classée dans 2 thèmes différents → 2 INSERT autorisés.
 *
 * Coverage (3 tests minimum) :
 *  1. findFirst({ tenantId, url, theme }) trouve match → outcome='skipped_dedup' + pas de create.
 *  2. Même URL avec theme différent → INSERT autorisé (D-11).
 *  3. URL différente même theme → INSERT.
 */

const { regulatoryWatchFindFirst, regulatoryWatchCreate, auditLogCreate } = vi.hoisted(() => ({
  regulatoryWatchFindFirst: vi.fn(),
  regulatoryWatchCreate: vi.fn(),
  auditLogCreate: vi.fn(),
}));
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

const FAKE_ITEM = {
  title: 'Décret Qualiopi 2026',
  link: 'https://example.com/article-x',
  pubDate: null,
  contentSnippet: 'Snippet',
};

const baseInput = (themeOverride?: 'INDIC_23' | 'INDIC_24') => ({
  tenantId: 'tenant-1',
  item: FAKE_ITEM,
  classification: {
    theme: themeOverride ?? ('INDIC_23' as const),
    confidence: 80,
    exploitation_draft: 'Action concrète à mener pour conformité Qualiopi.',
  },
  sourceConfig: {
    name: 'Source X',
    url: 'https://example.com/feed',
    theme: themeOverride ?? ('INDIC_23' as const),
  },
});

describe('persistAutoSuggestion — dedup', () => {
  it('skips insert when (tenantId, url, theme) already exists', async () => {
    regulatoryWatchFindFirst.mockResolvedValueOnce({ id: 'existing-1' });
    const outcome = await persistAutoSuggestion(baseInput());
    expect(outcome).toBe('skipped_dedup');
    expect(regulatoryWatchFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          url: FAKE_ITEM.link,
          theme: 'INDIC_23',
        }),
      }),
    );
    expect(regulatoryWatchCreate).not.toHaveBeenCalled();
  });

  it('inserts when same URL but different theme (D-11 autorise duplication thématique)', async () => {
    // INDIC_23 déjà existe, on tente INDIC_24 sur la même URL
    regulatoryWatchFindFirst.mockResolvedValueOnce(null);
    regulatoryWatchCreate.mockResolvedValueOnce({ id: 'rw-new-2' });
    const outcome = await persistAutoSuggestion(baseInput('INDIC_24'));
    expect(outcome).toBe('inserted');
    expect(regulatoryWatchFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          url: FAKE_ITEM.link,
          theme: 'INDIC_24',
        }),
      }),
    );
    expect(regulatoryWatchCreate).toHaveBeenCalled();
  });

  it('inserts when URL different even if same theme', async () => {
    regulatoryWatchFindFirst.mockResolvedValueOnce(null);
    regulatoryWatchCreate.mockResolvedValueOnce({ id: 'rw-new-3' });
    const input = baseInput();
    input.item = { ...FAKE_ITEM, link: 'https://example.com/article-Y' };
    const outcome = await persistAutoSuggestion(input);
    expect(outcome).toBe('inserted');
    expect(regulatoryWatchCreate).toHaveBeenCalled();
  });
});

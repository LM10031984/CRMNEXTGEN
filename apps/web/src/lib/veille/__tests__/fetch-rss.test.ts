import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 13 Plan 13-05 Task 0 — Tests Wave 0 RED pour `fetchRssFromSource`.
 *
 * Strategy de mock :
 *  - `rss-parser` default export (class Parser) mocké :
 *    on injecte un `parseURL` réutilisable que chaque test pilote.
 *
 * Coverage (3 tests minimum) :
 *  1. Feed RSS 2.0 valide → array d'items normalisés (title/link/contentSnippet).
 *  2. Erreur (404 / network / XML malformé) → retourne [] + log (pas de throw).
 *  3. Items sans title ou sans link → filtrés out.
 */

const parseURL = vi.fn();
vi.mock('rss-parser', () => ({
  default: class {
    parseURL = parseURL;
  },
}));

import { fetchRssFromSource } from '../fetch-rss';

beforeEach(() => {
  parseURL.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('fetchRssFromSource', () => {
  it('parses a valid RSS 2.0 feed into normalized items', async () => {
    parseURL.mockResolvedValueOnce({
      items: [
        {
          title: '  Décret Qualiopi 2026  ',
          link: 'https://example.com/article-1',
          pubDate: 'Mon, 12 May 2026 08:00:00 GMT',
          contentSnippet: '  Le décret n°2026-123 modifie les indicateurs...  ',
        },
        {
          title: 'AGEFIPH ouvre les budgets 2027',
          link: 'https://example.com/article-2',
          pubDate: null,
          content: 'Snippet de remplacement quand contentSnippet absent.',
        },
      ],
    });

    const out = await fetchRssFromSource('https://example.com/feed');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      title: 'Décret Qualiopi 2026',
      link: 'https://example.com/article-1',
      contentSnippet: 'Le décret n°2026-123 modifie les indicateurs...',
    });
    expect(out[1]?.contentSnippet).toContain('Snippet de remplacement');
  });

  it('returns empty array and logs when fetch fails (404, network, XML invalid)', async () => {
    parseURL.mockRejectedValueOnce(new Error('HTTP 404 Not Found'));
    const out = await fetchRssFromSource('https://broken.example.com/feed');
    expect(out).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('filters out items missing title or link', async () => {
    parseURL.mockResolvedValueOnce({
      items: [
        { title: 'OK item', link: 'https://example.com/ok', contentSnippet: 'ok' },
        { title: '', link: 'https://example.com/no-title', contentSnippet: 'x' },
        { title: 'No link item', link: '', contentSnippet: 'x' },
      ],
    });
    const out = await fetchRssFromSource('https://example.com/feed');
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('OK item');
  });
});

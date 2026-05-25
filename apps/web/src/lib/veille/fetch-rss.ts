/**
 * Phase 13 Plan 13-05 — RSS fetcher fault-tolerant.
 *
 * Utilise `rss-parser` (npm 3.x, MIT) qui normalise RSS 2.0 / Atom / RDF en
 * `{ title, link, pubDate, contentSnippet }`.
 *
 * Politique d'erreur (RESEARCH §13 mitigation R1) :
 *  - 404 / network / XML malformé / timeout → log + return [] (jamais throw).
 *  - Le worker traite chaque source en isolation : 1 source morte ne casse pas
 *    l'ingestion des autres.
 *
 * Worker safety : 0 import React / server-action / rbac.
 */

import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15_000,
});

export interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  contentSnippet: string;
}

export async function fetchRssFromSource(url: string): Promise<RssItem[]> {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items ?? [])
      .map((it): RssItem => ({
        title: (it.title ?? '').trim(),
        link: (it.link ?? '').trim(),
        pubDate: it.pubDate ?? null,
        contentSnippet: (it.contentSnippet ?? it.content ?? '').trim().slice(0, 800),
      }))
      .filter((it) => it.title && it.link);
  } catch (e) {
    console.warn(
      `[veille] RSS fetch failed for ${url}: ${(e as Error).message}`,
    );
    return [];
  }
}

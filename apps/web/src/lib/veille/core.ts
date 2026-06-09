/**
 * Phase 13 Plan 13-05 — Logique pure d'ingestion RSS pour un tenant donné.
 *
 * Pattern Worker Safety (mémoire `feedback_worker_no_react_imports.md`) :
 *  - ZÉRO import server-action / rbac / validateRequest / React / next/cache.
 *  - Importable depuis `scripts/veille-worker.ts` (tsx) sans crash
 *    "react does not provide an export named 'cache'".
 *  - Le wrapper auth (server action) sera créé en Plan séparé si besoin de
 *    déclencher l'ingestion depuis l'UI. Pour V1 : worker only.
 *
 * Stratégie d'ingestion (RESEARCH §6 + §13 mitigations) :
 *  - Itère sur les sources actives.
 *  - Pour chaque source : fetch RSS (tolérant), classifie max 5 items récents
 *    (cap pour ne pas saturer Ollama, ~5-10s/item × 12 sources = ~10 min max),
 *    persiste suivant le résultat.
 *  - Compte fetched / classified / skipped / inserted / errors pour observabilité.
 */

import { RSS_SOURCES } from './sources';
import { fetchRssFromSource } from './fetch-rss';
import { classifyItem } from './classify';
import { persistAutoSuggestion } from './persist';

/** Cap items par source (limite quota Ollama). */
const MAX_ITEMS_PER_SOURCE = 5;

export interface IngestResult {
  /** Items récupérés des flux RSS (avant cap). */
  fetched: number;
  /** Items classifiés OK par Ollama (incluant OTHER — la décision skip est ensuite). */
  classified: number;
  /** Items ignorés (OTHER, low confidence, dedup, ou échec persistence non-fatal). */
  skipped: number;
  /** Rows RegulatoryWatch effectivement créées en BDD. */
  inserted: number;
  /** Erreurs RSS (feed mort, parse error) OU Ollama (timeout, JSON malformé). */
  errors: number;
}

export async function ingestRssOnceForTenant(tenantId: string): Promise<IngestResult> {
  const result: IngestResult = {
    fetched: 0,
    classified: 0,
    skipped: 0,
    inserted: 0,
    errors: 0,
  };

  const activeSources = RSS_SOURCES.filter((s) => s.active);
  console.log(
    `[veille core] tenant=${tenantId} sources=${activeSources.length} (cap ${MAX_ITEMS_PER_SOURCE} items/source)`,
  );

  for (const source of activeSources) {
    const items = await fetchRssFromSource(source.url);
    if (items.length === 0) {
      // 0 items = source morte OU feed vide (le warn est déjà loggé par fetch-rss).
      result.errors += 1;
      continue;
    }
    result.fetched += items.length;

    // Cap pour ne pas saturer Ollama. Les items RSS sont généralement triés
    // par date desc côté flux → on prend les plus récents.
    for (const item of items.slice(0, MAX_ITEMS_PER_SOURCE)) {
      try {
        const classification = await classifyItem(
          { title: item.title, snippet: item.contentSnippet, source: source.name },
          tenantId,
        );
        if (!classification) {
          result.errors += 1;
          continue;
        }
        result.classified += 1;

        const outcome = await persistAutoSuggestion({
          tenantId,
          item,
          classification,
          sourceConfig: {
            name: source.name,
            url: source.url,
            theme: source.theme,
          },
        });
        if (outcome === 'inserted') result.inserted += 1;
        else result.skipped += 1;
      } catch (e) {
        // Erreur isolée par item : on log et on continue (ne casse pas l'ingestion globale).
        console.error(
          `[veille core] item process failed source=${source.name} title="${item.title.slice(0, 60)}" err=${(e as Error).message}`,
        );
        result.errors += 1;
      }
    }
  }

  console.log(
    `[veille core] tenant=${tenantId} result=${JSON.stringify(result)}`,
  );
  return result;
}

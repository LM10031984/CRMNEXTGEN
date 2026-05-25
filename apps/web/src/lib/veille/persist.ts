/**
 * Phase 13 Plan 13-05 — Persistance d'une suggestion auto worker.
 *
 * D-08 (CONTEXT.md) : toujours `status='DRAFT'` + `suggestedBy='AUTO'`. Pas
 * d'auto-accept même si confidence ≥ 90. La validation humaine via l'inbox
 * (Plan 03) est la valeur Qualiopi.
 *
 * D-11 (CONTEXT.md) : dédup par tuple `(tenantId, url, theme)` — pas par url
 * seule. La même URL classée dans 2 thèmes différents → 2 INSERT autorisés.
 *
 * Guard-rails (RESEARCH §6.4) :
 *  1. theme=OTHER → outcome='skipped_other', pas d'INSERT.
 *  2. confidence < 50 → outcome='skipped_low_confidence', pas d'INSERT.
 *  3. Dédup (tenantId, url, theme) → outcome='skipped_dedup'.
 *  4. AuditLog `regulatoryWatch.auto_inserted` avec actorUserId=null (system).
 *
 * Worker safety : 0 import React / server-action / rbac. Helper
 * `regulatoryWatch-audit.ts` est sûr (Plan 01 a vérifié no React import).
 */

import { prisma } from '@qualiof/db';
import { logRegulatoryWatchEvent } from '@/lib/regulatoryWatch-audit';
import type { RssItem } from './fetch-rss';
import type { ClassifyOutput } from './classify';

export type PersistOutcome =
  | 'inserted'
  | 'skipped_dedup'
  | 'skipped_other'
  | 'skipped_low_confidence';

export interface PersistAutoSuggestionInput {
  tenantId: string;
  item: RssItem;
  classification: ClassifyOutput;
  sourceConfig: {
    name: string;
    url: string;
    theme: 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';
  };
}

export async function persistAutoSuggestion(
  input: PersistAutoSuggestionInput,
): Promise<PersistOutcome> {
  const { tenantId, item, classification, sourceConfig } = input;

  // Guard 1 — OTHER → pas d'INSERT (cf D-08, RESEARCH §6.4-3).
  if (classification.theme === 'OTHER') return 'skipped_other';

  // Guard 2 — confidence basse → ignorer (RESEARCH §6.4-2 paranoid filter).
  // L'UI inbox (Plan 03) affichera tout de même un badge "incertaine"
  // pour 50 ≤ conf < 60.
  if (classification.confidence < 50) return 'skipped_low_confidence';

  // Le theme classifié devient le `theme` final de la ligne. Si la classification
  // diverge du thème de la source seed, on fait confiance à Ollama (Plan 06 audit).
  // Narrowing TS : on a éliminé 'OTHER' au guard 1 ci-dessus.
  const finalTheme = classification.theme as 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';

  // Guard 3 — Dédup D-11 par (tenantId, url, theme). Pas url seule.
  const existing = await prisma.regulatoryWatch.findFirst({
    where: { tenantId, url: item.link, theme: finalTheme },
    select: { id: true },
  });
  if (existing) return 'skipped_dedup';

  // INSERT — D-08 toujours DRAFT/AUTO.
  const created = await prisma.regulatoryWatch.create({
    data: {
      tenantId,
      theme: finalTheme,
      title: item.title.slice(0, 300),
      url: item.link,
      source: sourceConfig.name,
      exploitation: classification.exploitation_draft.slice(0, 5000),
      rawSnippet: item.contentSnippet.slice(0, 2000),
      rssSourceUrl: sourceConfig.url,
      status: 'DRAFT',
      suggestedBy: 'AUTO',
    },
  });

  // AuditLog Phase 13 verbe `auto_inserted` (8e et dernier verbe convention).
  await logRegulatoryWatchEvent({
    tenantId,
    actorUserId: null, // system worker
    targetWatchId: created.id,
    action: 'regulatoryWatch.auto_inserted',
    diff: {
      source: sourceConfig.name,
      theme: finalTheme,
      confidence: classification.confidence,
      url: item.link,
      rssSourceUrl: sourceConfig.url,
    },
  });

  return 'inserted';
}

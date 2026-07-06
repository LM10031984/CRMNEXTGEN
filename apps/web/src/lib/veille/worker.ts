/**
 * Phase 13 Plan 13-05 → Phase 20 Plan 20-01 — Handler veille (croner).
 *
 * WORK-02 (D-03 « Redis viré partout ») : ce handler ne dépend plus de BullMQ.
 * Il accepte un payload neutre `{ triggered_by }` et est appelé par le cron
 * interne `scripts/veille-worker.ts` (croner, lundi 8h Europe/Paris) — plus de
 * `Worker`/Redis. La planification renaît du code au boot du process.
 *
 * Multi-tenant : itère sur tous les tenants (typiquement 1 seul pour Start Academy
 * mono-tenant en V1, mais le worker est prêt pour multi-tenant).
 *
 * Ingestion séquentielle pour ne pas saturer le LLM
 * (~5-10s par item, 12 sources × 5 items = ~10 min).
 *
 * Worker safety : 0 import server-action / rbac / React.
 */

import { prisma } from '@qualiof/db';
import { ingestRssOnceForTenant, type IngestResult } from './core';

interface TenantIngestSummary extends IngestResult {
  tenantId: string;
  tenantName: string;
}

export async function processVeilleJob(input: {
  triggered_by: string;
}): Promise<TenantIngestSummary[]> {
  console.log(
    `[veille-worker] tick jobId=cron triggered_by=${input.triggered_by}`,
  );

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });
  const summaries: TenantIngestSummary[] = [];
  for (const t of tenants) {
    const r = await ingestRssOnceForTenant(t.id);
    summaries.push({ tenantId: t.id, tenantName: t.name, ...r });
  }
  return summaries;
}

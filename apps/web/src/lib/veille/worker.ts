/**
 * Phase 13 Plan 13-05 — BullMQ Worker veille.
 *
 * Clone-strict pattern Phase 11 `invoice-reminders/worker.ts:startInvoiceReminderWorker`.
 *
 * Multi-tenant : itère sur tous les tenants (typiquement 1 seul pour Start Academy
 * mono-tenant en V1, mais le worker est prêt pour multi-tenant).
 *
 * Concurrency=1 : ingestion séquentielle pour ne pas saturer Ollama local
 * (mistral-small:24b prend ~5-10s par item, 12 sources × 5 items = ~10 min).
 *
 * Worker safety : 0 import server-action / rbac / React.
 */

import { Worker, type Job } from 'bullmq';
import { prisma } from '@qualiof/db';
import { getWorkerRedis } from '../closure/redis';
import { VEILLE_QUEUE_NAME, type VeilleJobPayload } from './queue';
import { ingestRssOnceForTenant, type IngestResult } from './core';

interface TenantIngestSummary extends IngestResult {
  tenantId: string;
  tenantName: string;
}

export async function processVeilleJob(
  job: Job<VeilleJobPayload>,
): Promise<TenantIngestSummary[]> {
  console.log(
    `[veille-worker] tick jobId=${job.id} triggered_by=${job.data.triggered_by}`,
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

export function startVeilleWorker(): Worker<VeilleJobPayload> {
  const worker = new Worker<VeilleJobPayload>(
    VEILLE_QUEUE_NAME,
    processVeilleJob as never,
    {
      connection: getWorkerRedis(),
      concurrency: 1,
    },
  );

  worker.on('completed', (job, result) => {
    console.log('[veille-worker] completed', {
      jobId: job.id,
      summaries: result,
    });
  });
  worker.on('failed', (job, err) => {
    console.error('[veille-worker] failed', {
      jobId: job?.id,
      err: err.message,
    });
  });
  worker.on('error', (err) => {
    console.error('[veille-worker] error', err);
  });

  console.log(
    `[veille-worker] started (queue="${VEILLE_QUEUE_NAME}", concurrency=1)`,
  );
  return worker;
}

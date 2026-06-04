/**
 * Vercel Cron endpoint : traite un batch de ClosureJob QUEUED.
 *
 * Configuration `vercel.json` (à ajouter au déploiement) :
 *   {
 *     "crons": [
 *       { "path": "/api/cron/closure-worker", "schedule": "*\/1 * * * *" }
 *     ]
 *   }
 *
 * Sécurisé via `CRON_SECRET` (Vercel ajoute un header `Authorization: Bearer <secret>`
 * sur ses calls cron). En dev : pas de check si CRON_SECRET vide.
 */

import { NextResponse } from 'next/server';
import { processNextClosureJobs } from '@/lib/closure/queue-postgres';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel hobby = 60s max

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const maxJobs = Number(process.env.QUEUE_CONCURRENCY ?? 3);
  const start = Date.now();
  const r = await processNextClosureJobs(maxJobs);
  const elapsed = Date.now() - start;

  return NextResponse.json({
    ok: true,
    elapsed_ms: elapsed,
    ...r,
  });
}

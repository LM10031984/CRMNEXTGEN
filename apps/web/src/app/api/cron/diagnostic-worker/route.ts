/**
 * Cron Vercel — RATTRAPAGE des programmes du diagnostic restés en attente.
 *
 * Ce n'est PAS le mécanisme d'envoi : le mécanisme, c'est le navigateur du
 * prospect (`POST /api/diagnostic/traiter`, appelé depuis l'écran de
 * remerciement). Ce cron ramasse ce que le navigateur n'a pas pu déclencher —
 * onglet fermé dans la seconde, 4G coupée, mode avion en sortant de la soirée.
 *
 * Déclaré dans `apps/web/vercel.json` :
 *   { "path": "/api/cron/diagnostic-worker", "schedule": "*\/5 * * * *" }
 *
 * La cadence 5 minutes suppose un plan Vercel **Pro** (sur Hobby les crons ne se
 * déclenchent qu'une fois par jour). Le projet est en Pro — vérifié Phase 21.
 * Le worker pm2 Railway (`scripts/diagnostic-worker.ts`) fait le même travail :
 * les deux peuvent tourner ensemble, le verrou optimiste de la soumission
 * empêche tout doublon d'email.
 *
 * Sécurisé par `CRON_SECRET` (Vercel ajoute `Authorization: Bearer <secret>`).
 */

import { NextResponse } from 'next/server';
import { processDiagnosticSends } from '@/lib/diagnostic/worker';

export const dynamic = 'force-dynamic';
/** Vercel Pro — un lot de 20 soumissions à ~30 s de génération chacune. */
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();
  const r = await processDiagnosticSends({ triggered_by: 'vercel-cron' });

  return NextResponse.json({ ok: true, elapsed_ms: Date.now() - start, ...r });
}

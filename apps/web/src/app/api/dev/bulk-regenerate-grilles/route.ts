/**
 * Endpoint DEV pour régénérer en masse toutes les grilles d'observation
 * vides (générées avec l'ancien prompt Ollama qui laissait niveau à null).
 *
 * Usage : GET /api/dev/bulk-regenerate-grilles
 *
 * Renvoie un JSON avec total / regenerated / skipped / errors.
 */

import { NextResponse } from 'next/server';
import { bulkRegenerateEmptyGrilles } from '@/server/actions/bulk-regenerate-grilles';

export const dynamic = 'force-dynamic';
// Vercel Hobby plafonne à 300s (5 min). Pro = 900s. Cet endpoint dev est
// rarement utilisé en prod ; si besoin de >5 min, déclencher via worker BullMQ.
export const maxDuration = 300;

export async function GET() {
  const r = await bulkRegenerateEmptyGrilles();
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

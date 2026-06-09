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
// Pas de timeout strict côté Vercel/Next — on attend que tous tournent
export const maxDuration = 600; // 10 min max

export async function GET() {
  const r = await bulkRegenerateEmptyGrilles();
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

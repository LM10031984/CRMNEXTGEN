/**
 * Endpoint DEV pour régénérer une grille d'observation et retourner
 * directement le PDF dans le navigateur. À utiliser pour valider visuellement
 * le nouveau prompt Ollama avant le batch de régénération.
 *
 * Usage : GET /api/dev/regenerate-grille/<participantId>
 */

import { NextResponse } from 'next/server';
import { regenerateGrilleForParticipant } from '@/server/actions/regenerate-grille';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const { participantId } = await params;
  const r = await regenerateGrilleForParticipant(participantId);
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: 400 });
  }
  // Redirige vers l'URL d'asset pour ouvrir directement le PDF
  return NextResponse.redirect(
    new URL(`/api/pedagogical-assets/${r.assetId}`, _req.url),
    { status: 303 },
  );
}

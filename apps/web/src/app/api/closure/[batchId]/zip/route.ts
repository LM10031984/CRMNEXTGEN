/**
 * Endpoint zip download du pack fin de formation.
 *
 * Stream le buffer construit par buildClosureZipBuffer (server action),
 * filename : `pack-fin-formation_<sessionCode>_<YYYYMMDD>.zip`.
 */

import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { buildClosureZipBuffer } from '@/server/actions/closure-pack';

export async function GET(
  _req: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  // Defense in depth : on vérifie l'auth explicitement même si la server
  // action le refait derrière. Évite que le zip soit servable si quelqu'un
  // refactor un jour la server action sans réaliser que c'est elle qui
  // protège l'endpoint.
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { batchId } = await context.params;
  const r = await buildClosureZipBuffer(batchId);
  if (!r.ok || !r.buffer || !r.filename) {
    // Message générique : ne pas leaker la cause exacte (RGPD, anti-énumération)
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[closure/zip] batch ${batchId} indisponible :`, r.error);
    }
    return new NextResponse('Zip indisponible', { status: 400 });
  }
  // Buffer extends Uint8Array — Next.js types acceptent Uint8Array comme BodyInit
  return new NextResponse(new Uint8Array(r.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${r.filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}

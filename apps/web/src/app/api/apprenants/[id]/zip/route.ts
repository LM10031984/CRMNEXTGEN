/**
 * Téléchargement de TOUS les documents d'un apprenant en une archive.
 *
 * Symétrique de `/api/closure/[batchId]/zip` (pack fin de formation), mais
 * ancré sur la personne : toutes ses sessions, rangées par code de session.
 */

import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { buildLearnerDocsZip } from '@/server/actions/learner-docs-zip';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  // Defense in depth : l'action revérifie derrière, mais on refuse au plus tôt.
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await context.params;
  const r = await buildLearnerDocsZip(id);
  if (!r.ok || !r.buffer || !r.filename) {
    // Message générique côté client (anti-énumération), cause en dev seulement.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[apprenants/${id}/zip] indisponible :`, r.error);
    }
    return new NextResponse(r.error ?? 'Archive indisponible', { status: 400 });
  }

  return new NextResponse(new Uint8Array(r.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${r.filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}

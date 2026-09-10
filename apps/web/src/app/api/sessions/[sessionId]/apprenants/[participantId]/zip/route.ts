/**
 * Le dossier d'UN inscrit, pour UNE session, sur UNE phase, en une archive.
 *
 * `?phase=avant|pendant|apres` — absent ou inconnu = dossier complet, rangé en
 * sous-dossiers par phase. Le `sessionId` de l'URL n'est pas décoratif : il est
 * vérifié contre l'inscription, pour qu'un lien recopié d'une session à l'autre
 * ne serve jamais le dossier de quelqu'un d'autre.
 */

import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { prisma } from '@qualiof/db';
import { coercePhase } from '@/lib/docs/doc-phase';
import { buildSessionLearnerZip } from '@/server/actions/session-learner-zip';

export async function GET(
  req: Request,
  context: { params: Promise<{ sessionId: string; participantId: string }> },
) {
  // Defense in depth : l'action revérifie derrière, mais on refuse au plus tôt.
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { sessionId, participantId } = await context.params;
  const phase = coercePhase(new URL(req.url).searchParams.get('phase'));

  // L'inscription doit bien appartenir à CETTE session ET à ce tenant.
  const rattachement = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, sessionId, session: { tenantId: user.tenantId } },
    select: { id: true },
  });
  if (!rattachement) return new NextResponse('Not found', { status: 404 });

  const r = await buildSessionLearnerZip(participantId, phase);
  if (!r.ok || !r.buffer || !r.filename) {
    // Message générique côté client (anti-énumération), cause en dev seulement.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[sessions/${sessionId}/apprenants/${participantId}/zip] :`, r.error);
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

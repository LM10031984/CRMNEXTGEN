/**
 * Endpoint stream PDF pour les PedagogicalAsset (QCM, grille
 * d'observation, analyse besoin, déroulé pédagogique, compétences).
 *
 * Symétrique de `/api/documents/[id]` mais sur la table PedagogicalAsset.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, createSignedDownloadUrl, DOCS_BUCKET, _internals } from '@/lib/storage';
import { buildDownloadFilename, extFromStorageKey } from '@/lib/docs/download-filename';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await context.params;

  const asset = await prisma.pedagogicalAsset.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { session: { select: { code: true } } },
  });
  if (!asset) return new NextResponse('Not found', { status: 404 });
  if (!asset.pdfUrl) return new NextResponse('PDF non encore généré', { status: 404 });

  // `participantId` est optionnel sur PedagogicalAsset (un QCM est par
  // participant, un déroulé est de niveau session) → on ne charge la personne
  // que quand elle existe, sinon le nom se limite au type + code de session.
  const participant = asset.participantId
    ? await prisma.sessionParticipant.findUnique({
        where: { id: asset.participantId },
        select: { person: { select: { firstName: true, lastName: true } } },
      })
    : null;

  const filename = buildDownloadFilename({
    docType: asset.kind,
    firstName: participant?.person.firstName,
    lastName: participant?.person.lastName,
    sessionCode: asset.session.code,
    ext: extFromStorageKey(asset.pdfUrl),
  });

  try {
    // Prod Supabase : redirect 302 vers une signed URL FRAÎCHE (TTL 600s, régénérée
    // à chaque hit = préserve le no-store) — contourne le cap 4,5 Mo réponse Vercel.
    if (_internals.PROVIDER === 'supabase') {
      const url = await createSignedDownloadUrl(DOCS_BUCKET, asset.pdfUrl, 600, filename);
      return NextResponse.redirect(url, 302);
    }
    // MinIO local : proxy inchangé.
    const buffer = await downloadFile(DOCS_BUCKET, asset.pdfUrl);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        // no-store : un doc régénéré garde le MÊME id/URL. Avec un cache navigateur
        // (avant : max-age=3600), l'ancienne version était resservie jusqu'à 1h après
        // régénération (« je revois l'ancienne version », Laurent 2026-07-01).
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (e: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[pedagogical-assets/${id}] read error :`, e);
    }
    return new NextResponse('Document indisponible', { status: 500 });
  }
}

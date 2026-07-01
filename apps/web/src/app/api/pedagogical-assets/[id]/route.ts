/**
 * Endpoint stream PDF pour les PedagogicalAsset (QCM, grille
 * d'observation, analyse besoin, déroulé pédagogique, compétences).
 *
 * Symétrique de `/api/documents/[id]` mais sur la table PedagogicalAsset.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await context.params;

  const asset = await prisma.pedagogicalAsset.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!asset) return new NextResponse('Not found', { status: 404 });
  if (!asset.pdfUrl) return new NextResponse('PDF non encore généré', { status: 404 });

  try {
    const buffer = await downloadFile(DOCS_BUCKET, asset.pdfUrl);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${asset.kind.toLowerCase()}-${asset.id.slice(0, 8)}.pdf"`,
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

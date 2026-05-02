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
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Error reading file: ${msg}`, { status: 500 });
  }
}

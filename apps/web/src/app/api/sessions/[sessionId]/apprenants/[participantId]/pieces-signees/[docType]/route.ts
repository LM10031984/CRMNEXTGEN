import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { manualSignedKey } from '@/lib/opco/manual-signed-key';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';

export async function GET(
  _req: Request,
  context: { params: { sessionId: string; participantId: string; docType: string } },
) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { sessionId, participantId, docType } = context.params;
  if (!['CONVENTION', 'AGEFICE', 'EMARGEMENT', 'ASSIDUITE'].includes(docType))
    return new NextResponse('Not found', { status: 404 });
  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, sessionId, session: { tenantId: user.tenantId } },
    select: { docStatus: true },
  });
  if (!participant) return new NextResponse('Not found', { status: 404 });
  const doc = await prisma.document.findFirst({
    where: {
      tenantId: user.tenantId,
      sessionId,
      participantId,
      type: docType as 'CONVENTION' | 'AGEFICE' | 'EMARGEMENT' | 'ASSIDUITE',
    },
    orderBy: { createdAt: 'desc' },
    select: { signedPdfUrl: true, createdAt: true },
  });
  const key =
    doc?.signedPdfUrl?.trim() || manualSignedKey(participant.docStatus, docType, doc?.createdAt);
  if (!key) return new NextResponse('Pièce signée absente', { status: 404 });
  try {
    const file = await downloadFile(DOCS_BUCKET, key);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${docType}-signe.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Document indisponible', { status: 503 });
  }
}

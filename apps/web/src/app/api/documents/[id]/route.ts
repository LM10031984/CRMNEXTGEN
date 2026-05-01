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

  const doc = await prisma.document.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!doc) return new NextResponse('Not found', { status: 404 });

  try {
    const buffer = await downloadFile(DOCS_BUCKET, doc.pdfUrl);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.type.toLowerCase()}-${doc.id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: any) {
    return new NextResponse(`Error reading file: ${e?.message ?? e}`, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await context.params;

  const invoice = await prisma.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!invoice || !invoice.pdfUrl) return new NextResponse('Not found', { status: 404 });

  try {
    const buffer = await downloadFile(DOCS_BUCKET, invoice.pdfUrl);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.number}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: any) {
    return new NextResponse(`Error: ${e?.message ?? e}`, { status: 500 });
  }
}

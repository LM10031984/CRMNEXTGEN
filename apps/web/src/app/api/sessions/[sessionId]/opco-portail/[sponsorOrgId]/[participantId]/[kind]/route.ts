import { NextResponse } from 'next/server';
import { requireRole, ForbiddenError, UnauthorizedError } from '@/lib/rbac';
import { resolveCompanyPortalPiece } from '@/lib/opco/company-portal-documents';
import { createSignedDownloadUrl, DOCS_BUCKET, downloadFile, _internals } from '@/lib/storage';

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      sessionId: string;
      sponsorOrgId: string;
      participantId: string;
      kind: string;
    }>;
  },
) {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return new NextResponse('Unauthorized', { status: 401 });
    if (error instanceof ForbiddenError) return new NextResponse('Forbidden', { status: 403 });
    throw error;
  }
  const params = await context.params;
  const piece = await resolveCompanyPortalPiece({ ...params, user });
  if (!piece) return new NextResponse('Not found', { status: 404 });
  const download = new URL(request.url).searchParams.get('dl') === '1';
  try {
    if (_internals.PROVIDER === 'supabase') {
      const url = await createSignedDownloadUrl(
        DOCS_BUCKET,
        piece.key,
        600,
        download ? piece.filename : undefined,
      );
      return NextResponse.redirect(url, 302);
    }
    const buffer = await downloadFile(DOCS_BUCKET, piece.key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${piece.filename.replace(/["\r\n]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new NextResponse('Document indisponible', { status: 500 });
  }
}

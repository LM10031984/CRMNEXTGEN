import { NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { getOpcoSubmission, type SubmissionAttachment } from '@/server/actions/opco-submission';
import { DOCS_BUCKET, downloadFile, createSignedDownloadUrl, _internals } from '@/lib/storage';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE'].includes(user.role))
    return new NextResponse('Forbidden', { status: 403 });
  const { id } = await params;
  const sub = await getOpcoSubmission(id);
  if (!sub) return new NextResponse('Not found', { status: 404 });
  const query = new URL(req.url).searchParams;
  const piece = (sub.attachments as unknown as SubmissionAttachment[]).find(
    (a) => a.kind === query.get('kind') && a.filename === query.get('filename'),
  );
  if (!piece?.key) return new NextResponse('Not found', { status: 404 });
  try {
    if (_internals.PROVIDER === 'supabase') {
      const url = await createSignedDownloadUrl(DOCS_BUCKET, piece.key, 300);
      const response = NextResponse.redirect(url, 302);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    const buffer = await downloadFile(DOCS_BUCKET, piece.key);
    const ext = piece.key.split('.').at(-1)?.toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          ext === 'png'
            ? 'image/png'
            : ['jpg', 'jpeg'].includes(ext ?? '')
              ? 'image/jpeg'
              : 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(piece.filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Pièce indisponible', { status: 404 });
  }
}

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

  const doc = await prisma.document.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      participant: { select: { person: { select: { firstName: true, lastName: true } } } },
      session: { select: { code: true } },
    },
  });
  if (!doc) return new NextResponse('Not found', { status: 404 });

  // Nom parlant plutôt que « certificat_realisation-9f136578.pdf » (Laurent
  // 2026-09-08) → « Certificat-de-realisation-Stephane-ROUSSEAU-SES-0110.pdf ».
  const filename = buildDownloadFilename({
    docType: doc.type,
    firstName: doc.participant?.person.firstName,
    lastName: doc.participant?.person.lastName,
    sessionCode: doc.session?.code,
    ext: extFromStorageKey(doc.pdfUrl),
  });

  try {
    // Prod Supabase : redirect 302 vers une signed URL FRAÎCHE (TTL 600s, régénérée
    // à chaque hit = préserve le no-store) — contourne le cap 4,5 Mo réponse Vercel.
    if (_internals.PROVIDER === 'supabase') {
      const url = await createSignedDownloadUrl(DOCS_BUCKET, doc.pdfUrl, 600, filename);
      return NextResponse.redirect(url, 302);
    }
    // MinIO local : proxy inchangé (createSignedDownloadUrl throw sur MinIO).
    const buffer = await downloadFile(DOCS_BUCKET, doc.pdfUrl);
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
      console.warn(`[documents/${id}] read error :`, e);
    }
    return new NextResponse('Document indisponible', { status: 500 });
  }
}

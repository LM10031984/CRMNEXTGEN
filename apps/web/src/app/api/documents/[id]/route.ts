import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, createSignedDownloadUrl, DOCS_BUCKET, _internals } from '@/lib/storage';
import { resolveServedDocumentKey } from '@/lib/document-served-key';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await context.params;

  const doc = await prisma.document.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!doc) return new NextResponse('Not found', { status: 404 });

  // Règle métier n°2 (spec signature 2026-09-04 §4.2) : le PDF signé fait foi.
  // `?original=1` sert quand même le non signé (re-génération, renvoi pour
  // signature). Sans ça, un document signé — scan d'émargement du lot A ou
  // retour DocuSeal du lot C — s'ouvrirait encore vierge depuis la matrice.
  const original = new URL(req.url).searchParams.get('original') === '1';
  const served = resolveServedDocumentKey(doc, { original });

  try {
    // Prod Supabase : redirect 302 vers une signed URL FRAÎCHE (TTL 600s, régénérée
    // à chaque hit = préserve le no-store) — contourne le cap 4,5 Mo réponse Vercel.
    if (_internals.PROVIDER === 'supabase') {
      const url = await createSignedDownloadUrl(DOCS_BUCKET, served.key, 600);
      return NextResponse.redirect(url, 302);
    }
    // MinIO local : proxy inchangé (createSignedDownloadUrl throw sur MinIO).
    const buffer = await downloadFile(DOCS_BUCKET, served.key);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.type.toLowerCase()}-${doc.id.slice(0, 8)}${served.suffix}.pdf"`,
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

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, createSignedDownloadUrl, DOCS_BUCKET, _internals } from '@/lib/storage';
import { resolveServedDocumentKey } from '@/lib/document-served-key';
import { buildDownloadFilename, extFromStorageKey } from '@/lib/docs/download-filename';

export async function GET(
  req: Request,
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

  // Règle métier n°2 (spec signature 2026-09-04 §4.2) : le PDF signé fait foi.
  // `?original=1` sert quand même le non signé (re-génération, renvoi pour
  // signature). Sans ça, un document signé — scan d'émargement du lot A ou
  // retour DocuSeal du lot C — s'ouvrirait encore vierge depuis la matrice.
  const original = new URL(req.url).searchParams.get('original') === '1';
  const served = resolveServedDocumentKey(doc, { original });

  // Nom parlant plutôt que « certificat_realisation-9f136578.pdf » (Laurent
  // 2026-09-08) → « Certificat-de-realisation-Stephane-ROUSSEAU-SES-0110.pdf ».
  // L'extension se déduit de la clé RÉELLEMENT servie : un scan signé déposé en
  // lot A peut être un .jpg là où l'original est un .pdf.
  const filename = buildDownloadFilename({
    docType: doc.type,
    firstName: doc.participant?.person.firstName,
    lastName: doc.participant?.person.lastName,
    sessionCode: doc.session?.code,
    ext: extFromStorageKey(served.key),
    // Distingue la version signée de l'originale dans le dossier de
    // téléchargement — les deux se retrouvent côte à côte chez l'admin.
    suffix: served.isSigned ? 'signe' : null,
  });

  // `?dl=1` — téléchargement explicite (nom parlant, pièce jointe). Sans le
  // paramètre, la route reste en consultation : le PDF s'ouvre dans un onglet,
  // comme avant. La distinction compte : l'option `download` de Supabase force
  // `Content-Disposition: attachment`, donc l'appliquer partout ferait
  // télécharger un document que l'utilisateur voulait seulement regarder.
  const wantsDownload = new URL(req.url).searchParams.get('dl') === '1';

  try {
    // Prod Supabase : redirect 302 vers une signed URL FRAÎCHE (TTL 600s, régénérée
    // à chaque hit = préserve le no-store) — contourne le cap 4,5 Mo réponse Vercel.
    if (_internals.PROVIDER === 'supabase') {
      const url = await createSignedDownloadUrl(
        DOCS_BUCKET,
        served.key,
        600,
        wantsDownload ? filename : undefined,
      );
      return NextResponse.redirect(url, 302);
    }
    // MinIO local : proxy inchangé (createSignedDownloadUrl throw sur MinIO).
    const buffer = await downloadFile(DOCS_BUCKET, served.key);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${wantsDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
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

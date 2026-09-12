/**
 * Le CERTIFICAT DE SIGNATURE d'une demande — lot D, défaut D-C3-5.
 *
 * POURQUOI UNE ROUTE À PART DE `/api/documents/[id]`. Le certificat appartient
 * à la DEMANDE, pas au document : une demande peut couvrir plusieurs pièces, et
 * le certificat les couvre toutes. L'accrocher à un document obligerait à
 * choisir lequel, et servirait le même fichier sous deux noms — pour une pièce
 * qu'un financeur classe à côté du PDF signé, c'est exactement l'ambiguïté à
 * éviter.
 *
 * Décalquée de `/api/documents/[id]` pour tout le reste, et volontairement :
 * même auth, même scope tenant, même redirection Supabase / proxy MinIO, même
 * `?dl=1`, même `no-store`. Une seconde manière de servir un PDF finirait par
 * diverger de la première.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, createSignedDownloadUrl, DOCS_BUCKET, _internals } from '@/lib/storage';
import { nomFichierCertificat } from '@/lib/signature/certificat-signature';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await context.params;

  // ⚠ `findFirst` SCOPÉ, jamais `findUnique` sur l'id seul : la demande d'un
  // autre organisme doit être un 404 indiscernable d'un id inexistant.
  const demande = await prisma.signatureRequest.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      auditTrailUrl: true,
      session: { select: { code: true } },
      documents: {
        select: {
          type: true,
          participant: { select: { person: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!demande) return new NextResponse('Not found', { status: 404 });

  // Une demande PARTIE n'a pas encore de certificat : il n'est produit qu'à
  // `submission.completed`. 404 plutôt qu'une erreur : il n'y a rien à servir,
  // et l'écran ne propose d'ailleurs le lien qu'une fois la pièce signée.
  const cle = (demande.auditTrailUrl ?? '').trim();
  if (cle.length === 0) return new NextResponse('Not found', { status: 404 });

  // Le nom parlant se calcule sur la PREMIÈRE pièce de la demande : elle porte
  // la personne quand la demande est nominative, et personne quand elle est
  // collective (convention de groupe) — ce qui est la bonne chose à dire.
  const piece = demande.documents[0] ?? null;
  const personne = piece?.participant?.person ?? null;
  const filename = nomFichierCertificat({
    // La PIÈCE couverte : un dossier AGEFICE porte deux demandes, donc deux
    // certificats, qui sortiraient sinon sous le même nom.
    docType: piece?.type,
    firstName: personne?.firstName,
    lastName: personne?.lastName,
    sessionCode: demande.session?.code,
  });

  // `?dl=1` — téléchargement explicite. Sans le paramètre, le certificat
  // s'ouvre dans un onglet : l'option `download` de Supabase force
  // `Content-Disposition: attachment`, donc l'appliquer toujours ferait
  // télécharger un fichier que l'admin voulait seulement regarder.
  const wantsDownload = new URL(req.url).searchParams.get('dl') === '1';

  try {
    if (_internals.PROVIDER === 'supabase') {
      // Le nom DOIT voyager dans la signature : la redirection 302 fait perdre
      // tout `Content-Disposition` posé ici (leçon du 08/09/2026).
      const url = await createSignedDownloadUrl(
        DOCS_BUCKET,
        cle,
        600,
        wantsDownload ? filename : undefined,
      );
      return NextResponse.redirect(url, 302);
    }
    const buffer = await downloadFile(DOCS_BUCKET, cle);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${wantsDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (e: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[signature-requests/${id}/audit-trail] read error :`, e);
    }
    return new NextResponse('Certificat indisponible', { status: 500 });
  }
}

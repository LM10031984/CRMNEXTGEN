import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, createSignedDownloadUrl, DOCS_BUCKET, _internals } from '@/lib/storage';

const KIND_TO_LABEL: Record<string, string> = {
  cni: 'cni',
  rib: 'rib',
  cfp: 'cfp',
};

function inferContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; kind: string }> },
) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id, kind } = await context.params;
  if (!KIND_TO_LABEL[kind]) return new NextResponse('Bad kind', { status: 400 });

  const person = await prisma.person.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      ribKey: true,
      sensitiveData: { select: { idDocumentUrl: true } },
      legalLinks: {
        where: { role: 'EI_SELF' },
        orderBy: { isPrimary: 'desc' },
        select: {
          organization: {
            select: {
              ageficeProfile: { select: { cfpAttestationKey: true } },
            },
          },
        },
        take: 1,
      },
    },
  });
  if (!person) return new NextResponse('Not found', { status: 404 });

  let key: string | null = null;
  if (kind === 'cni') key = person.sensitiveData?.idDocumentUrl ?? null;
  else if (kind === 'rib') key = person.ribKey ?? null;
  else if (kind === 'cfp')
    key =
      person.legalLinks[0]?.organization.ageficeProfile?.cfpAttestationKey ?? null;

  if (!key) return new NextResponse('Document non disponible', { status: 404 });

  try {
    // Prod Supabase : redirect 302 vers une signed URL FRAÎCHE (TTL 600s) —
    // contourne le cap 4,5 Mo réponse Vercel sur les scans CNI/RIB/CFP.
    if (_internals.PROVIDER === 'supabase') {
      const url = await createSignedDownloadUrl(DOCS_BUCKET, key, 600);
      return NextResponse.redirect(url, 302);
    }
    // MinIO local : proxy inchangé.
    const buffer = await downloadFile(DOCS_BUCKET, key);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': inferContentType(key),
        'Content-Disposition': `inline; filename="${KIND_TO_LABEL[kind]}-${id.slice(0, 8)}.${key.split('.').pop() ?? 'bin'}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[apprenants/${id}/docs/${kind}] read error :`, e);
    }
    return new NextResponse('Document indisponible', { status: 500 });
  }
}

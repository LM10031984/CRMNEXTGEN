/**
 * Téléchargement sécurisé des pièces de pré-inscription (CNI / RIB / CFP).
 *
 * Plan A (Mai 2026) — comble le gap admin : la collecte stocke les fichiers
 * dans MinIO (bucket `preinscriptions`) mais aucun endpoint ne les exposait
 * au PDG / commerciaux. Cette route génère une URL pré-signée S3 (TTL 5 min)
 * et redirige le navigateur dessus → téléchargement direct, le serveur Next
 * ne stream pas le fichier.
 *
 * Contrôles :
 *  - validateRequest : utilisateur authentifié
 *  - rôle ∈ {ADMIN, MANAGER, COMMERCIAL} (les seuls censés voir les pièces)
 *  - tenantId du PreEnrollment === tenantId de l'utilisateur (anti-fuite cross-tenant)
 *  - kind ∈ {cni, rib, cfp}
 *  - clé présente sur le PreEnrollment (sinon 404)
 *  - AuditLog systématique (action='preenrollment.file.accessed') pour la
 *    traçabilité Qualiopi.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { PREENROLLMENT_BUCKET, getFileSignedUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const KIND_TO_FIELD = {
  cni: 'cniKey',
  rib: 'ribKey',
  cfp: 'cfpKey',
  signature: 'signatureKey',
} as const;
type Kind = keyof typeof KIND_TO_FIELD;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!hasRole(user, ['ADMIN', 'MANAGER', 'COMMERCIAL'])) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { id, kind: kindParam } = await params;
  if (!(kindParam in KIND_TO_FIELD)) {
    return new NextResponse('Invalid kind', { status: 400 });
  }
  const kind = kindParam as Kind;

  const pe = await prisma.preEnrollment.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true, tenantId: true,
      cniKey: true, ribKey: true, cfpKey: true, signatureKey: true,
      lastName: true, firstName: true,
    },
  });
  if (!pe) return new NextResponse('Not found', { status: 404 });

  const key = pe[KIND_TO_FIELD[kind]];
  if (!key) return new NextResponse('Pièce absente', { status: 404 });

  // ?inline=1 → preview inline (omettre Content-Disposition attachment), sinon download forcé
  const inline = req.nextUrl.searchParams.get('inline') === '1';
  const ext = key.split('.').pop()?.toLowerCase() ?? 'pdf';
  const safeName = `${kind.toUpperCase()}_${pe.lastName ?? 'inconnu'}_${pe.firstName ?? ''}`
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_');
  const downloadFilename = `${safeName}.${ext}`;

  const url = await getFileSignedUrl(PREENROLLMENT_BUCKET, key, {
    expiresIn: 300,
    downloadFilename: inline ? undefined : downloadFilename,
  });

  // AuditLog (best-effort — ne bloque pas le download si l'écriture échoue).
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'PreEnrollment',
        entityId: pe.id,
        action: 'preenrollment.file.accessed',
        diff: { kind, key } as never,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      },
    });
  } catch {
    // Logging best-effort — ne pas bloquer le PDG sur un AuditLog cassé.
  }

  return NextResponse.redirect(url, { status: 302 });
}

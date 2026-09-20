'use server';
import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { isCompanyDossier } from '@/lib/opco/company-dossier';
import { groupConventionAnyShapeWhere, groupConventionWhere } from '@/lib/docs/convention-coverage';

export async function uploadGroupConvention(
  data: FormData,
): Promise<{ ok: boolean; error?: string; covered?: number }> {
  const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  const sessionId = String(data.get('sessionId') ?? '');
  const sponsorOrgId = String(data.get('sponsorOrgId') ?? '');
  const file = data.get('file');
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024)
    return { ok: false, error: 'Choisissez la convention signée au format PDF (3 Mo maximum).' };
  const participants = await prisma.sessionParticipant.findMany({
    where: {
      sessionId,
      sponsorOrgId,
      enrollmentStatus: { not: 'CANCELLED' },
      session: { tenantId: user.tenantId },
    },
    include: { session: true, person: { include: { legalLinks: true } } },
  });
  if (!participants.length || participants.some((p) => !isCompanyDossier(p)))
    return {
      ok: false,
      error: 'Cette entreprise n’a pas de groupe salarié éligible dans cette session.',
    };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString() !== '%PDF-')
    return { ok: false, error: 'Le fichier doit être un PDF.' };
  const hashSha256 = createHash('sha256').update(buffer).digest('hex');
  const key = `sessions/${user.tenantId}/${sessionId}/signed/convention-entreprise-${sponsorOrgId}-${randomUUID()}.pdf`;
  const pendingWhere = {
    ...groupConventionAnyShapeWhere(user.tenantId, sessionId, sponsorOrgId),
    signatureRequest: {
      status: { in: ['SENT', 'PARTIALLY_SIGNED'] as ('SENT' | 'PARTIALLY_SIGNED')[] },
    },
  };
  if (await prisma.document.findFirst({ where: pendingWhere, select: { id: true } }))
    return {
      ok: false,
      error:
        'Une convention est en cours de signature DocuSeal. Terminez ou annulez cet envoi dans le bloc Signature avant de déposer le scan commun.',
    };
  await uploadFile(DOCS_BUCKET, key, buffer, 'application/pdf');
  const saved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.tenantId + ':convention:' + sessionId + ':' + sponsorOrgId}))`;
    if (await tx.document.findFirst({ where: pendingWhere, select: { id: true } })) return false;
    const existing = await tx.document.findFirst({
      where: groupConventionWhere(user.tenantId, sessionId, sponsorOrgId),
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.hashSha256 === hashSha256 && existing.signedPdfUrl) return true;
    const doc = await tx.document.create({
      data: {
        ...groupConventionWhere(user.tenantId, sessionId, sponsorOrgId),
        participantId: null,
        pdfUrl: key,
        signedPdfUrl: key,
        hashSha256,
        signedAt: new Date(),
        signatureKind: 'MANUAL_SCAN',
        status: 'signed',
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'Document',
        entityId: doc.id,
        action: 'convention.group_scan_uploaded',
        diff: { sponsorOrgId, sessionId, coveredParticipantIds: participants.map((p) => p.id) },
      },
    });
    return true;
  });
  if (!saved) return { ok: false, error: 'Un envoi DocuSeal a commencé. Rechargez la session.' };
  revalidatePath(`/app/sessions/${sessionId}`);
  revalidatePath('/app/dossiers-opco', 'layout');
  return { ok: true, covered: participants.length };
}

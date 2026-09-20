'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { buildOpcoSubmission } from '@/lib/opco/build-submission';
import { refreshOpcoSubmissionDraft } from './opco-submission';

/** Le dossier choisit les propriétaires ; aucun personId/orgId fourni par le navigateur. */
export async function uploadOpcoPiece(data: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE']);
  const id = String(data.get('submissionId') ?? '');
  const kind = String(data.get('kind') ?? '');
  const file = data.get('file');
  if (!['CNI', 'RIB', 'CFP_ATTESTATION'].includes(kind))
    return { ok: false, error: 'Pièce invalide.' };
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024)
    return { ok: false, error: 'Choisissez un PDF, JPG ou PNG de 3 Mo maximum.' };
  const sub = await prisma.opcoSubmission.findFirst({
    where: { id, tenantId: user.tenantId, status: 'DRAFT', deliveryState: 'READY' },
  });
  if (!sub) return { ok: false, error: 'Brouillon indisponible ou envoi en cours.' };
  const built = await buildOpcoSubmission(
    sub.participantId,
    user,
    sub.stage === 'FIN_FORMATION' ? 'FIN_FORMATION' : 'PRISE_EN_CHARGE',
  );
  if (!built.ok) return built;
  if (!built.agefice || (sub.stage === 'FIN_FORMATION' && kind !== 'RIB'))
    return { ok: false, error: 'Cette pièce n’est pas attendue pour ce dossier.' };
  if (kind === 'CFP_ATTESTATION' && !built.profileId)
    return {
      ok: false,
      error: 'Renseignez le rattachement AGEFICE de l’apprenant avant de déposer la CFP.',
    };
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext =
    buffer.subarray(0, 5).toString() === '%PDF-'
      ? 'pdf'
      : buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        ? 'jpg'
        : buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'png'
          : null;
  if (!ext) return { ok: false, error: 'Format non reconnu : utilisez un PDF, JPG ou PNG.' };
  const personId = built.participant.personId;
  const key = `apprenants/${user.tenantId}/${personId}/${kind.toLowerCase()}-${randomUUID()}.${ext}`;
  await uploadFile(
    DOCS_BUCKET,
    key,
    buffer,
    ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  );
  const saved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.tenantId + ':' + sub.participantId + ':' + sub.stage}))`;
    const editable = await tx.opcoSubmission.findFirst({
      where: { id, tenantId: user.tenantId, status: 'DRAFT', deliveryState: 'READY' },
    });
    if (!editable) return false;
    if (kind === 'CNI')
      await tx.sensitiveData.upsert({
        where: { personId },
        create: { personId, idDocumentUrl: key },
        update: { idDocumentUrl: key },
      });
    else if (kind === 'RIB')
      await tx.person.update({ where: { id: personId }, data: { ribKey: key } });
    else
      await tx.ageficeProfile.update({
        where: { id: built.profileId! },
        data: { cfpAttestationKey: key },
      });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'OpcoSubmission',
        entityId: id,
        action: 'opco.piece_uploaded',
        diff: { kind, personId, profileId: kind === 'CFP_ATTESTATION' ? built.profileId : null },
      },
    });
    return true;
  });
  if (!saved) return { ok: false, error: 'Le dossier est en cours d’envoi. Rechargez la page.' };
  revalidatePath(`/app/apprenants/${personId}`);
  revalidatePath(`/app/organisations/${built.participant.sponsorOrgId}`);
  const refreshed = await refreshOpcoSubmissionDraft(id);
  return refreshed.ok
    ? { ok: true }
    : {
        ok: false,
        error:
          'Pièce enregistrée sur la fiche. Cliquez sur « Actualiser les pièces » pour mettre à jour le dossier.',
      };
}

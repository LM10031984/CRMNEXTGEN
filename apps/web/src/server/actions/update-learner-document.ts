'use server';

/**
 * Re-upload / upload différé d'un document d'identité depuis la fiche apprenant.
 * Permet à un admin/manager/commercial d'ajouter ou remplacer CNI, RIB ou
 * attestation URSSAF/CFP après la création de l'apprenant — sans repasser par
 * le wizard.
 *
 * Persistence selon kind :
 *   - cni → SensitiveData.idDocumentUrl (upsert 1:1 avec Person)
 *   - rib → Person.ribKey
 *   - cfp → AgeficeProfile.cfpAttestationKey (sur l'org EI_SELF de la person)
 *
 * Pas de suppression du fichier MinIO précédent (audit + restore possible).
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';

export type LearnerDocKind = 'cni' | 'rib' | 'cfp';

const MAX_FILE_SIZE_MB = 10;
const KIND_LABEL: Record<LearnerDocKind, string> = {
  cni: "pièce d'identité",
  rib: 'RIB',
  cfp: 'attestation URSSAF / CFP',
};

function safeExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'bin';
  return /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
}

function guessContentType(name: string, fallback?: string): string {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  const ext = safeExt(name);
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

export async function updateLearnerDocument(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);

  const personId = String(formData.get('personId') ?? '');
  const kind = String(formData.get('kind') ?? '') as LearnerDocKind;
  const file = formData.get('file');

  if (!personId) return { ok: false, error: 'personId manquant' };
  if (!['cni', 'rib', 'cfp'].includes(kind)) {
    return { ok: false, error: 'Type de document invalide' };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Aucun fichier reçu' };
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { ok: false, error: `Fichier > ${MAX_FILE_SIZE_MB} Mo` };
  }

  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId: user.tenantId },
    select: {
      id: true,
      legalLinks: {
        where: { role: 'EI_SELF' },
        select: { organizationId: true },
      },
    },
  });
  if (!person) return { ok: false, error: 'Apprenant introuvable' };

  if (kind === 'cfp' && person.legalLinks.length === 0) {
    return {
      ok: false,
      error:
        "L'apprenant n'a pas d'EI rattachée — impossible d'attacher une attestation URSSAF/CFP. Crée d'abord l'auto-entreprise.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `apprenants/${user.tenantId}/${personId}/${kind}-${randomUUID()}.${safeExt(file.name)}`;
  try {
    await uploadFile(DOCS_BUCKET, key, buffer, guessContentType(file.name, file.type));
  } catch (e: any) {
    return { ok: false, error: `Upload échoué : ${e?.message ?? e}` };
  }

  if (kind === 'cni') {
    await prisma.sensitiveData.upsert({
      where: { personId },
      create: { personId, idDocumentUrl: key },
      update: { idDocumentUrl: key },
    });
  } else if (kind === 'rib') {
    await prisma.person.update({ where: { id: personId }, data: { ribKey: key } });
  } else {
    const orgId = person.legalLinks[0]!.organizationId;
    await prisma.ageficeProfile.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, cfpAttestationKey: key, paFields: {} },
      update: { cfpAttestationKey: key },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: `learner-docs.${kind}.update`,
      entity: 'Person',
      entityId: personId,
      diff: { kind, label: KIND_LABEL[kind], objectKey: key },
    },
  });

  revalidatePath(`/app/apprenants/${personId}`);
  return { ok: true };
}

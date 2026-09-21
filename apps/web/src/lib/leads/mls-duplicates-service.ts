import { prisma, Prisma } from '@qualiof/db';
import { previewMlsDuplicates } from './mls-duplicates';

const include = {
  organization: { select: { legalName: true, brandName: true, network: true, archived: true } },
  _count: {
    select: {
      actions: true,
      diagnosticSubmissions: true,
      diagnostics: true,
      proposals: true,
      enrollmentBatches: true,
      tasks: true,
      comments: true,
    },
  },
} satisfies Prisma.LeadInclude;
export async function listMlsDuplicates(tenantId: string) {
  return previewMlsDuplicates(
    await prisma.lead.findMany({ where: { tenantId }, include, orderBy: { id: 'asc' } }),
  );
}
export class MlsDuplicateError extends Error {}
export async function mergeMlsDuplicate(input: {
  actor: { id: string; tenantId: string };
  keepId: string;
  removeId: string;
  digest: string;
}) {
  const { actor, keepId, removeId, digest } = input;
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mls:${actor.tenantId}`}))`;
      // Verrouille les parents : un ajout simultané d'activité/relation ne peut être supprimé en cascade.
      await tx.$queryRaw`SELECT id FROM "Lead" WHERE "tenantId" = ${actor.tenantId} AND id IN (${keepId}, ${removeId}) ORDER BY id FOR UPDATE`;
      const leads = await tx.lead.findMany({
        where: { tenantId: actor.tenantId },
        include,
        orderBy: { id: 'asc' },
      });
      const preview = previewMlsDuplicates(leads).find(
        (p) => p.keep.id === keepId && p.remove.id === removeId,
      );
      if (!preview || preview.digest !== digest)
        throw new MlsDuplicateError(
          'Les fiches ont changé ou ne sont plus fusionnables. Rechargez la prévisualisation.',
        );
      const keep = leads.find((l) => l.id === keepId)!;
      const remove = leads.find((l) => l.id === removeId)!;
      const data = {
        email: keep.email || remove.email,
        city: keep.city || remove.city,
        jobTitle: keep.jobTitle || remove.jobTitle,
        notes: preview.mergedNotes,
        segments: preview.mergedSegments,
        importData: {
          original: keep.importData,
          mergedSources: [
            { id: remove.id, importKey: remove.importKey, importData: remove.importData },
          ],
        } as Prisma.InputJsonValue,
      };
      await tx.lead.update({ where: { id: keepId }, data });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          entity: 'Lead',
          entityId: keepId,
          action: 'leads.merge.mls',
          diff: JSON.parse(
            JSON.stringify({
              before: { keep, remove },
              after: { ...keep, ...data },
              removedId: removeId,
            }),
          ) as Prisma.InputJsonValue,
        },
      });
      await tx.lead.delete({ where: { id: removeId } });
      return { keepId, removeId };
    },
    { isolationLevel: 'Serializable', maxWait: 15000, timeout: 60000 },
  );
}

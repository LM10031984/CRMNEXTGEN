import { randomUUID } from 'node:crypto';
import { prisma, Prisma } from '@qualiof/db';
import { parseMls } from './mls-import';
import { planMlsEnrichment } from './mls-enrichment';

export async function enrichMls({
  buffer,
  fileName,
  actor,
  expectedDigest,
}: {
  buffer: Buffer;
  fileName: string;
  actor: { id: string; tenantId: string };
  expectedDigest?: string;
}) {
  const parsed = parseMls(buffer);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mls:${actor.tenantId}`}))`;
      const [leads, agencies] = await Promise.all([
        tx.lead.findMany({
          where: { tenantId: actor.tenantId },
          select: {
            id: true,
            updatedAt: true,
            organizationId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            jobTitle: true,
            city: true,
            segments: true,
          },
          orderBy: { id: 'asc' },
        }),
        tx.organization.findMany({
          where: { tenantId: actor.tenantId },
          select: {
            id: true,
            updatedAt: true,
            legalName: true,
            brandName: true,
            network: true,
            address: true,
            crmManagers: true,
            archived: true,
          },
          orderBy: { id: 'asc' },
        }),
      ]);
      const plan = planMlsEnrichment(parsed, leads, agencies);
      const report = {
        fileName,
        fileHash: parsed.fileHash,
        digest: plan.digest,
        rowsRead: parsed.rowsRead,
        matched: plan.matched,
        leadsToUpdate: plan.updates.length,
        agenciesToUpdate: plan.organizations.length,
        agenciesToCreate: plan.newAgencies.length,
        updates: plan.updates,
        organizations: plan.organizations,
        newAgencies: plan.newAgencies,
        ignored: plan.ignored,
        issues: parsed.issues,
        updated: 0,
      };
      if (!expectedDigest) return report;
      if (expectedDigest !== plan.digest)
        throw new Error('La base ou le fichier a changé. Relancez la prévisualisation.');
      const created = new Map<string, string>();
      for (const agency of plan.newAgencies) {
        const id = randomUUID();
        created.set(agency.key, id);
        await tx.organization.create({
          data: {
            id,
            tenantId: actor.tenantId,
            legalName: agency.legalName,
            brandName: agency.legalName,
            legalForm: 'AUTRE',
            address: { city: agency.city },
            crmManagers: agency.crmManagers,
          },
        });
      }
      for (const change of plan.organizations) {
        const saved = await tx.organization.updateMany({
          where: {
            id: change.id,
            tenantId: actor.tenantId,
            updatedAt: new Date(change.updatedAt),
            archived: false,
          },
          data: change.after,
        });
        if (saved.count !== 1)
          throw new Error('Une agence a changé. Relancez la prévisualisation.');
      }
      for (const change of plan.updates) {
        const saved = await tx.lead.updateMany({
          where: { id: change.id, tenantId: actor.tenantId, updatedAt: new Date(change.updatedAt) },
          data: {
            ...change.after,
            ...(change.newAgencyKey ? { organizationId: created.get(change.newAgencyKey)! } : {}),
          },
        });
        if (saved.count !== 1) throw new Error('Une fiche a changé. Relancez la prévisualisation.');
      }
      if (plan.updates.length || plan.organizations.length)
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.id,
            entity: 'LeadImport',
            entityId: parsed.fileHash,
            action: 'leads.enrich.mls',
            diff: JSON.parse(
              JSON.stringify({
                ...report,
                updated: plan.updates.length,
                createdOrganizationIds: [...created.values()],
              }),
            ) as Prisma.InputJsonValue,
          },
        });
      return { ...report, updated: plan.updates.length };
    },
    { timeout: 120000, maxWait: 15000, isolationLevel: 'Serializable' },
  );
}

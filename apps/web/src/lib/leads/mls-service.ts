import { randomUUID } from 'node:crypto';
import { prisma, Prisma } from '@qualiof/db';
import { MLS_SOURCE, parseMls, planMls } from './mls-import';

export async function importMls({
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
      // Sérialise les imports d’un tenant (aucun envoi ou notification dans ce service).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mls:${actor.tenantId}`}))`;
      const [leads, agencies] = await Promise.all([
        tx.lead.findMany({
          where: { tenantId: actor.tenantId },
          select: {
            id: true,
            importKey: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        }),
        tx.organization.findMany({
          where: { tenantId: actor.tenantId },
          select: { id: true, legalName: true, address: true, archived: true },
        }),
      ]);
      const plan = planMls(parsed, leads, agencies);
      const report = {
        fileName,
        fileHash: parsed.fileHash,
        digest: plan.digest,
        rowsRead: parsed.rowsRead,
        withoutChannels: parsed.withoutChannels,
        duplicates: parsed.duplicates,
        invalidRows: parsed.issues.reduce((n, i) => n + i.refs.length, 0),
        issues: parsed.issues,
        ignored: plan.ignored,
        leadsToCreate: plan.create.length,
        agenciesToCreate: plan.newAgencies.length,
        preview: plan.create.slice(0, 10).map((c) => c.contact),
        created: 0,
      };
      if (!expectedDigest) return report;
      if (expectedDigest !== plan.digest)
        throw new Error('La base ou le fichier a changé. Relancez la prévisualisation.');
      const orgIds = new Map<string, string>();
      const organizations = plan.newAgencies.map((key) => {
        const rows = plan.create.filter((c) => c.contact.agencyKey === key).map((c) => c.contact);
        const first = rows[0]!;
        const id = randomUUID();
        orgIds.set(key, id);
        return {
          id,
          tenantId: actor.tenantId,
          legalName: first.agency,
          legalForm: 'AUTRE' as const,
          address: { city: first.city },
          crmManagers: [
            ...new Set(
              parsed.contacts
                .filter((c) => c.agencyKey === key && c.segments.includes('dirigeant'))
                .map((c) => `${c.firstName} ${c.lastName}`),
            ),
          ],
        };
      });
      if (organizations.length) await tx.organization.createMany({ data: organizations });
      const records = plan.create.map(({ contact: c, organizationId }) => ({
        id: randomUUID(),
        tenantId: actor.tenantId,
        organizationId: organizationId ?? orgIds.get(c.agencyKey)!,
        source: MLS_SOURCE,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email || null,
        phone: c.phone || null,
        jobTitle: c.jobTitle || null,
        city: c.city || null,
        segments: c.segments,
        importKey: c.key,
        importData: { fileName, fileHash: parsed.fileHash, refs: c.refs, importedBy: actor.id },
        nextAction: 'Planifier le premier appel MLS',
      }));
      for (let i = 0; i < records.length; i += 300)
        await tx.lead.createMany({ data: records.slice(i, i + 300) });
      const journalId = randomUUID();
      await tx.auditLog.create({
        data: {
          id: journalId,
          tenantId: actor.tenantId,
          userId: actor.id,
          entity: 'LeadImport',
          entityId: parsed.fileHash,
          action: 'leads.import.mls',
          diff: JSON.parse(
            JSON.stringify({
              ...report,
              created: records.length,
              createdIds: records.map((r) => r.id),
              organizationIds: organizations.map((o) => o.id),
            }),
          ) as Prisma.InputJsonValue,
        },
      });
      return { ...report, created: records.length, journalId };
    },
    { timeout: 120000, maxWait: 15000, isolationLevel: 'Serializable' },
  );
}

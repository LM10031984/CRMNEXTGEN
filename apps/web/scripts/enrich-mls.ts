/** Prévisualisation : node --env-file=<connexion> --import tsx scripts/enrich-mls.ts <xlsx> <admin-id> <rapport.json> [digest] */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { prisma } from '@qualiof/db';
import { enrichMls } from '../src/lib/leads/mls-enrichment-service';
const [file, actorId, reportFile, expectedDigest] = process.argv.slice(2);
try {
  if (!file || !actorId || !reportFile)
    throw new Error('Arguments : fichier.xlsx admin-id rapport.json [digest-prévisualisé]');
  const actor = await prisma.user.findFirst({
    where: { id: actorId, role: 'ADMIN', disabledAt: null },
    select: { id: true, tenantId: true },
  });
  if (!actor) throw new Error('Administrateur actif introuvable.');
  const report = await enrichMls({
    buffer: readFileSync(file),
    fileName: basename(file),
    actor,
    expectedDigest,
  });
  writeFileSync(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        digest: report.digest,
        matched: report.matched,
        leadsToUpdate: report.leadsToUpdate,
        agenciesToUpdate: report.agenciesToUpdate,
        agenciesToCreate: report.agenciesToCreate,
        updated: report.updated,
        ignored: report.ignored.length,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Rapprochement impossible');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

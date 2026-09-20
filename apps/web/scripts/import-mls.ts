/** node --env-file=<connexion> --import tsx scripts/import-mls.ts <fichier.xlsx> <admin-id> <rapport.json> [digest-prévisualisé] */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { prisma } from '@qualiof/db';
import { importMls } from '../src/lib/leads/mls-service';
const [file, actorId, reportFile, expectedDigest] = process.argv.slice(2);
try {
  if (!file || !actorId || !reportFile)
    throw new Error('Arguments : fichier.xlsx admin-id rapport.json [digest-prévisualisé]');
  const actor = await prisma.user.findFirst({
    where: { id: actorId, role: 'ADMIN', disabledAt: null },
    select: { id: true, tenantId: true },
  });
  if (!actor) throw new Error('Administrateur actif introuvable.');
  const report = await importMls({
    buffer: readFileSync(file),
    fileName: basename(file),
    actor,
    expectedDigest,
  });
  writeFileSync(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
  const { preview, issues, ignored, ...counts } = report;
  console.log(
    JSON.stringify({ ...counts, ignored: ignored.length, issueGroups: issues.length }, null, 2),
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Import impossible');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

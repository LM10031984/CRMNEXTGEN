/**
 * SES-0086 : génère la SATISFACTION À FROID des 29 (forcée, hors gate 90j) →
 * DB + MinIO + Drive, puis calcule les indicateurs de session :
 *   - nb stagiaires formés
 *   - taux de recommandation
 *   - note /5 + taux de satisfaction
 */
import fs from 'node:fs';
const { prisma } = await import('@qualiof/db');
const { processClosureJobPayload } = await import('../src/lib/closure/worker');
const { downloadFile, DOCS_BUCKET } = await import('../src/lib/storage');
const { buildSessionPaths, KIND_FR } = await import('./gen-session-pack-helpers');
const { aggregateSatisfactions } = await import('../src/lib/closure/satisfaction-session-template');

const DRIVE_BASE =
  '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/.shortcut-targets-by-id/1ov5w1JGdItymqXxMmNm7EyJpG1LZChnk/Start Academy/Process, Tableaux suivis & Documents/Formations dispensées/2025/Sessions de formation 2026';

const session = await prisma.trainingSession.findFirstOrThrow({
  where: { code: 'SES-0086' },
  select: {
    id: true, tenantId: true, startDate: true,
    product: { select: { title: true } },
    participants: {
      where: { enrollmentStatus: { in: ['ATTENDED', 'CONFIRMED'] } },
      select: { id: true, person: { select: { firstName: true, lastName: true } } },
    },
  },
});
const parts = session.participants;
console.log(`SES-0086 — ${parts.length} stagiaires · génération satisfaction à froid…`);

const WRITE = process.env.WRITE === '1';
if (WRITE) {
  const batch = await prisma.closureBatch.create({
    data: {
      tenantId: session.tenantId, sessionId: session.id, status: 'PENDING',
      totalDocs: parts.length,
      jobs: { create: parts.map((p) => ({ participantId: p.id, kind: 'SATISFACTION_FROID' as never, status: 'QUEUED' as const })) },
    },
    include: { jobs: true },
  });

  const paths = buildSessionPaths(
    DRIVE_BASE, session.product!.title, session.startDate,
    parts.map((p) => ({ prenom: p.person.firstName, nom: p.person.lastName })),
  );
  const dirByPart = new Map(parts.map((p, i) => [p.id, paths.learnerDirs[i]!]));

  let ok = 0, drive = 0, fail = 0;
  for (const job of batch.jobs) {
    const who = parts.find((p) => p.id === job.participantId)!;
    const label = `${who.person.firstName} ${who.person.lastName}`;
    try {
      await processClosureJobPayload(
        { jobId: job.id, batchId: batch.id, tenantId: session.tenantId, sessionId: session.id, participantId: job.participantId!, kind: 'SATISFACTION_FROID' as never },
        { attemptsMade: 0, maxAttempts: 1, markProcessing: true },
      );
      ok++;
      const done = await prisma.closureJob.findUnique({ where: { id: job.id }, select: { pedagogicalAssetId: true, documentId: true } });
      const url = done?.pedagogicalAssetId
        ? (await prisma.pedagogicalAsset.findUnique({ where: { id: done.pedagogicalAssetId }, select: { pdfUrl: true } }))?.pdfUrl
        : done?.documentId
          ? (await prisma.document.findUnique({ where: { id: done.documentId }, select: { pdfUrl: true } }))?.pdfUrl
          : null;
      const dir = dirByPart.get(job.participantId!);
      if (url && dir) {
        fs.writeFileSync(`${dir}/${KIND_FR['SATISFACTION_FROID']}.pdf`, await downloadFile(DOCS_BUCKET, url));
        drive++;
      }
      console.log(`  ✓ ${label}`);
    } catch (e) { fail++; console.log(`  ✗ ${label} — ${e instanceof Error ? e.message : e}`); }
  }
  console.log(`\nFroid — DB:${ok} Drive:${drive} erreurs:${fail}`);
} else {
  console.log('(DRY — ajoute WRITE=1 pour générer le froid)');
}

// ===== INDICATEURS DE SESSION (sur satisfaction à chaud) =====
const chaud = await prisma.pedagogicalAsset.findMany({
  where: { sessionId: session.id, kind: 'SATISFACTION_CHAUD' }, select: { rawJson: true },
});
const contents: any[] = [];
for (const a of chaud) {
  const raw = a.rawJson as Record<string, unknown> | null;
  if (!raw) continue;
  const { source: _s, ...c } = raw;
  contents.push(c);
}
const agg = contents.length ? aggregateSatisfactions(contents as never) : null;

console.log('\n══════ INDICATEURS SES-0086 (Tracfin) ══════');
console.log(`Stagiaires formés        : ${parts.length}`);
console.log(`Questionnaires à chaud   : ${contents.length}`);
console.log(`Note /5                  : ${agg ? agg.noteSur5.toFixed(1) : '—'}`);
console.log(`Taux de satisfaction     : ${agg ? agg.satisfactionFavorableRate + ' %' : '—'}`);
console.log(`Taux de recommandation   : ${agg ? agg.recommandationRate + ' %' : '—'}`);

await prisma.$disconnect();

/**
 * REMPLACEMENT des certificats de réalisation (nouveau template tampon+signature).
 *
 * Réutilise la persistance canonique (processClosureJobPayload) → DB Document
 * remplacé + nouvel objet MinIO, puis recopie le PDF au CHEMIN DRIVE EXACT du
 * fichier existant (écrase en place, jamais de doublon).
 *
 * Pilotage par /tmp/certificats-match-plan.json (réconciliation préalable) :
 * on ne touche QUE des certificats qui existent déjà sur le Drive.
 *
 * Modes :
 *   SES=SES-0095 tsx scripts/_replace-certificats.ts          → 1 session
 *   ALL=1 CONFIRM=REPLACE tsx scripts/_replace-certificats.ts  → masse (243)
 *   (ajouter DRY_RUN=1 pour lister sans rien écrire)
 *
 * Aucun email : batch créé sans createdByUserId (notifyBatchCompletion sort tôt).
 */
import fs from 'node:fs';

const { prisma } = await import('@qualiof/db');
const { processClosureJobPayload } = await import('../src/lib/closure/worker');
const { downloadFile, DOCS_BUCKET } = await import('../src/lib/storage');

const SES = process.env.SES;
const ALL = process.env.ALL === '1';
const DRY_RUN = process.env.DRY_RUN === '1';
const CONFIRM = process.env.CONFIRM;

if (!SES && !ALL) {
  console.error('Usage : SES=SES-XXXX  OU  ALL=1 CONFIRM=REPLACE');
  process.exit(1);
}
if (ALL && !DRY_RUN && CONFIRM !== 'REPLACE') {
  console.error('Masse : ajoute CONFIRM=REPLACE pour confirmer (ou DRY_RUN=1).');
  process.exit(1);
}

type PlanEntry = { participantId: string; who: string; filePath: string };
const plan: PlanEntry[] = JSON.parse(
  fs.readFileSync('/tmp/certificats-match-plan.json', 'utf8'),
);
const targetByPart = new Map(plan.map((p) => [p.participantId, p.filePath]));

// Résout sessionId/tenantId/code pour les participants du plan
const parts = await prisma.sessionParticipant.findMany({
  where: { id: { in: plan.map((p) => p.participantId) } },
  select: {
    id: true,
    session: { select: { id: true, code: true, tenantId: true } },
    person: { select: { firstName: true, lastName: true } },
  },
});

// Filtre par session si SES défini
let scoped = parts;
if (SES) scoped = parts.filter((p) => p.session.code === SES);
if (scoped.length === 0) {
  console.error(`Aucun participant matché pour ${SES ?? 'ALL'}.`);
  process.exit(1);
}

// Groupe par session
const bySession = new Map<string, typeof scoped>();
for (const p of scoped) {
  const arr = bySession.get(p.session.id) ?? [];
  arr.push(p);
  bySession.set(p.session.id, arr);
}

console.log(`\n═══ REMPLACEMENT CERTIFICATS ${DRY_RUN ? '(DRY-RUN)' : ''} ═══`);
console.log(`Sessions : ${bySession.size} · Certificats : ${scoped.length}\n`);

let okDb = 0;
let okDrive = 0;
let fail = 0;

for (const [sessionId, participants] of bySession) {
  const code = participants[0]!.session.code;
  const tenantId = participants[0]!.session.tenantId;
  console.log(`▶ ${code} — ${participants.length} certificat(s)`);

  if (DRY_RUN) {
    for (const p of participants) {
      console.log(`   [dry] ${p.person.firstName} ${p.person.lastName} → ${targetByPart.get(p.id)}`);
    }
    continue;
  }

  // 1 batch / session, sans createdByUserId (→ pas d'email)
  const batch = await prisma.closureBatch.create({
    data: {
      tenantId,
      sessionId,
      status: 'PENDING',
      totalDocs: participants.length,
      jobs: {
        create: participants.map((p) => ({
          participantId: p.id,
          kind: 'CERTIFICAT' as never,
          status: 'QUEUED' as const,
        })),
      },
    },
    include: { jobs: true },
  });

  for (const job of batch.jobs) {
    const who = participants.find((p) => p.id === job.participantId)!;
    const label = `${who.person.firstName} ${who.person.lastName}`;
    try {
      await processClosureJobPayload(
        {
          jobId: job.id,
          batchId: batch.id,
          tenantId,
          sessionId,
          participantId: job.participantId!,
          kind: 'CERTIFICAT' as never,
        },
        { attemptsMade: 0, maxAttempts: 1, markProcessing: true },
      );
      okDb++;

      // Récupère le Document fraîchement créé → MinIO → écrase le Drive
      const done = await prisma.closureJob.findUnique({
        where: { id: job.id },
        select: { documentId: true, status: true },
      });
      const doc = done?.documentId
        ? await prisma.document.findUnique({
            where: { id: done.documentId },
            select: { pdfUrl: true },
          })
        : null;
      const target = targetByPart.get(job.participantId!);
      if (doc?.pdfUrl && target) {
        const buf = await downloadFile(DOCS_BUCKET, doc.pdfUrl);
        fs.writeFileSync(target, buf); // écrase en place
        okDrive++;
        console.log(`   ✓ ${label}`);
      } else {
        console.log(`   ⚠ ${label} — doc/chemin manquant (DB ok, Drive non écrit)`);
      }
    } catch (e) {
      fail++;
      console.log(`   ✗ ${label} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

console.log(`\n─── BILAN ───`);
console.log(`DB régénérés   : ${okDb}`);
console.log(`Drive écrasés  : ${okDrive}`);
console.log(`Échecs         : ${fail}`);
console.log(DRY_RUN ? '\n(DRY-RUN — rien écrit)\n' : '\nTerminé.\n');

await prisma.$disconnect();

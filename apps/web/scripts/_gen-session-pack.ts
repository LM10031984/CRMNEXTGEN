// Pipeline de génération de packs AVEC PERSISTANCE réelle (DB + MinIO) + dépôt Drive.
//
// Usage :
//   SES=SES-XXXX tsx scripts/_gen-session-pack.ts
//   SES="SES-XXXX SES-YYYY" tsx scripts/_gen-session-pack.ts    (liste)
//   SES=SES-XXXX DRY_RUN=1 tsx scripts/_gen-session-pack.ts     (pas d'écriture Drive)
//   SES=SES-XXXX DRIVE_BASE="/chemin/perso" tsx scripts/_gen-session-pack.ts
//
// Différence avec _gen-temoin-cloud.ts (qui rend tout en /tmp SANS persistance) :
//   - le pack closure par participant est généré via processClosureJobPayload
//     appelé EN DIRECT (aucun enqueue dans la queue BullMQ → le worker Ollama ne prend rien) ;
//   - les docs session (Programme/Déroulé/Checklist) passent par les CŒURS sans
//     auth (persistance Document/PedagogicalAsset idempotente + MinIO) ;
//   - les PDF persistés sont recopiés depuis MinIO vers le dossier Drive local
//     synchronisé selon l'arborescence validée (idempotent : writeFileSync écrase).
//
// CE SCRIPT NE HARDCODE AUCUN PRODUIT/SESSION (PROD-0062 jamais lancé ici).

import fs from 'node:fs';
import path from 'node:path';

// 1) Provider cloud AVANT tout import qui appelle le LLM (Claude via openrouter).
const backupPath = path.resolve(process.cwd(), '../../.env.local.cloud-backup');
const backup = fs.readFileSync(backupPath, 'utf8');
const pick = (k: string) => backup.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1];
process.env.AI_PROVIDER = 'openrouter';
process.env.OPENROUTER_API_KEY = pick('OPENROUTER_API_KEY')!;
process.env.OPENROUTER_MODEL_FAST = pick('OPENROUTER_MODEL_FAST') ?? 'anthropic/claude-haiku-4.5';
process.env.OPENROUTER_MODEL_QUALITY = pick('OPENROUTER_MODEL_QUALITY') ?? 'anthropic/claude-sonnet-4.6';

// 2) Paramètres.
const CODES = (process.env.SES ?? '').split(/[\s,]+/).filter(Boolean);
if (CODES.length === 0) {
  throw new Error('SES manquant. Usage : SES=SES-XXXX tsx scripts/_gen-session-pack.ts (ou liste : SES="SES-XXXX SES-YYYY")');
}
const DRY_RUN = process.env.DRY_RUN === '1';
// Base Drive locale synchronisée (Google Drive « Mon Drive » de Laurent).
// Surchargeable via DRIVE_BASE. Sous-dossier dédié pour ne pas polluer la racine.
const DRIVE_BASE =
  process.env.DRIVE_BASE ??
  '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/.shortcut-targets-by-id/1ov5w1JGdItymqXxMmNm7EyJpG1LZChnk/Start Academy/Process, Tableaux suivis & Documents/Formations dispensées/2025/Sessions de formation 2026';

// 3) Imports (après le bloc provider).
const { prisma } = await import('@qualiof/db');
const { processClosureJobPayload } = await import('../src/lib/closure/worker');
const { CLOSURE_DOC_KINDS } = await import('../src/lib/closure/types');
const { downloadFile, DOCS_BUCKET } = await import('../src/lib/storage');
// quick 260618-gux : import des CŒURS sans auth depuis leurs fichiers dédiés
// (PAS depuis les server actions, qui importent @/lib/auth → erreur « react
// does not provide an export named 'cache' » au boot du script tsx).
const { generateConventionCore } = await import('../src/lib/closure/convention-core');
const { generateProgrammeForProductCore } = await import('../src/lib/closure/programme-core');
const { generateChecklistCore } = await import('../src/lib/closure/checklist-core');
const { persistDerouleSession } = await import('../src/lib/closure/generate-deroule-session');
const { generateNormalizedProgramme } = await import('../src/lib/closure/ollama-generators');
const {
  sanitize,
  formatDateFR,
  buildSessionPaths,
  kindsForFroid,
  isFroidEligible,
  KIND_FR,
  ROOT_FILE_PROGRAMME,
  ROOT_FILE_DEROULE,
  ROOT_FILE_CHECKLIST,
  LEARNER_FILE_CONVENTION,
} = await import('./gen-session-pack-helpers');

// Sous-ensemble closure que ce pipeline génère par participant (filtré froid).
const PART_CLOSURE_KINDS = CLOSURE_DOC_KINDS as readonly string[];

const log = (icon: string, msg: string) => console.log(`  ${icon} ${msg}`);

/** Récupère le buffer PDF d'un pdfUrl MinIO et l'écrit dans Drive (idempotent). */
async function copyToDrive(pdfUrl: string | null | undefined, destFile: string): Promise<boolean> {
  if (DRY_RUN) {
    console.log(`     [dry-run] → ${destFile}`);
    return true;
  }
  if (!pdfUrl) return false;
  const buf = await downloadFile(DOCS_BUCKET, pdfUrl);
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.writeFileSync(destFile, buf); // écrase par défaut → jamais de '(1).pdf'
  return true;
}

for (const SES of CODES) {
  console.log(`\n=================== ${SES} ===================`);

  // a) Charge la session (même include que le témoin cloud).
  const session = await prisma.trainingSession.findFirst({
    where: { code: SES },
    include: {
      location: true,
      product: true,
      trainers: { include: { person: true } },
      participants: {
        where: { enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] } },
        include: {
          sponsorOrg: true,
          person: { include: { legalLinks: { include: { organization: true } } } },
        },
      },
    },
  });
  if (!session) {
    log('✗', `Session ${SES} introuvable — ignorée`);
    continue;
  }
  if (!session.product) {
    log('✗', `Session ${SES} sans produit — ignorée`);
    continue;
  }

  const tenantId = session.tenantId;
  const p = session.product;
  const parts = session.participants;

  // b) Garde « session terminée » : on logge mais on NE bloque PAS (robustesse).
  if (session.endDate.getTime() > Date.now()) {
    log('⚠', `Session non terminée (fin ${session.endDate.toISOString().slice(0, 10)}) — on persiste quand même`);
  }

  // Gate froid : SATISFACTION_FROID seulement si ≥90j.
  const froidEligible = isFroidEligible(session.endDate, new Date());
  if (!froidEligible) {
    log('⚠', `froid sauté : session terminée depuis < 90j (fin ${session.endDate.toISOString().slice(0, 10)})`);
  }
  const kinds = kindsForFroid(froidEligible).filter((k) => (PART_CLOSURE_KINDS as string[]).includes(k));

  console.log(`Produit ${p.code} (${p.durationHours}h) — ${parts.length} apprenants — froidEligible=${froidEligible}`);
  console.log(`Provider : ${process.env.AI_PROVIDER} | DRY_RUN=${DRY_RUN ? '1' : '0'}`);

  // DRY_RUN = plan SEUL, AUCUNE écriture (ni DB, ni MinIO, ni Drive). On affiche
  // ce qui SERAIT généré puis on passe à la session suivante. Garde explicite
  // avant toute persistance (quick 260618-gux : l'ancien DRY_RUN ne protégeait
  // que la copie Drive, pas processClosureJobPayload / les cœurs).
  if (DRY_RUN) {
    const planPaths = buildSessionPaths(
      DRIVE_BASE,
      p.title,
      session.startDate,
      parts.map((part) => ({ prenom: part.person.firstName, nom: part.person.lastName })),
    );
    console.log(`\n  [dry-run] Plan de génération (rien écrit) :`);
    console.log(`  [dry-run]   Pack closure : ${kinds.length} kinds × ${parts.length} pers = ${kinds.length * parts.length} jobs`);
    console.log(`  [dry-run]     kinds : ${kinds.join(', ')}`);
    console.log(`  [dry-run]   Docs session (cœurs) : Programme + Déroulé + Checklist`);
    console.log(`  [dry-run]   Conventions : ${parts.length} (1 par apprenant)`);
    console.log(`  [dry-run]   Drive racine : ${planPaths.rootDir}`);
    console.log(`  [dry-run]     ${ROOT_FILE_PROGRAMME} / ${ROOT_FILE_DEROULE} / ${ROOT_FILE_CHECKLIST}`);
    for (const part of parts) {
      const who = sanitize(`${part.person.firstName} ${part.person.lastName}`);
      console.log(`  [dry-run]     ${who}/ → ${LEARNER_FILE_CONVENTION} + docs pack closure`);
    }
    console.log(`\n  ✓ ${SES} (dry-run, rien écrit)`);
    continue;
  }

  // c) PACK CLOSURE par participant via processClosureJobPayload EN DIRECT.
  let batchId: string | null = null;
  if (parts.length > 0) {
    const batch = await prisma.closureBatch.create({
      data: {
        tenantId,
        sessionId: session.id,
        status: 'PENDING',
        totalDocs: kinds.length * parts.length,
        jobs: {
          create: parts.flatMap((part) =>
            kinds.map((kind) => ({ participantId: part.id, kind: kind as any, status: 'QUEUED' as const })),
          ),
        },
      },
      include: { jobs: { select: { id: true, participantId: true, kind: true } } },
    });
    batchId = batch.id;
    console.log(`\n  Pack closure : ${batch.jobs.length} jobs (${kinds.length} kinds × ${parts.length} pers) — EN DIRECT (pas de queue)`);
    for (const j of batch.jobs) {
      try {
        await processClosureJobPayload(
          { jobId: j.id, batchId: batch.id, tenantId, sessionId: session.id, participantId: j.participantId!, kind: j.kind as any },
          { attemptsMade: 0, maxAttempts: 1, markProcessing: true },
        );
        log('✓', `${j.kind}`);
      } catch (e: any) {
        log('✗', `${j.kind} — ${e?.message ?? e}`);
      }
    }
  }

  // d) DOCS NIVEAU SESSION via les CŒURS.
  console.log('\n  Docs session (cœurs) :');

  // Programme SESSION — source unique programme+convention (normalisé une fois).
  const objectives = Array.isArray(p.objectives) ? (p.objectives as string[]) : [];
  const normalizedProgrammeMd =
    (await generateNormalizedProgramme(p.programMd ?? '', objectives, p.durationHours, p.title, tenantId)) ??
    (p.programMd ?? '');
  const progRes = await generateProgrammeForProductCore(tenantId, p.id, {
    force: true,
    programmeMdOverride: normalizedProgrammeMd,
  });
  log(progRes.ok ? '✓' : '✗', `Programme — ${progRes.ok ? progRes.pdfUrl : progRes.error}`);

  // Déroulé SESSION (persistDerouleSession, idempotent).
  const derouleRes = await persistDerouleSession(tenantId, session.id, { force: true });
  log(derouleRes.ok ? '✓' : '✗', `Déroulé — ${derouleRes.ok ? derouleRes.pdfUrl : derouleRes.error}`);

  // Checklist SESSION.
  const checklistRes = await generateChecklistCore(tenantId, session.id, { force: true });
  log(checklistRes.ok ? '✓' : '✗', `Checklist — ${checklistRes.ok ? checklistRes.pdfUrl : checklistRes.error}`);

  // Convention par participant (cœur, conventionDate J-15 ouvrés interne).
  const conventionByPart = new Map<string, string | undefined>();
  console.log('\n  Conventions (cœur, par apprenant) :');
  for (const part of parts) {
    const r = await generateConventionCore(tenantId, part.id);
    if (r.ok && r.documentId) {
      const doc = await prisma.document.findUnique({ where: { id: r.documentId }, select: { pdfUrl: true } });
      conventionByPart.set(part.id, doc?.pdfUrl ?? undefined);
      log('✓', `Convention — ${part.person.firstName} ${part.person.lastName}`);
    } else {
      log('✗', `Convention — ${part.person.firstName} ${part.person.lastName} — ${r.error}`);
    }
  }

  // e) SORTIE DRIVE (sauf DRY_RUN écriture — mais on logge l'arbo).
  const paths = buildSessionPaths(
    DRIVE_BASE,
    p.title,
    session.startDate,
    parts.map((part) => ({ prenom: part.person.firstName, nom: part.person.lastName })),
  );
  console.log(`\n  Drive : ${paths.rootDir}`);

  // Racine = Programme / Déroulé / Checklist (JAMAIS chez l'apprenant).
  await copyToDrive(progRes.ok ? progRes.pdfUrl : undefined, `${paths.rootDir}/${ROOT_FILE_PROGRAMME}`);
  await copyToDrive(derouleRes.ok ? derouleRes.pdfUrl : undefined, `${paths.rootDir}/${ROOT_FILE_DEROULE}`);
  await copyToDrive(checklistRes.ok ? checklistRes.pdfUrl : undefined, `${paths.rootDir}/${ROOT_FILE_CHECKLIST}`);

  // Résout les pdfUrl des docs pack closure par participant.
  let packJobs: Array<{ kind: string; participantId: string | null; documentId: string | null; pedagogicalAssetId: string | null }> = [];
  if (batchId) {
    packJobs = await prisma.closureJob.findMany({
      where: { batchId, status: 'DONE' },
      select: { kind: true, participantId: true, documentId: true, pedagogicalAssetId: true },
    });
  }

  for (const part of parts) {
    const who = sanitize(`${part.person.firstName} ${part.person.lastName}`);
    const learnerDir = `${paths.rootDir}/${who}`;

    // Convention de formation.
    await copyToDrive(conventionByPart.get(part.id), `${learnerDir}/${LEARNER_FILE_CONVENTION}`);

    // Docs du pack closure (noms FR ; Satisfaction à froid seulement si éligible).
    for (const j of packJobs.filter((x) => x.participantId === part.id)) {
      const fr = KIND_FR[j.kind];
      if (!fr) continue; // DEROULE_PEDA / kind sans nom FR : doc session, ignoré ici
      if (j.kind === 'SATISFACTION_FROID' && !froidEligible) continue;
      let pdfUrl: string | null = null;
      if (j.pedagogicalAssetId) {
        pdfUrl = (await prisma.pedagogicalAsset.findUnique({ where: { id: j.pedagogicalAssetId }, select: { pdfUrl: true } }))?.pdfUrl ?? null;
      }
      if (!pdfUrl && j.documentId) {
        pdfUrl = (await prisma.document.findUnique({ where: { id: j.documentId }, select: { pdfUrl: true } }))?.pdfUrl ?? null;
      }
      await copyToDrive(pdfUrl, `${learnerDir}/${fr}.pdf`);
    }
  }

  // f) Récap.
  console.log(`\n  ✓ ${SES} terminé — Drive : ${paths.rootDir}${DRY_RUN ? ' (dry-run, rien écrit)' : ''}`);
}

await prisma.$disconnect();
console.log('\n=== Pipeline terminé ===');

/**
 * Sonde lieux SmartOF (Phase 09.2) — READ-ONLY, aucune écriture BDD ni SmartOF.
 *
 * But : trancher BACKFILLABLE vs RELIQUAT_MANUEL pour les sessions sans locationId
 * AVANT la passe import-from-smartof (Plan 04). Le dry-run de l'import ne le révèle
 * PAS : resolveSessionLocation renvoie null hors --apply même quand les champs
 * existent (RESEARCH Pitfall 3). On lit donc directement les custom_fields SmartOF
 * (custom_field_1=rue / 2=CP / 3=ville).
 *
 * Verdict par session : BACKFILLABLE (≥1 champ lieu non vide) vs RELIQUAT_MANUEL.
 * Sortie : tableau console + /tmp/sonde-lieux-smartof.csv (review humaine, alimente
 * le reliquat Plan 07). Si les creds SmartOF échouent → message clair + exit 1,
 * AUCUN lieu inventé.
 *
 * Invocation : pnpm --filter @qualiof/web exec tsx scripts/sonde-lieux-smartof.ts
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma } from '@qualiof/db';
import { listSessions, type SmartofSession } from '../src/lib/smartof/client';

const CSV_PATH = '/tmp/sonde-lieux-smartof.csv';

function customField(s: SmartofSession, n: 1 | 2 | 3): string {
  const cf = (s.custom_fields ?? s.customFields) as Record<string, unknown> | undefined;
  const v = cf?.[`custom_field_${n}`];
  return typeof v === 'string' ? v.trim() : '';
}

async function main(): Promise<void> {
  // 1. Sessions sans locationId + leur externalId SmartOF.
  const sessions = await prisma.trainingSession.findMany({
    where: { locationId: null },
    select: {
      id: true,
      code: true,
      name: true,
      startDate: true,
      _count: { select: { participants: true } },
    },
    orderBy: { startDate: 'asc' },
  });

  const idents = await prisma.externalIdentity.findMany({
    where: { source: 'smartof', entityType: 'TrainingSession' },
    select: { externalId: true, entityId: true },
  });
  const uidBySessionId = new Map(idents.map((i) => [i.entityId, i.externalId]));

  console.log(`${sessions.length} sessions sans locationId en base.`);
  if (sessions.length === 0) {
    fs.writeFileSync(CSV_PATH, 'code,participants,cf1_rue,cf2_cp,cf3_ville,verdict\n');
    console.log('Aucune session sans lieu — rien à sonder.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // 2. Pull SmartOF (read-only). Échec creds/réseau → exit 1, pas de lieu inventé.
  let smartofSessions: SmartofSession[];
  try {
    const raw = await listSessions();
    smartofSessions = (raw.sessions ?? raw.data ?? raw.items ?? []) as SmartofSession[];
  } catch (e) {
    console.error(
      'creds SmartOF requis (SMARTOF_FIREBASE_API_KEY/EMAIL/PASSWORD) — sondage lieux impossible.',
    );
    console.error(String(e instanceof Error ? e.message : e));
    await prisma.$disconnect();
    process.exit(1);
  }

  // Index SmartOF par uid (sessionUid/id) et par code (customId/code).
  const byUid = new Map<string, SmartofSession>();
  const byCode = new Map<string, SmartofSession>();
  for (const s of smartofSessions) {
    const uid = (s.sessionUid ?? s.id ?? s.uid) as string | undefined;
    if (uid) byUid.set(String(uid), s);
    const code = (s.customId ?? s.code) as string | undefined;
    if (code) byCode.set(String(code), s);
  }

  // 3. Verdict par session.
  const rows: string[] = ['code,participants,cf1_rue,cf2_cp,cf3_ville,verdict'];
  let backfillable = 0;
  let reliquat = 0;
  let closureRelevant = 0;
  let notFound = 0;

  for (const sess of sessions) {
    const uid = uidBySessionId.get(sess.id);
    const sm =
      (uid ? byUid.get(uid) : undefined) ?? (sess.code ? byCode.get(sess.code) : undefined);
    const nbP = sess._count.participants;

    let cf1 = '';
    let cf2 = '';
    let cf3 = '';
    let verdict: string;
    if (!sm) {
      verdict = 'INTROUVABLE_SMARTOF';
      notFound++;
    } else {
      cf1 = customField(sm, 1);
      cf2 = customField(sm, 2);
      cf3 = customField(sm, 3);
      const hasLieu = Boolean(cf1 || cf3); // rue ou ville (CP seul insuffisant)
      verdict = hasLieu ? 'BACKFILLABLE' : 'RELIQUAT_MANUEL';
      if (hasLieu) backfillable++;
      else reliquat++;
      if (hasLieu && nbP > 0) closureRelevant++;
    }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    rows.push(
      [sess.code ?? '', nbP, esc(cf1), esc(cf2), esc(cf3), verdict].join(','),
    );
    console.log(
      `  ${(sess.code ?? '?').padEnd(10)} | ${String(nbP).padStart(2)} part | ` +
        `${verdict.padEnd(18)} | ${[cf1, cf2, cf3].filter(Boolean).join(' / ') || '—'}`,
    );
  }

  fs.writeFileSync(CSV_PATH, rows.join('\n'));
  console.log(`\n📄 CSV écrit : ${CSV_PATH}`);
  console.log(
    `Résumé : ${sessions.length} sondées · ${backfillable} backfillables ` +
      `(dont ${closureRelevant} closure-relevant, participants > 0) · ${reliquat} reliquat manuel · ` +
      `${notFound} introuvables SmartOF.`,
  );

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

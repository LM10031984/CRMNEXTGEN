'use server';

/**
 * ZIP « tous les documents d'un apprenant » (Laurent 2026-09-08).
 *
 * Pendant, côté personne, de `buildClosureZipBuffer` qui empaquette une
 * session. Même patron : l'action construit le buffer, la route
 * `/api/apprenants/[id]/zip` le sert avec le bon `Content-Disposition`.
 *
 * Les règles d'inclusion et de nommage vivent dans le module pur
 * `lib/docs/learner-zip-entries.ts` (testé sans base). Ici : l'auth, le scope
 * tenant, la lecture des clés de stockage et l'empilement de l'archive.
 */

import archiver from 'archiver';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { getDocsForPerson } from '@/lib/docs/get-docs-for';
import {
  buildLearnerZipEntries,
  buildLearnerZipFilename,
  sessionIdOfAnchor,
  type LearnerZipEntry,
} from '@/lib/docs/learner-zip-entries';

export interface LearnerZipResult {
  ok: boolean;
  buffer?: Buffer;
  filename?: string;
  /** Nombre de documents réellement empaquetés. */
  count?: number;
  /** Documents au contenu générique dans l'archive (transparence audit). */
  stubCount?: number;
  error?: string;
}

export async function buildLearnerDocsZip(personId: string): Promise<LearnerZipResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId: user.tenantId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!person) return { ok: false, error: 'Apprenant introuvable' };

  const docs = await getDocsForPerson(person.id, user.tenantId);

  // Codes de session lisibles pour les dossiers de l'archive.
  const sessionIds = Array.from(
    new Set(docs.map((d) => sessionIdOfAnchor(d.anchor)).filter((s): s is string => !!s)),
  );
  const sessions = sessionIds.length
    ? await prisma.trainingSession.findMany({
        where: { id: { in: sessionIds }, tenantId: user.tenantId },
        select: { id: true, code: true },
      })
    : [];
  const sessionCodeById = new Map(sessions.map((s) => [s.id, s.code]));

  const entries = buildLearnerZipEntries({
    docs,
    firstName: person.firstName,
    lastName: person.lastName,
    sessionCodeById,
  });
  if (entries.length === 0) {
    return { ok: false, error: 'Aucun document téléchargeable pour cet apprenant' };
  }

  // Clés de stockage en bulk, par table d'origine (2 requêtes, pas N).
  const keyBySource = await loadStorageKeys(entries, user.tenantId);

  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  archive.on('data', (c: Buffer) => chunks.push(c));
  const finalized = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', (err) => reject(err));
  });

  let count = 0;
  let stubCount = 0;
  for (const entry of entries) {
    const key = keyBySource.get(`${entry.sourceTable}:${entry.sourceId}`);
    if (!key) continue;
    try {
      const buf = await downloadFile(DOCS_BUCKET, key);
      archive.append(buf, { name: entry.path });
      count++;
      if (entry.usedStub) stubCount++;
    } catch (e) {
      // Un objet illisible ne doit pas faire échouer toute l'archive — on le
      // saute en le traçant, comme le fait le ZIP de session.
      console.error(`[learner-zip] skip ${entry.path}: ${(e as Error).message}`);
    }
  }
  archive.finalize();
  await finalized;

  if (count === 0) return { ok: false, error: 'Aucun document lisible dans le stockage' };

  return {
    ok: true,
    buffer: Buffer.concat(chunks),
    filename: buildLearnerZipFilename(person.firstName, person.lastName, new Date()),
    count,
    stubCount,
  };
}

/** `<sourceTable>:<sourceId>` → clé de stockage. Scopé tenant des deux côtés. */
async function loadStorageKeys(
  entries: LearnerZipEntry[],
  tenantId: string,
): Promise<Map<string, string>> {
  const documentIds = entries.filter((e) => e.sourceTable === 'Document').map((e) => e.sourceId);
  const assetIds = entries
    .filter((e) => e.sourceTable === 'PedagogicalAsset')
    .map((e) => e.sourceId);

  const [documents, assets] = await Promise.all([
    documentIds.length
      ? prisma.document.findMany({
          where: { id: { in: documentIds }, tenantId },
          select: { id: true, pdfUrl: true },
        })
      : Promise.resolve([]),
    assetIds.length
      ? prisma.pedagogicalAsset.findMany({
          where: { id: { in: assetIds }, tenantId },
          select: { id: true, pdfUrl: true },
        })
      : Promise.resolve([]),
  ]);

  const map = new Map<string, string>();
  for (const d of documents) if (d.pdfUrl) map.set(`Document:${d.id}`, d.pdfUrl);
  for (const a of assets) if (a.pdfUrl) map.set(`PedagogicalAsset:${a.id}`, a.pdfUrl);
  return map;
}

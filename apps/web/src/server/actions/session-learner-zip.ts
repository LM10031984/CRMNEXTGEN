'use server';

/**
 * ZIP « les documents de CET apprenant, pour CETTE session, sur CETTE phase »
 * (Laurent 2026-09-10 : « à côté de chaque apprenant un bouton pour télécharger
 * les docs par apprenant par rapport à chaque phase »).
 *
 * Trois archives coexistent désormais, et elles ne répondent pas à la même
 * question :
 *  - `buildClosureZipBuffer`  → « tout ce que le pack de fin a produit » (session) ;
 *  - `buildLearnerDocsZip`    → « toute la vie documentaire d'une personne » (toutes sessions) ;
 *  - celle-ci                 → « le dossier d'un inscrit à un moment donné ».
 *
 * Pourquoi elle ne réutilise PAS `resolveDocs` comme sa cousine par personne :
 * `resolveDocs` ne remonte que les documents portant un `participantId`, donc il
 * rate la convention d'ENTREPRISE — celle rattachée à l'organisation
 * commanditaire et projetée sur chaque salarié par `expandGroupConventions`.
 * Pour un dossier OPCO, c'est la pièce n°1. On lit donc exactement les mêmes
 * sources que la matrice de la fiche session, et on les résout avec le même
 * `deriveCellState` : ce que Laurent voit dans la matrice est ce qu'il reçoit
 * dans l'archive.
 */

import archiver from 'archiver';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { PED_KIND_TO_DOC_TYPE } from '@/lib/doc-scope';
import { expandGroupConventions } from '@/lib/docs/convention-coverage';
import { releveDeLaConvention } from '@/lib/sessions/payer-rule';
import { DOC_PHASES, type DocPhase } from '@/lib/docs/doc-phase';
import { resolveParticipantPhaseDocs } from '@/lib/sessions/participant-phase-items';
import {
  buildSessionLearnerZipEntries,
  buildSessionLearnerZipFilename,
  type LearnerDocRef,
} from '@/lib/docs/session-learner-zip-entries';

export interface SessionLearnerZipResult {
  ok: boolean;
  buffer?: Buffer;
  filename?: string;
  /** Nombre de pièces réellement empaquetées. */
  count?: number;
  error?: string;
}

/**
 * @param participantId `SessionParticipant.id` — l'inscription, pas la personne :
 *   c'est elle qui porte la session, et donc la phase.
 * @param phase `null` = dossier complet, rangé en sous-dossiers par phase.
 */
export async function buildSessionLearnerZip(
  participantId: string,
  phase: DocPhase | null,
): Promise<SessionLearnerZipResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    select: {
      id: true,
      docStatus: true,
      sponsorOrgId: true,
      sponsorOrg: { select: { legalForm: true } },
      person: {
        select: {
          firstName: true,
          lastName: true,
          legalLinks: { select: { role: true, organizationId: true } },
        },
      },
      session: { select: { id: true, code: true, productId: true } },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const { session } = participant;

  // Mêmes lectures que la fiche session (page.tsx) — participant, groupe,
  // session et produit. `pdfUrl` est demandé ici directement : contrairement à
  // la page qui ne veut que des ids pour l'affichage, l'archive doit lire les
  // objets, et une seconde requête pour les clés serait un aller-retour de plus.
  const [participantDocs, groupCandidateDocs, sessionSharedDocs, productDocs, assets] =
    await Promise.all([
      prisma.document.findMany({
        where: {
          tenantId: user.tenantId,
          entityType: 'participant',
          entityId: participant.id,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, pdfUrl: true },
      }),
      // Conventions GROUPE : rattachées à l'organisation commanditaire ou à la
      // session. `expandGroupConventions` tranche laquelle couvre cet inscrit.
      prisma.document.findMany({
        where: {
          tenantId: user.tenantId,
          type: 'CONVENTION',
          OR: [
            { entityType: 'organization', entityId: participant.sponsorOrgId },
            { entityType: 'session', entityId: session.id },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, entityType: true, entityId: true, pdfUrl: true },
      }),
      prisma.document.findMany({
        where: { tenantId: user.tenantId, entityType: 'session', entityId: session.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, pdfUrl: true },
      }),
      session.productId
        ? prisma.document.findMany({
            where: { tenantId: user.tenantId, entityType: 'product', entityId: session.productId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, type: true, pdfUrl: true },
          })
        : Promise.resolve([]),
      prisma.pedagogicalAsset.findMany({
        where: {
          tenantId: user.tenantId,
          sessionId: session.id,
          pdfUrl: { not: null },
          // `participantId: null` = analyse des besoins d'ENTREPRISE, un seul
          // document pour tout le groupe (cf. page session).
          OR: [{ participantId: participant.id }, { participantId: null }],
        },
        orderBy: { generatedAt: 'desc' },
        select: { id: true, kind: true, participantId: true, pdfUrl: true },
      }),
    ]);

  /** Clé de stockage de chaque pièce, indexée comme l'archive la demandera. */
  const keyByRef = new Map<string, string>();
  const rememberKey = (kind: 'document' | 'asset', id: string, pdfUrl: string | null) => {
    if (pdfUrl) keyByRef.set(`${kind}:${id}`, pdfUrl);
  };

  // Le premier de chaque type gagne (requêtes triées par récence) — même règle
  // que la fiche session : l'archive porte la version courante, pas l'historique.
  const firstByType = (
    rows: Array<{ id: string; type: string; pdfUrl: string | null }>,
  ): Map<string, { id: string }> => {
    const map = new Map<string, { id: string }>();
    for (const d of rows) {
      if (!map.has(d.type)) {
        map.set(d.type, { id: d.id });
        rememberKey('document', d.id, d.pdfUrl);
      }
    }
    return map;
  };

  const participantDocMap = firstByType(participantDocs);
  const sessionDocMap = firstByType(sessionSharedDocs);
  const productDocMap = firstByType(productDocs);

  // Convention d'entreprise : ne l'ajouter que si elle couvre CET inscrit, et
  // sans jamais écraser une convention individuelle déjà émise.
  const groupConvention = expandGroupConventions(groupCandidateDocs, [
    { id: participant.id, sponsorOrgId: participant.sponsorOrgId },
  ]).get(participant.id);
  if (groupConvention && !participantDocMap.has('CONVENTION')) {
    participantDocMap.set('CONVENTION', { id: groupConvention });
    const row = groupCandidateDocs.find((d) => d.id === groupConvention);
    rememberKey('document', groupConvention, row?.pdfUrl ?? null);
  }

  // Assets : indexés par le DocType de COLONNE (le QCM a kind='QCM' mais sa
  // colonne est 'EVALUATION_ACQUIS' — sans ce mapping, la pièce est invisible).
  const releveConvention = releveDeLaConvention({
    sponsorLegalForm: participant.sponsorOrg.legalForm,
    roleChezSponsor:
      participant.person.legalLinks.find((l) => l.organizationId === participant.sponsorOrgId)
        ?.role ?? null,
  });
  const assetMap = new Map<string, { id: string }>();
  const prendAsset = (a: (typeof assets)[number]) => {
    const docType = PED_KIND_TO_DOC_TYPE[a.kind] ?? a.kind;
    if (assetMap.has(docType)) return; // déjà servi par plus récent / plus précis
    assetMap.set(docType, { id: a.id });
    rememberKey('asset', a.id, a.pdfUrl);
  };
  // Passe 1 — le nominatif prime toujours (tri par `generatedAt` desc).
  for (const a of assets) if (a.participantId) prendAsset(a);
  // Passe 2 — l'analyse d'ENTREPRISE ne comble le vide que pour les inscrits qui
  // relèvent de la convention ; un auto-payeur garde son analyse nominative ou rien.
  if (releveConvention) {
    for (const a of assets) if (!a.participantId && a.kind === 'ANALYSE_BESOIN') prendAsset(a);
  }

  // Résolution : `resolveParticipantPhaseDocs`, la MÊME fonction que le
  // compteur du bouton « Télécharger (N) » et que les lignes des blocs
  // nominatifs. C'est la garantie que le nombre annoncé est le nombre livré —
  // avant le 2026-09-10, cette action avait sa propre liste et l'attestation
  // d'assiduité manquait à l'archive sans que rien ne le dise.
  //
  // `isAgefice: true` n'est pas un raccourci : l'archive n'a pas à trancher
  // l'éligibilité d'un inscrit. Une pièce qui EXISTE part avec son dossier ;
  // une pièce absente n'a de toute façon rien à empaqueter.
  const phasesAEmpaqueter = phase ? [phase] : DOC_PHASES.map((p) => p.id);
  const refs: LearnerDocRef[] = phasesAEmpaqueter.flatMap((ph) =>
    resolveParticipantPhaseDocs({
      phase: ph,
      isAgefice: true,
      docStatus: participant.docStatus as Record<string, unknown> | null,
      participantDocs: participantDocMap,
      productDocs: productDocMap,
      sessionDocs: sessionDocMap,
      pedagogicalAssets: assetMap,
    })
      .filter((d) => d.pdfRef)
      .map((d) => ({
        docType: d.docType,
        kind: (d.pdfRef!.kind === 'asset' ? 'asset' : 'document') as LearnerDocRef['kind'],
        id: d.pdfRef!.id,
      })),
  );

  const entries = buildSessionLearnerZipEntries({
    refs,
    phase,
    firstName: participant.person.firstName,
    lastName: participant.person.lastName,
    sessionCode: session.code,
  });
  if (entries.length === 0) {
    return { ok: false, error: 'Aucun document à télécharger pour cette phase' };
  }

  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  archive.on('data', (c: Buffer) => chunks.push(c));
  const finalized = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', (err) => reject(err));
  });

  let count = 0;
  for (const entry of entries) {
    const key = keyByRef.get(`${entry.kind}:${entry.id}`);
    if (!key) continue;
    try {
      archive.append(await downloadFile(DOCS_BUCKET, key), { name: entry.path });
      count++;
    } catch (e) {
      // Un objet illisible ne fait pas échouer toute l'archive — même règle que
      // le ZIP de session. Mais il laisse une trace : un fichier qui manque en
      // silence dans un dossier OPCO est pire qu'un dossier refusé.
      console.error(`[session-learner-zip] pièce ignorée ${entry.path}: ${(e as Error).message}`);
    }
  }
  archive.finalize();
  await finalized;

  if (count === 0) return { ok: false, error: 'Aucun document lisible dans le stockage' };

  return {
    ok: true,
    buffer: Buffer.concat(chunks),
    filename: buildSessionLearnerZipFilename({
      phase,
      firstName: participant.person.firstName,
      lastName: participant.person.lastName,
      sessionCode: session.code,
    }),
    count,
  };
}

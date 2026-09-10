/**
 * Purge des traces d'envoi arrivées à échéance (registre art. 30, Traitement 5).
 *
 * `EmailMessage` est devenu, le 02/09/2026, un stockage réel de données
 * personnelles : destinataire, objet, corps du mail, et les ids des documents
 * joints. Le registre le conserve « avec le dossier de formation » — donc il
 * faut aussi savoir le supprimer, sinon la durée annoncée n'est qu'une phrase.
 *
 * ⚠ CONSÉQUENCE À CONNAÎTRE — la trace d'envoi est aussi la PREUVE qu'un
 * document est engagé (`document-engagement.ts`). La supprimer fait retomber le
 * document concerné en « libre », donc régénérable sans avertissement. C'est
 * acceptable ici et seulement ici : à l'échéance, le dossier de formation
 * lui-même est hors durée de conservation. Si un jour la durée des traces est
 * raccourcie sous celle des documents, ce raisonnement tombe — et la garde
 * d'engagement avec lui.
 */

import { prisma } from '@qualiof/db';
import { calculerEcheanceConservation, type EcheanceInput } from './retention';

export interface PurgeResult {
  examinees: number;
  supprimees: number;
  /** true = rien n'a été supprimé, on a seulement compté. */
  dryRun: boolean;
}

/** Extrait défensivement les ids de `EmailMessage.documentIds` (Json libre). */
function documentIdsDe(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) return [];
  return valeur.filter((v): v is string => typeof v === 'string');
}

export async function purgeExpiredEmailMessages(
  options: { now?: Date; dryRun?: boolean } = {},
): Promise<PurgeResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;

  const traces = await prisma.emailMessage.findMany({
    select: { id: true, sentAt: true, createdAt: true, documentIds: true },
  });
  if (traces.length === 0) return { examinees: 0, supprimees: 0, dryRun };

  // Rattachement trace → sessions, en deux requêtes pour tout le lot.
  const tousLesDocIds = Array.from(
    new Set(traces.flatMap((t) => documentIdsDe(t.documentIds))),
  );
  const documents =
    tousLesDocIds.length > 0
      ? await prisma.document.findMany({
          where: { id: { in: tousLesDocIds } },
          select: { id: true, sessionId: true },
        })
      : [];
  const sessionIds = Array.from(
    new Set(documents.map((d) => d.sessionId).filter((s): s is string => Boolean(s))),
  );
  const sessions =
    sessionIds.length > 0
      ? await prisma.trainingSession.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true, endDate: true },
        })
      : [];

  const finParSession = new Map(sessions.map((s) => [s.id, s.endDate]));
  const sessionParDocument = new Map(documents.map((d) => [d.id, d.sessionId]));

  const aSupprimer: string[] = [];
  for (const trace of traces) {
    const finsDeSession: Date[] = [];
    for (const docId of documentIdsDe(trace.documentIds)) {
      const sessionId = sessionParDocument.get(docId);
      const fin = sessionId ? finParSession.get(sessionId) : undefined;
      if (fin) finsDeSession.push(fin);
    }
    const input: EcheanceInput = {
      sentAt: trace.sentAt,
      createdAt: trace.createdAt,
      finsDeSession,
    };
    if (calculerEcheanceConservation(input).getTime() <= now.getTime()) {
      aSupprimer.push(trace.id);
    }
  }

  if (aSupprimer.length > 0 && !dryRun) {
    await prisma.emailMessage.deleteMany({ where: { id: { in: aSupprimer } } });
  }

  return { examinees: traces.length, supprimees: aSupprimer.length, dryRun };
}

/**
 * Purge des comptes rendus de rendez-vous arrivés à échéance (spec §6.4).
 *
 * Ce que la purge efface : le TEXTE, et lui seul. Les réponses qui en ont été
 * tirées restent — elles ont été relues et confirmées par un humain, elles
 * appartiennent au diagnostic, pas à la conversation. C'est exactement la
 * frontière que la spec trace : « le transcript n'est jamais public, jamais
 * dans le rapport client, purgé à J+90 ».
 *
 * On garde `prefillAt` et `prefillModel` : savoir qu'une extraction a eu lieu,
 * quand, et avec quel modèle est une donnée de traçabilité — pas une donnée
 * personnelle. Un contrôle Qualiopi peut la demander longtemps après.
 */

import { prisma } from '@qualiof/db';

import { transcriptEchu } from './retention';

export interface PurgeTranscriptsResult {
  examines: number;
  purges: number;
  dryRun: boolean;
}

export async function purgeExpiredTranscripts(
  options: { now?: Date; dryRun?: boolean; jours?: number } = {},
): Promise<PurgeTranscriptsResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;

  // On ne charge pas les textes — ils pèsent des centaines de kilo-octets et
  // on n'a besoin que des dates pour décider.
  const candidats = await prisma.diagnostic.findMany({
    where: { transcriptText: { not: null } },
    select: { id: true, meetingAt: true, prefillAt: true, createdAt: true },
  });
  if (candidats.length === 0) return { examines: 0, purges: 0, dryRun };

  const echus = candidats.filter((d) => transcriptEchu(d, now, options.jours));
  if (echus.length === 0 || dryRun) {
    return { examines: candidats.length, purges: echus.length, dryRun };
  }

  const r = await prisma.diagnostic.updateMany({
    where: { id: { in: echus.map((d) => d.id) } },
    data: { transcriptText: null },
  });

  return { examines: candidats.length, purges: r.count, dryRun };
}

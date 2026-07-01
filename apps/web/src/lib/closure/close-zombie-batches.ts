/**
 * Prédicat PUR de détection des ClosureBatch « zombies » + calcul du statut final.
 *
 * Un batch reste en RUNNING/PENDING indéfiniment si le worker a été tué entre
 * deux jobs (Ollama timeout, kill -9, reboot Mac) : la transition finale
 * (bumpAndFinalize, worker.ts) n'a jamais eu lieu et le batch continue de
 * s'afficher « en cours » (les « packs en cours » fantômes de la fiche session).
 *
 * ⚠️ WORKER-SAFE : ce module n'importe QUE des types Prisma (aucune dépendance
 * d'auth ni de rendu côté serveur) — il doit pouvoir être chargé depuis un
 * script tsx / le worker sans faire planter le boot (cf. discipline projet).
 * Les fonctions sont PURES : aucune I/O, tout est passé en argument.
 *
 * Critère de zombie sûr (15-RESEARCH Q6) : ne casse JAMAIS un batch réellement
 * actif — un job encore QUEUED/PROCESSING récent protège son batch.
 */

import type { ClosureBatchStatus, ClosureJobStatus } from '@qualiof/db';

/** Seuil d'inactivité (min), aligné sur STUCK_PROCESSING_MINUTES du worker/requeue. */
export const STALE_MINUTES = 15;

/** Sous-ensemble minimal d'un ClosureBatch nécessaire au prédicat. */
export type ZombieBatchInput = {
  id: string;
  status: ClosureBatchStatus;
  totalDocs: number;
  doneDocs: number;
  errorDocs: number;
  startedAt: Date | null;
  updatedAt: Date | null;
};

/** Sous-ensemble minimal d'un ClosureJob nécessaire au prédicat. */
export type ZombieJobInput = {
  status: ClosureJobStatus;
  startedAt: Date | null;
  updatedAt: Date | null;
};

/** Statuts « non terminaux » : seuls ces batches peuvent être des zombies. */
const OPEN_BATCH_STATUSES: ReadonlyArray<ClosureBatchStatus> = ['PENDING', 'RUNNING'];

/** Statuts d'un job encore « vivant » (en attente ou en traitement). */
const ACTIVE_JOB_STATUSES: ReadonlyArray<ClosureJobStatus> = ['QUEUED', 'PROCESSING'];

/** Timestamp le plus récent connu d'une entité (updatedAt sinon startedAt). */
function lastActivity(entity: { startedAt: Date | null; updatedAt: Date | null }): number | null {
  const ts = entity.updatedAt ?? entity.startedAt;
  return ts ? ts.getTime() : null;
}

/**
 * Un batch est zombie si :
 *   1. son statut est encore ouvert (PENDING/RUNNING),
 *   2. sa dernière activité connue est antérieure à `now - STALE_MINUTES`
 *      (ou totalement inconnue : batch jamais démarré et abandonné),
 *   3. AUCUN de ses jobs n'est en QUEUED/PROCESSING avec une activité récente
 *      (< STALE_MINUTES) — sinon le batch est réellement en cours, on n'y touche pas.
 */
export function isZombieBatch(
  batch: ZombieBatchInput,
  jobs: ReadonlyArray<ZombieJobInput>,
  now: Date,
): boolean {
  if (!OPEN_BATCH_STATUSES.includes(batch.status)) return false;

  const cutoff = now.getTime() - STALE_MINUTES * 60 * 1000;

  // Le batch lui-même doit être stale (dernière activité < cutoff, ou inconnue).
  const batchTs = lastActivity(batch);
  if (batchTs !== null && batchTs >= cutoff) return false;

  // Aucun job actif récent ne doit protéger le batch.
  const hasRecentActiveJob = jobs.some((j) => {
    if (!ACTIVE_JOB_STATUSES.includes(j.status)) return false;
    const jobTs = lastActivity(j);
    // Un job actif sans timestamp connu est considéré récent par prudence
    // (on préfère NE PAS clore un batch dont un job pourrait encore tourner).
    return jobTs === null || jobTs >= cutoff;
  });

  return !hasRecentActiveJob;
}

/**
 * Statut terminal à appliquer à un batch zombie, calqué sur la finalisation
 * du worker : aucune erreur → COMPLETED ; aucun succès → FAILED ; sinon PARTIAL.
 */
export function finalStatusFor(
  batch: Pick<ZombieBatchInput, 'doneDocs' | 'errorDocs'>,
): Extract<ClosureBatchStatus, 'COMPLETED' | 'PARTIAL' | 'FAILED'> {
  if (batch.errorDocs === 0) return 'COMPLETED';
  if (batch.doneDocs === 0) return 'FAILED';
  return 'PARTIAL';
}

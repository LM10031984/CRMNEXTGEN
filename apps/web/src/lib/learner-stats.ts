/**
 * Phase 9.1 Plan 09.1-04 — Helpers purs `learner-stats`.
 *
 * 3 fonctions stateless utilisées par la fiche apprenant refondue :
 *  - `groupParticipationsByYear` : Map<year, sessions[]> triée desc + intra-année desc startDate
 *  - `computeLearnerHours`       : somme `product.durationHours`, filtrable par année
 *  - `detectLearnerAlerts`       : compte docs manquants (via `deriveCellState` Plan 01) + paiements pending
 *
 * Aucun IO, aucun import Prisma — testable sans mock BDD.
 *
 * Cf. PLAN.md §<behavior> + UI-SPEC §"Surface 2 — Fiche apprenant".
 */

import type { DocStatusMap } from '@qualiof/shared';
import { deriveCellState } from './derive-cell-state';
import { MATRIX_DOC_TYPES } from './doc-scope';

/**
 * Forme minimale d'une participation utilisée par les helpers.
 *
 * Le typage est volontairement structurel (et non Prisma `SessionParticipant`)
 * pour rester réutilisable côté tests sans pull du client Prisma.
 *
 * Le `docStatus` est typé `DocStatusMap | unknown` côté caller (Prisma renvoie `Json`),
 * casté en interne via la même tolérance que `deriveCellState`.
 */
export interface ParticipationForStats {
  id: string;
  paymentStatus?: string | null;
  docStatus: DocStatusMap | Record<string, unknown> | null | undefined;
  session: {
    id: string;
    startDate: Date | string;
    product: {
      durationHours: number;
      title: string;
    };
  };
}

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

/**
 * Regroupe les participations par année (basée sur `session.startDate`).
 *
 * Sort key :
 *  - Années : desc (2026 avant 2025).
 *  - Intra-année : desc startDate (session la plus récente en premier).
 *
 * Sessions traversant l'année (déc → janv) → assigné à l'année du `startDate`.
 */
export function groupParticipationsByYear<T extends ParticipationForStats>(
  participations: ReadonlyArray<T>,
): Map<number, T[]> {
  const byYear = new Map<number, T[]>();
  for (const p of participations) {
    const y = toDate(p.session.startDate).getFullYear();
    const arr = byYear.get(y) ?? [];
    arr.push(p);
    byYear.set(y, arr);
  }
  // Tri intra-année desc startDate
  for (const arr of byYear.values()) {
    arr.sort(
      (a, b) =>
        toDate(b.session.startDate).getTime() -
        toDate(a.session.startDate).getTime(),
    );
  }
  // Tri années desc
  return new Map(
    [...byYear.entries()].sort((a, b) => b[0] - a[0]),
  );
}

/**
 * Somme les `product.durationHours` pour les participations données.
 * Si `year` fourni, filtre uniquement les participations dont
 * `session.startDate.getFullYear() === year`.
 */
export function computeLearnerHours(
  participations: ReadonlyArray<ParticipationForStats>,
  year?: number,
): number {
  return participations
    .filter((p) => {
      if (year === undefined) return true;
      return toDate(p.session.startDate).getFullYear() === year;
    })
    .reduce((sum, p) => sum + (p.session.product?.durationHours ?? 0), 0);
}

/**
 * Compte les docs Qualiopi manquants + paiements en attente pour l'apprenant.
 *
 * Réutilise `deriveCellState` (Plan 01) itéré sur `MATRIX_DOC_TYPES` pour chaque
 * participation — la cellule "MISSING" alimente `missingDocsCount`.
 *
 * Les maps sont indexées par identifiant pertinent :
 *   - `productDocsBySid`        : sessionId → (docType → { id })
 *   - `sessionDocsBySid`        : sessionId → (docType → { id })
 *   - `participantDocsByPid`    : participationId → (docType → { id })
 *   - `pedAssetsByPid`          : participationId → (docType → { id })
 *
 * Le caller (page.tsx) construit ces maps via 4 requêtes Prisma `findMany` en bulk.
 *
 * `pendingPaymentsCount` = nombre de participations avec `paymentStatus === 'PENDING'`.
 */
export function detectLearnerAlerts(
  participations: ReadonlyArray<ParticipationForStats>,
  productDocsBySid: ReadonlyMap<string, Map<string, { id: string }>>,
  sessionDocsBySid: ReadonlyMap<string, Map<string, { id: string }>>,
  participantDocsByPid: ReadonlyMap<string, Map<string, { id: string }>>,
  pedAssetsByPid: ReadonlyMap<string, Map<string, { id: string }>>,
): { missingDocsCount: number; pendingPaymentsCount: number } {
  let missing = 0;
  let pending = 0;
  for (const p of participations) {
    if (p.paymentStatus === 'PENDING') pending++;

    const participantDocs =
      participantDocsByPid.get(p.id) ?? new Map<string, { id: string }>();
    const productDocs =
      productDocsBySid.get(p.session.id) ?? new Map<string, { id: string }>();
    const sessionDocs =
      sessionDocsBySid.get(p.session.id) ?? new Map<string, { id: string }>();
    const pedAssets =
      pedAssetsByPid.get(p.id) ?? new Map<string, { id: string }>();

    for (const docType of MATRIX_DOC_TYPES) {
      const cell = deriveCellState(
        docType,
        { docStatus: (p.docStatus as DocStatusMap | null | undefined) ?? null },
        participantDocs,
        productDocs,
        sessionDocs,
        pedAssets,
      );
      if (cell.state === 'MISSING') missing++;
    }
  }
  return { missingDocsCount: missing, pendingPaymentsCount: pending };
}

/**
 * Trouve l'ID de la première participation (la plus récente) où l'apprenant
 * a au moins un doc MISSING. Sert d'ancre au CTA du bandeau alerte.
 *
 * Si toutes les sessions sont complètes, retourne `undefined`.
 *
 * Convention de tri : on parcourt les participations dans l'ordre fourni
 * (le caller passe généralement `participations` triée desc par startDate).
 */
export function findFirstIncompleteSessionId(
  participations: ReadonlyArray<ParticipationForStats>,
  productDocsBySid: ReadonlyMap<string, Map<string, { id: string }>>,
  sessionDocsBySid: ReadonlyMap<string, Map<string, { id: string }>>,
  participantDocsByPid: ReadonlyMap<string, Map<string, { id: string }>>,
  pedAssetsByPid: ReadonlyMap<string, Map<string, { id: string }>>,
): string | undefined {
  for (const p of participations) {
    const participantDocs =
      participantDocsByPid.get(p.id) ?? new Map<string, { id: string }>();
    const productDocs =
      productDocsBySid.get(p.session.id) ?? new Map<string, { id: string }>();
    const sessionDocs =
      sessionDocsBySid.get(p.session.id) ?? new Map<string, { id: string }>();
    const pedAssets =
      pedAssetsByPid.get(p.id) ?? new Map<string, { id: string }>();
    for (const docType of MATRIX_DOC_TYPES) {
      const cell = deriveCellState(
        docType,
        { docStatus: (p.docStatus as DocStatusMap | null | undefined) ?? null },
        participantDocs,
        productDocs,
        sessionDocs,
        pedAssets,
      );
      if (cell.state === 'MISSING') {
        return p.session.id;
      }
    }
  }
  return undefined;
}

/**
 * Compte les docs remplis (NOT MISSING) pour une participation donnée — utilisé
 * par `TimelineSessionCard` pour le ratio `●●●○○ N/M docs Qualiopi`.
 *
 * Renvoie un nombre entre 0 et `MATRIX_DOC_TYPES.length`.
 */
export function countParticipationFilledDocs(
  p: ParticipationForStats,
  productDocsBySid: ReadonlyMap<string, Map<string, { id: string }>>,
  sessionDocsBySid: ReadonlyMap<string, Map<string, { id: string }>>,
  participantDocsByPid: ReadonlyMap<string, Map<string, { id: string }>>,
  pedAssetsByPid: ReadonlyMap<string, Map<string, { id: string }>>,
): number {
  const participantDocs =
    participantDocsByPid.get(p.id) ?? new Map<string, { id: string }>();
  const productDocs =
    productDocsBySid.get(p.session.id) ?? new Map<string, { id: string }>();
  const sessionDocs =
    sessionDocsBySid.get(p.session.id) ?? new Map<string, { id: string }>();
  const pedAssets =
    pedAssetsByPid.get(p.id) ?? new Map<string, { id: string }>();
  let filled = 0;
  for (const docType of MATRIX_DOC_TYPES) {
    const cell = deriveCellState(
      docType,
      { docStatus: (p.docStatus as DocStatusMap | null | undefined) ?? null },
      participantDocs,
      productDocs,
      sessionDocs,
      pedAssets,
    );
    if (cell.state !== 'MISSING') filled++;
  }
  return filled;
}

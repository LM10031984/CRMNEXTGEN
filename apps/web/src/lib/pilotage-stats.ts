/**
 * Pilotage Direction — CA réalisé vs objectif (quick 260620-d42).
 *
 * Cette lib contient DEUX couches :
 *  1. Helpers PURS (cette section) — 100 % déterministes, ZÉRO I/O, testés en
 *     isolation (`__tests__/pilotage-stats.test.ts`). Répartition saisonnière de
 *     l'objectif annuel, KPIs, agrégation mensuelle.
 *  2. Fetch scopés `tenantId` (Task 3) — I/O Prisma. Le scope multi-tenant est
 *     délégué aux requêtes (SessionParticipant N'A PAS de colonne tenantId :
 *     on scope via `session: { tenantId }`, cf. `product-stats.ts`).
 *
 * Money : tout est en euros HT (number) AVANT d'arriver dans les helpers purs.
 * La conversion Decimal Prisma -> Number(decimal) est faite dans la couche fetch.
 * Pas de RBAC ici (caller responsable, comme `product-stats.ts`).
 */

import { prisma } from '@qualiof/db';

// ───────────────────────────────────────────────────────────────────────────
// 1. Helpers PURS (testables sans DB)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Répartit un objectif annuel sur 12 mois selon des poids de saisonnalité.
 *
 * - Si `monthlyWeights` n'a pas exactement 12 éléments OU si la somme des poids
 *   est nulle => fallback : répartition uniforme (poids effectifs = [1,…,1]).
 * - Chaque mois est arrondi (`Math.round`) ; le résidu d'arrondi
 *   (`annual - sum(arrondis)`) est ajouté au DERNIER mois afin que la somme des
 *   12 entiers retournés soit EXACTEMENT égale à `annual`.
 *
 * @returns un tableau de 12 entiers dont la somme === `annual`.
 */
export function distributeAnnualObjective(
  annual: number,
  monthlyWeights: number[],
): number[] {
  const validLength = monthlyWeights.length === 12;
  const sumWeights = validLength
    ? monthlyWeights.reduce((acc, w) => acc + w, 0)
    : 0;

  const effectiveWeights =
    validLength && sumWeights > 0 ? monthlyWeights : Array(12).fill(1);
  const totalWeight = effectiveWeights.reduce((acc, w) => acc + w, 0);

  const rounded = effectiveWeights.map((w) =>
    Math.round((annual * (w ?? 0)) / totalWeight),
  );

  const residu = annual - rounded.reduce((acc, m) => acc + m, 0);
  rounded[11] = (rounded[11] ?? 0) + residu;

  return rounded;
}

/**
 * Calcule les poids de saisonnalité (part de CA par mois) à partir des CA
 * mensuels historiques de plusieurs années.
 *
 * Somme position par position des sous-tableaux, puis normalise par le total
 * global (`weight_i = total_mois_i / total_global`).
 *
 * - 0 année fournie OU total global nul => `Array(12).fill(0)` (pas de div/0).
 *
 * @param monthlyTotalsByYear chaque sous-tableau doit avoir 12 entrées (un par mois).
 * @returns 12 poids normalisés (somme = 1 si données présentes, sinon 0).
 */
export function computeSeasonalityWeights(
  monthlyTotalsByYear: number[][],
): number[] {
  const totals = Array(12).fill(0) as number[];
  for (const year of monthlyTotalsByYear) {
    for (let i = 0; i < 12; i++) {
      totals[i] = (totals[i] ?? 0) + (year[i] ?? 0);
    }
  }

  const global = totals.reduce((acc, t) => acc + t, 0);
  if (global === 0) return Array(12).fill(0);

  return totals.map((t) => t / global);
}

/**
 * Pourcentage d'atteinte de l'objectif (arrondi). `(0,0)` => `0` (pas de div/0).
 */
export function pctAtteint(realiseYTD: number, objectifAnnuel: number): number {
  if (objectifAnnuel === 0) return 0;
  return Math.round((realiseYTD / objectifAnnuel) * 100);
}

export interface PilotageKpisInput {
  /** CA réalisé par mois (12 entrées, EUR HT). */
  realiseMonthly: number[];
  /** CA prévisionnel (signé non terminé) par mois (12 entrées, EUR HT). */
  previsionnelMonthly: number[];
  /** Objectif annuel (EUR HT). */
  objectifAnnuel: number;
  /** CA total réalisé de l'année N-1 (EUR HT). */
  totalRealiseN1: number;
}

export interface PilotageKpis {
  /** Somme du réalisé mensuel (year-to-date). */
  caRealiseYTD: number;
  /** Rappel de l'objectif annuel. */
  objectifAnnuel: number;
  /** % d'atteinte de l'objectif (arrondi). */
  pctAtteint: number;
  /** Somme du prévisionnel restant. */
  previsionnelRestant: number;
  /** Atterrissage estimé = réalisé YTD + prévisionnel restant. */
  atterrissageEstime: number;
  /** Écart vs objectif = atterrissage - objectif (négatif = sous-objectif). */
  ecartVsObjectif: number;
  /** Rappel du CA total N-1. */
  totalRealiseN1: number;
}

/**
 * Calcule les KPIs de pilotage à partir des séries mensuelles et de l'objectif.
 */
export function computeKpis(input: PilotageKpisInput): PilotageKpis {
  const caRealiseYTD = input.realiseMonthly.reduce((acc, m) => acc + m, 0);
  const previsionnelRestant = input.previsionnelMonthly.reduce(
    (acc, m) => acc + m,
    0,
  );
  const atterrissageEstime = caRealiseYTD + previsionnelRestant;

  return {
    caRealiseYTD,
    objectifAnnuel: input.objectifAnnuel,
    pctAtteint: pctAtteint(caRealiseYTD, input.objectifAnnuel),
    previsionnelRestant,
    atterrissageEstime,
    ecartVsObjectif: atterrissageEstime - input.objectifAnnuel,
    totalRealiseN1: input.totalRealiseN1,
  };
}

/**
 * Agrège des lignes `{ startDate, priceHT }` en 12 buckets mensuels.
 *
 * Bucketise par `getUTCMonth()` (cohérence avec les bornes d'année UTC utilisées
 * dans la couche fetch — stockage DateTime UTC).
 *
 * @returns 12 entrées (EUR HT), une par mois.
 */
export function aggregateMonthly(
  rows: { startDate: Date; priceHT: number }[],
): number[] {
  const buckets = Array(12).fill(0) as number[];
  for (const row of rows) {
    const idx = row.startDate.getUTCMonth();
    buckets[idx] = (buckets[idx] ?? 0) + row.priceHT;
  }
  return buckets;
}

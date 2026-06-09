/**
 * Phase 9.1 Plan 09.1-05 Task 1 — Helpers purs de calcul des stats fiche produit
 * (CENTRAL-04 + CENTRAL-05).
 *
 * Pas de RBAC ici (caller responsable) ; `tenantId` est injecté obligatoirement
 * pour scope multi-tenant (pattern Phase 8 D-09 + Phase 9 `lead-load-stats.ts`).
 *
 * 3 helpers exposés :
 *  - `getProductStats(productId, tenantId)` → 4 KPI pour les PrioCard du tab Stats
 *      + `firstYear` pour le sub `depuis {firstYear}` (UI-SPEC §Copywriting Surface 3)
 *  - `listProductSessions(productId, tenantId)` → liste sessions triée DESC startDate (cross-nav D-05)
 *  - `listProductLearners(productId, tenantId)` → liste apprenants DISTINCT + sessionsCount (cross-nav D-05)
 *
 * Performance : `getProductStats` fait 5 requêtes en `Promise.all` (pas de N+1).
 *
 * Pitfalls évités :
 *  - Invoice n'a pas de FK directe `sessionId` qualifiée → on traverse via
 *    `participant.session.productId` (cf. schema.prisma L737-769).
 *  - `_sum.amountHT` peut être `null` (aucune facture) → fallback `?? 0`.
 *  - Decimal Prisma → `Number(decimal)` (Decimal.js sinon traîné côté UI).
 */

import { prisma } from '@qualiof/db';

export interface ProductStats {
  /** Nombre de sessions terminées (status='COMPLETED') pour ce produit. */
  sessionsRealisees: number;
  /** Nombre d'apprenants DISTINCTS ayant suivi au moins 1 session de ce produit. */
  apprenantsFormesTotal: number;
  /** Heures totales délivrées = sessionsRealisees × product.durationHours. */
  heuresTotales: number;
  /** CA cumulé HT (somme des factures PAID liées via participant.session). En EUR. */
  caCumule: number;
  /** Année de la 1re session jamais créée pour ce produit (ou année courante si aucune). */
  firstYear: number;
}

export interface ProductSessionRow {
  id: string;
  code: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
  participantsCount: number;
}

export interface ProductLearnerRow {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  sessionsCount: number;
  lastSessionDate: Date | null;
}

/**
 * 4 KPI agrégés pour le tab Stats de la fiche produit.
 *
 * Toutes les requêtes sont scope `tenantId` (cross-tenant safety) et lancées
 * en parallèle (5 round-trips compressés en 1 logique de timing).
 */
export async function getProductStats(
  productId: string,
  tenantId: string,
): Promise<ProductStats> {
  const [sessionsCompleted, distinctLearners, sumInvoices, firstSession, product] =
    await Promise.all([
      prisma.trainingSession.count({
        where: { tenantId, productId, status: 'COMPLETED' },
      }),
      // DISTINCT personId scopé par tenantId + productId via la relation session.
      prisma.sessionParticipant.findMany({
        where: { session: { tenantId, productId } },
        select: { personId: true },
        distinct: ['personId'],
      }),
      // CA HT = sum SessionParticipant.priceHT (= prix négocié, indépendant
      // du statut Invoice). Audit 2026-05-23 : avant, on lisait Invoice.amountHT
      // PAID — mais peu d'Invoices sont PAID en BDD, donc CA toujours à 0 alors
      // que les SP ont leurs prix corrects (et alignés Tréso AGEFICE qui est
      // source de vérité encaissement). Cf project_session_23_05_2026_smartof.
      prisma.sessionParticipant.aggregate({
        _sum: { priceHT: true },
        where: {
          session: { tenantId, productId },
        },
      }),
      prisma.trainingSession.findFirst({
        where: { tenantId, productId },
        orderBy: { startDate: 'asc' },
        select: { startDate: true },
      }),
      prisma.trainingProduct.findUnique({
        where: { id: productId },
        select: { durationHours: true },
      }),
    ]);

  const sumHT = sumInvoices?._sum?.priceHT;
  return {
    sessionsRealisees: sessionsCompleted,
    apprenantsFormesTotal: distinctLearners.length,
    heuresTotales: sessionsCompleted * (product?.durationHours ?? 0),
    caCumule: sumHT != null ? Number(sumHT) : 0,
    firstYear: firstSession?.startDate
      ? new Date(firstSession.startDate).getFullYear()
      : new Date().getFullYear(),
  };
}

/**
 * Liste des sessions de ce produit, triée DESC startDate.
 * Chaque ligne est cliquable vers `/app/sessions/{id}` côté UI (D-05 cross-nav).
 */
export async function listProductSessions(
  productId: string,
  tenantId: string,
): Promise<ProductSessionRow[]> {
  const sessions = await prisma.trainingSession.findMany({
    where: { tenantId, productId },
    select: {
      id: true,
      code: true,
      startDate: true,
      endDate: true,
      status: true,
      _count: { select: { participants: true } },
    },
    orderBy: { startDate: 'desc' },
  });
  return sessions.map((s) => ({
    id: s.id,
    code: s.code,
    startDate: s.startDate,
    endDate: s.endDate ?? null,
    status: s.status as string,
    participantsCount: s._count?.participants ?? 0,
  }));
}

/**
 * Liste DISTINCTE des apprenants ayant suivi ce produit, triée DESC lastSessionDate.
 * Chaque ligne est cliquable vers `/app/apprenants/{personId}` côté UI (D-05 cross-nav).
 *
 * Implé : groupBy personId pour récupérer count + max(createdAt), puis hydrate
 * via une 2e requête `person.findMany({ id: { in: personIds } })`. Les personIds
 * introuvables (cas dégradé : person supprimé / autre tenant) sont silencieusement
 * exclus.
 */
export async function listProductLearners(
  productId: string,
  tenantId: string,
): Promise<ProductLearnerRow[]> {
  const raw = await prisma.sessionParticipant.groupBy({
    by: ['personId'],
    where: { session: { tenantId, productId } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  if (raw.length === 0) return [];

  const persons = await prisma.person.findMany({
    where: { id: { in: raw.map((r) => r.personId) }, tenantId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const personMap = new Map(persons.map((p) => [p.id, p]));

  return raw
    .map((r) => {
      const p = personMap.get(r.personId);
      if (!p) return null;
      return {
        personId: r.personId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        sessionsCount: r._count?._all ?? 0,
        lastSessionDate: r._max?.createdAt ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort(
      (a, b) =>
        (b.lastSessionDate?.getTime() ?? 0) - (a.lastSessionDate?.getTime() ?? 0),
    );
}

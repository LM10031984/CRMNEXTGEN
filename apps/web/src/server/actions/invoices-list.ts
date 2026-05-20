'use server';

/**
 * Phase 11 Plan 11-08 Task 1 — Helper data fetching pour la page `/app/factures` (FACT-01).
 *
 * Source unique des 4 KPI métier (D-05 CONTEXT.md Phase 11) + rows paginées + total.
 *
 * KPI calculés :
 *  1. `caMois`         = SUM(amountTTC) WHERE status ∈ {ISSUED, PAID, PARTIAL}
 *                        AND issueDate dans le mois courant (scope tenantId)
 *  2. `impayesAmount`  = SUM(amountTTC - amountPaid) WHERE status ∈ {ISSUED, PARTIAL, OVERDUE}
 *  3. `impayesCount`   = COUNT des mêmes
 *  4. `dsoMoyen`       = AVG(paidAt - issueDate) en jours pour les PAID du mois (raw query
 *                        Postgres `EXTRACT(EPOCH FROM ...) / 86400`) — null si aucune.
 *  5. `aFacturerCount` = COUNT SessionParticipant.enrollmentStatus='ATTENDED' sans Invoice liée
 *                        (équivalent métier "formation terminée" — l'enum Prisma n'a pas
 *                        COMPLETED ; cf. pattern Phase 6 product-satisfaction-panel.tsx
 *                        et lib/qualiopi-bilan-stats.ts).
 *
 * Filtres supportés (D-06) :
 *  - `statuses` multi
 *  - `from`/`to` sur issueDate
 *  - `payerOrgId` exact match
 *  - `onlyUnpaid` override → force statuses = ISSUED+PARTIAL+OVERDUE
 *
 * Tri par défaut (D-Discretion) : `[{ issueDate: 'desc' }, { number: 'desc' }]`.
 *
 * RBAC :
 *  - `validateRequest()` pour scope tenantId multi-tenant.
 *  - Soft-fail si pas authentifié → retour vide (la page Server Component fait redirect).
 *  - RBAC fin (FORMATEUR sessions only / COMMERCIAL own only — D-19) sera assuré
 *    par la page Server Component qui passera le filtre adéquat, pas par ce helper.
 */

import { prisma } from '@qualiof/db';
import type { InvoiceStatus } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export interface InvoicesListFilters {
  statuses?: InvoiceStatus[];
  from?: Date;
  to?: Date;
  payerOrgId?: string;
  onlyUnpaid?: boolean;
}

export interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  issueDate: Date | null;
  amountTtc: number;
  amountPaid: number;
  payerLabel: string;
  isAvoir: boolean;
  originalInvoiceId: string | null;
  originalNumber: string | null;
  lastReminderAt: Date | null;
  reminderCount: number;
}

export interface InvoicesListKpis {
  caMois: number;
  impayesAmount: number;
  impayesCount: number;
  dsoMoyen: number | null;
  aFacturerCount: number;
}

// Cast `as never` : les chaînes brutes sont des littéraux InvoiceStatus mais
// TypeScript ne dérive pas l'union depuis un `as const` ici (interop avec
// Prisma generated types). Cohérent avec le pattern utilisé dans le worker
// `invoice-reminders/worker.ts`.
const UNPAID_STATUSES: InvoiceStatus[] = ['ISSUED', 'PARTIAL', 'OVERDUE'] as never;
const REVENUE_STATUSES: InvoiceStatus[] = ['ISSUED', 'PAID', 'PARTIAL'] as never;

function startOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export async function getInvoicesListData(input: {
  filters: InvoicesListFilters;
  page: number;
  pageSize: number;
}): Promise<{ kpis: InvoicesListKpis; rows: InvoiceRow[]; total: number }> {
  const { user } = await validateRequest();
  if (!user) {
    return {
      kpis: {
        caMois: 0,
        impayesAmount: 0,
        impayesCount: 0,
        dsoMoyen: null,
        aFacturerCount: 0,
      },
      rows: [],
      total: 0,
    };
  }

  const tenantId = user.tenantId;
  const monthStart = startOfCurrentMonth();
  const monthEnd = endOfCurrentMonth();

  // Build WHERE pour la list query (factures affichées)
  const filters = input.filters;
  const effectiveStatuses = filters.onlyUnpaid
    ? UNPAID_STATUSES
    : filters.statuses ?? undefined;
  const baseWhere: Record<string, unknown> = { tenantId };
  if (effectiveStatuses) baseWhere.status = { in: effectiveStatuses };
  if (filters.from || filters.to) {
    const dateRange: Record<string, Date> = {};
    if (filters.from) dateRange.gte = filters.from;
    if (filters.to) dateRange.lte = filters.to;
    baseWhere.issueDate = dateRange;
  }
  if (filters.payerOrgId) baseWhere.payerOrgId = filters.payerOrgId;

  // Promise.all : 6 queries parallèles (4 KPI + rows + total).
  const [caMoisAgg, impayesAgg, dsoRaw, aFacturerCount, rows, total] = await Promise.all([
    // KPI 1 : CA facturé du mois
    prisma.invoice.aggregate({
      where: {
        tenantId,
        status: { in: REVENUE_STATUSES },
        issueDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amountTTC: true },
    }),
    // KPI 2+3 : Impayés (somme + count)
    prisma.invoice.aggregate({
      where: { tenantId, status: { in: UNPAID_STATUSES } },
      _sum: { amountTTC: true, amountPaid: true },
      _count: { _all: true },
    }),
    // KPI 4 : DSO moyen — raw query Postgres AVG(paidAt - issueDate) en jours.
    prisma.$queryRaw<Array<{ avg_days: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("paidAt" - "issueDate")) / 86400.0)::float AS avg_days
      FROM "Invoice"
      WHERE "tenantId" = ${tenantId}
        AND "status" = 'PAID'
        AND "paidAt" IS NOT NULL
        AND "paidAt" BETWEEN ${monthStart} AND ${monthEnd}
    `,
    // KPI 5 : SessionParticipant ATTENDED sans Invoice liée
    prisma.sessionParticipant.count({
      where: {
        session: { tenantId },
        enrollmentStatus: 'ATTENDED',
        invoices: { none: {} },
      },
    }),
    // Rows paginées (avec relations pour map)
    prisma.invoice.findMany({
      where: baseWhere as never,
      include: {
        payerOrg: { select: { legalName: true } },
        participant: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
        originalInvoice: { select: { id: true, number: true } },
      },
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    // Total pour pagination UI
    prisma.invoice.count({ where: baseWhere as never }),
  ]);

  const impayesAmountTtc = Number(impayesAgg._sum?.amountTTC ?? 0);
  const impayesPaid = Number(impayesAgg._sum?.amountPaid ?? 0);
  const impayesAmount = impayesAmountTtc - impayesPaid;
  const dsoAvg = dsoRaw[0]?.avg_days;
  const dsoMoyen = dsoAvg != null ? Math.round(dsoAvg) : null;

  type RowWithRelations = (typeof rows)[number] & {
    payerOrg: { legalName: string } | null;
    participant:
      | {
          person: { firstName: string; lastName: string } | null;
        }
      | null;
    originalInvoice: { id: string; number: string } | null;
  };

  const formattedRows: InvoiceRow[] = (rows as RowWithRelations[]).map((inv) => {
    const personLabel = inv.participant?.person
      ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
      : null;
    return {
      id: inv.id,
      number: inv.number,
      status: String(inv.status),
      issueDate: inv.issueDate,
      amountTtc: Number(inv.amountTTC),
      amountPaid: Number(inv.amountPaid),
      payerLabel: inv.payerOrg?.legalName ?? personLabel ?? '—',
      isAvoir: inv.status === 'CREDIT_NOTE',
      originalInvoiceId: inv.originalInvoiceId,
      originalNumber: inv.originalInvoice?.number ?? null,
      lastReminderAt: inv.lastReminderAt,
      reminderCount: inv.reminderCount,
    };
  });

  return {
    kpis: {
      caMois: Number(caMoisAgg._sum?.amountTTC ?? 0),
      impayesAmount,
      impayesCount: impayesAgg._count?._all ?? 0,
      dsoMoyen,
      aFacturerCount,
    },
    rows: formattedRows,
    total,
  };
}

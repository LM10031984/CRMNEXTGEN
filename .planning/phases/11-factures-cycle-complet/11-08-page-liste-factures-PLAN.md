---
phase: 11-factures-cycle-complet
plan: 08
type: execute
wave: 3
depends_on:
  - "11-02"
  - "11-05"
  - "11-06"
  - "11-07"
files_modified:
  - apps/web/src/app/app/factures/page.tsx
  - apps/web/src/app/app/factures/__tests__/page.smoke.test.ts
  - apps/web/src/components/invoices/invoices-prio-cards.tsx
  - apps/web/src/components/invoices/invoices-filters.tsx
  - apps/web/src/components/invoices/invoices-list-table.tsx
  - apps/web/src/components/invoices/invoices-export-button.tsx
  - apps/web/src/server/actions/invoices-list.ts
  - apps/web/src/server/actions/__tests__/invoices-list.test.ts
  - apps/web/src/server/actions/invoices.ts
  - apps/web/src/server/actions/__tests__/invoices-audit.test.ts
autonomous: true
requirements:
  - FACT-01
must_haves:
  truths:
    - "Page /app/factures REMPLACE le placeholder par une vraie liste avec 4 PrioCard + filtres + table."
    - "Tri par défaut issueDate DESC, number DESC (D-Discretion)."
    - "Empty states 'Aucune facture pour cette période' / 'Aucun impayé 🎉'."
    - "Bouton 'Exporter' (haut droite) link vers /api/factures/export."
    - "Bouton 'Envoyer relance' sur ligne facture impayée."
    - "Badge AVO sur lignes status=CREDIT_NOTE avec lien vers facture originale (D-07)."
    - "createInvoiceFromParticipant / createInvoiceForSponsorGroup / recordInvoicePayment émettent logInvoiceEvent (backfill FACT-01)."
  artifacts:
    - path: "apps/web/src/app/app/factures/page.tsx"
      provides: "Server Component orchestrateur (validateRequest + RBAC soft + getInvoicesListData + composition)"
      min_lines: 50
    - path: "apps/web/src/server/actions/invoices-list.ts"
      provides: "Helper getInvoicesListData (4 KPI calculés + rows + pagination)"
      exports: ["getInvoicesListData"]
    - path: "apps/web/src/components/invoices/invoices-prio-cards.tsx"
      provides: "4 PrioCardLocal D-Phase9-K (CA mois / Impayés / DSO / À facturer)"
    - path: "apps/web/src/components/invoices/invoices-filters.tsx"
      provides: "Filtres chips (Status / Période / Payeur / Type / 'Voir impayés')"
    - path: "apps/web/src/components/invoices/invoices-list-table.tsx"
      provides: "Table flat avec badges status pastilles + cross-nav Link"
    - path: "apps/web/src/components/invoices/invoices-export-button.tsx"
      provides: "Bouton 'Exporter' DropdownMenu (5 périodes prédéfinies + perso)"
  key_links:
    - from: "/app/factures"
      to: "getInvoicesListData(filters, page, pageSize)"
      via: "Server Component data fetching"
      pattern: "getInvoicesListData"
    - from: "InvoicesExportButton"
      to: "/api/factures/export"
      via: "<a href> direct download"
      pattern: "factures/export"
    - from: "InvoicesListTable row click"
      to: "/app/factures/[id]"
      via: "<Link>"
      pattern: "/app/factures/\\$"
    - from: "createInvoiceFromParticipant + recordInvoicePayment"
      to: "logInvoiceEvent (FACT-01 backfill)"
      via: "import depuis @/lib/invoice-audit"
      pattern: "logInvoiceEvent.*invoices\\."
---

<objective>
Remplacer le placeholder `/app/factures` par une vraie page d'inventaire métier (D-05..D-08, D-15..D-20) : 4 PrioCard KPI top + filtres chips combinés + table flat avec badges statuts + bouton "Exporter" haut droite + bouton "Envoyer relance" par ligne impayée + badge AVO sur avoirs avec lien vers facture origine. Backfill FACT-01 : ajouter `logInvoiceEvent` aux 3 actions existantes (createInvoiceFromParticipant / createInvoiceForSponsorGroup / recordInvoicePayment) pour respecter D-18.

Purpose: Cœur de FACT-01 (page liste). Sans cette page, Laurent ne voit qu'un placeholder vide. Le backfill ferme la dette technique des actions existantes Phase 7-02.
Output: 5 composants UI + 1 helper data fetching + 1 page Server Component + backfill 3 actions existantes + 4 suites Vitest vertes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@apps/web/src/app/app/factures/page.tsx
@apps/web/src/app/app/leads/charge/page.tsx
@apps/web/src/components/ui/filter-chips.tsx
@apps/web/src/lib/funder-codes.ts
@apps/web/src/lib/invoice-audit.ts
@apps/web/src/server/actions/invoices.ts

<interfaces>
<!-- Helper data fetching -->

```typescript
// apps/web/src/server/actions/invoices-list.ts
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

export async function getInvoicesListData(input: {
  filters: InvoicesListFilters;
  page: number;
  pageSize: number;
}): Promise<{ kpis: InvoicesListKpis; rows: InvoiceRow[]; total: number }>;
```

<!-- Status palette D-20 -->
```typescript
const STATUS_PALETTE = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-500 line-through',
  CREDIT_NOTE: 'bg-violet-100 text-violet-800',
};
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Helper getInvoicesListData (KPI + rows + pagination)</name>
  <files>apps/web/src/server/actions/invoices-list.ts, apps/web/src/server/actions/__tests__/invoices-list.test.ts</files>
  <read_first>
    - apps/web/src/lib/lead-load-stats.ts (pattern Phase 9 — Promise.all 4 queries + computation pure)
    - apps/web/src/server/actions/__tests__/invoices-list.test.ts (stub Wave 0 — 10 it.todo à remplir)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Server Actions Inventory L617-633
  </read_first>
  <behavior>
    - Test 1 : KPI `caMois` = sum(amountTtc) Invoice WHERE status ∈ {ISSUED, PAID, PARTIAL} AND issueDate dans le mois courant (scope tenantId)
    - Test 2 : KPI `impayesAmount` = sum(amountTtc - amountPaid) Invoice WHERE status ∈ {ISSUED, PARTIAL, OVERDUE}
    - Test 3 : KPI `impayesCount` = count des mêmes
    - Test 4 : KPI `dsoMoyen` = avg(paidAt - issueDate) en jours sur les Invoice status=PAID du mois (`null` si aucune)
    - Test 5 : KPI `aFacturerCount` = count SessionParticipant WHERE enrollmentStatus='COMPLETED' AND NOT EXISTS Invoice liée
    - Test 6 : Filtre `statuses` multiple appliqué dans le WHERE
    - Test 7 : Filtre `from`/`to` appliqué sur issueDate
    - Test 8 : Filtre `payerOrgId` appliqué sur invoice.payerOrgId
    - Test 9 : `onlyUnpaid=true` → statuses = ISSUED + PARTIAL + OVERDUE (override)
    - Test 10 : Tri par défaut `[{ issueDate: 'desc' }, { number: 'desc' }]`
    - Test 11 : Pagination via skip/take
  </behavior>
  <action>
1. Créer `apps/web/src/server/actions/invoices-list.ts` :

```typescript
'use server';

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import type { InvoiceStatus } from '@qualiof/db';

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
      kpis: { caMois: 0, impayesAmount: 0, impayesCount: 0, dsoMoyen: null, aFacturerCount: 0 },
      rows: [],
      total: 0,
    };
  }

  const tenantId = user.tenantId;
  const monthStart = startOfCurrentMonth();
  const monthEnd = endOfCurrentMonth();

  // Build WHERE for the list query
  const filters = input.filters;
  const effectiveStatuses = filters.onlyUnpaid ? UNPAID_STATUSES : (filters.statuses ?? undefined);
  const baseWhere: Record<string, unknown> = { tenantId };
  if (effectiveStatuses) baseWhere.status = { in: effectiveStatuses };
  if (filters.from || filters.to) {
    baseWhere.issueDate = {};
    if (filters.from) (baseWhere.issueDate as Record<string, Date>).gte = filters.from;
    if (filters.to) (baseWhere.issueDate as Record<string, Date>).lte = filters.to;
  }
  if (filters.payerOrgId) baseWhere.payerOrgId = filters.payerOrgId;

  // Promise.all pour parallel queries
  const [caMoisAgg, impayesAgg, dsoRaw, aFacturerCount, rows, total] = await Promise.all([
    // KPI 1 : CA encaissable du mois
    prisma.invoice.aggregate({
      where: {
        tenantId,
        status: { in: REVENUE_STATUSES },
        issueDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amountTTC: true },
    }),
    // KPI 2 : Impayés (montant + count)
    prisma.invoice.aggregate({
      where: { tenantId, status: { in: UNPAID_STATUSES } },
      _sum: { amountTTC: true, amountPaid: true },
      _count: { _all: true },
    }),
    // KPI 3 : DSO moyen sur PAID du mois (raw query AVG(paidAt - issueDate))
    prisma.$queryRaw<Array<{ avg_days: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("paidAt" - "issueDate")) / 86400.0)::float AS avg_days
      FROM "Invoice"
      WHERE "tenantId" = ${tenantId}
        AND "status" = 'PAID'
        AND "paidAt" IS NOT NULL
        AND "paidAt" BETWEEN ${monthStart} AND ${monthEnd}
    `,
    // KPI 4 : à facturer = COMPLETED sans Invoice
    prisma.sessionParticipant.count({
      where: {
        session: { tenantId },
        enrollmentStatus: 'COMPLETED' as never,
        invoices: { none: {} },
      },
    }),
    // Rows
    prisma.invoice.findMany({
      where: baseWhere as never,
      include: {
        payerOrg: { select: { legalName: true } },
        participant: { include: { person: { select: { firstName: true, lastName: true } } } },
        originalInvoice: { select: { id: true, number: true } },
      },
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.invoice.count({ where: baseWhere as never }),
  ]);

  const impayesAmountTtc = Number(impayesAgg._sum.amountTTC ?? 0);
  const impayesPaid = Number(impayesAgg._sum.amountPaid ?? 0);
  const impayesAmount = impayesAmountTtc - impayesPaid;
  const dsoMoyen = dsoRaw[0]?.avg_days != null ? Math.round(dsoRaw[0].avg_days) : null;

  const formattedRows: InvoiceRow[] = rows.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    issueDate: inv.issueDate,
    amountTtc: Number(inv.amountTTC),
    amountPaid: Number(inv.amountPaid),
    payerLabel:
      inv.payerOrg?.legalName ??
      (inv.participant?.person
        ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
        : '—'),
    isAvoir: inv.status === 'CREDIT_NOTE',
    originalInvoiceId: inv.originalInvoiceId,
    originalNumber: inv.originalInvoice?.number ?? null,
    lastReminderAt: inv.lastReminderAt,
    reminderCount: inv.reminderCount,
  }));

  return {
    kpis: {
      caMois: Number(caMoisAgg._sum.amountTTC ?? 0),
      impayesAmount,
      impayesCount: impayesAgg._count._all,
      dsoMoyen,
      aFacturerCount,
    },
    rows: formattedRows,
    total,
  };
}
```

2. Remplacer `apps/web/src/server/actions/__tests__/invoices-list.test.ts` (stub Wave 0) avec 11 tests (cf behavior).

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-list.test.ts` → 11 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-list.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/server/actions/invoices-list.ts` existe avec `'use server'` directive (grep)
    - Exporte `getInvoicesListData` + 3 interfaces (grep)
    - 4 KPI calculés via Promise.all (grep `Promise.all`)
    - Filtre `onlyUnpaid` override `statuses` (grep `filters.onlyUnpaid ? UNPAID_STATUSES`)
    - Tri `[{ issueDate: 'desc' }, { number: 'desc' }]` (grep)
    - Pagination `skip: (input.page - 1) * input.pageSize` (grep)
    - $queryRaw pour DSO AVG (grep `EXTRACT(EPOCH FROM`)
    - 11/11 tests verts
  </acceptance_criteria>
  <done>Helper data fetching exporté, 4 KPI calculés, pagination, tri par défaut. La page Task 4 le consomme.</done>
</task>

<task type="auto">
  <name>Task 2 : 5 composants UI invoices/*</name>
  <files>apps/web/src/components/invoices/invoices-prio-cards.tsx, apps/web/src/components/invoices/invoices-filters.tsx, apps/web/src/components/invoices/invoices-list-table.tsx, apps/web/src/components/invoices/invoices-export-button.tsx</files>
  <read_first>
    - apps/web/src/app/app/leads/charge/page.tsx L100-190 (PrioCardLocal clone D-Phase9-K — pattern Phase 9)
    - apps/web/src/components/ui/filter-chips.tsx (FilterChips Phase 5 réutilisable)
    - apps/web/src/lib/funder-codes.ts (formatFunderCode Phase 6 — optionnel pour Payeur)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §UI Components L671-714
  </read_first>
  <action>
1. **`apps/web/src/components/invoices/invoices-prio-cards.tsx`** (Server Component) :

```typescript
import { TrendingUp, AlertCircle, Clock, FileText } from 'lucide-react';
import type { InvoicesListKpis } from '@/server/actions/invoices-list';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

interface Props { kpis: InvoicesListKpis }

export function InvoicesPrioCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <PrioCardLocal
        icon={<TrendingUp className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
        label="CA facturé ce mois"
        value={fmtEUR.format(kpis.caMois)}
      />
      <PrioCardLocal
        icon={<AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />}
        label="Impayés"
        value={fmtEUR.format(kpis.impayesAmount)}
        sub={`${kpis.impayesCount} facture${kpis.impayesCount > 1 ? 's' : ''}`}
      />
      <PrioCardLocal
        icon={<Clock className="h-5 w-5 text-sky-600" aria-hidden="true" />}
        label="DSO moyen"
        value={kpis.dsoMoyen != null ? `${kpis.dsoMoyen} j` : '—'}
        sub="Délai moyen d'encaissement (mois)"
      />
      <PrioCardLocal
        icon={<FileText className="h-5 w-5 text-amber-600" aria-hidden="true" />}
        label="À facturer"
        value={String(kpis.aFacturerCount)}
        sub="Inscriptions complétées sans facture"
      />
    </div>
  );
}

function PrioCardLocal({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-primary-200 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
```

2. **`apps/web/src/components/invoices/invoices-filters.tsx`** (Server Component avec liens `<Link>` qui mettent à jour searchParams — pattern Phase 9.1 MatrixFilters) :

```typescript
import Link from 'next/link';

interface Props {
  filters: {
    statuses?: string[];
    period?: string;
    onlyUnpaid?: boolean;
  };
  total: number;
}

const STATUS_CHIPS = ['DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED', 'CREDIT_NOTE'];
const PERIOD_CHIPS = [
  { key: 'this-month', label: 'Ce mois' },
  { key: 'last-month', label: 'Mois dernier' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'year', label: 'Année' },
];

export function InvoicesFilters({ filters, total }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Statut :</span>
        {STATUS_CHIPS.map((s) => {
          const active = filters.statuses?.includes(s);
          return (
            <Link
              key={s}
              href={`/app/factures?${toggleQueryParam('status', s, filters.statuses ?? [])}`}
              className={`rounded-full px-3 py-1 text-xs ${active ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {s}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Période :</span>
        {PERIOD_CHIPS.map((p) => (
          <Link
            key={p.key}
            href={`/app/factures?period=${p.key}`}
            className={`rounded-full px-3 py-1 text-xs ${filters.period === p.key ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/app/factures?onlyUnpaid=${filters.onlyUnpaid ? '' : 'true'}`}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${filters.onlyUnpaid ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          {filters.onlyUnpaid ? '✓ Seuls les impayés' : 'Voir seulement impayés'}
        </Link>
        <span className="text-xs text-slate-500">{total} facture{total > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

function toggleQueryParam(name: string, value: string, current: string[]): string {
  const has = current.includes(value);
  const next = has ? current.filter((v) => v !== value) : [...current, value];
  return next.map((v) => `${name}=${encodeURIComponent(v)}`).join('&');
}
```

3. **`apps/web/src/components/invoices/invoices-list-table.tsx`** (Server Component) :

```typescript
import Link from 'next/link';
import type { InvoiceRow } from '@/server/actions/invoices-list';

const STATUS_PALETTE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-500',
  CREDIT_NOTE: 'bg-violet-100 text-violet-800',
};

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface Props { rows: InvoiceRow[] }

export function InvoicesListTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Aucune facture pour cette période
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Numéro</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Date</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Payeur</th>
            <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-600">Montant TTC</th>
            <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-600">Reste</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-600">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-2 text-sm">
                <Link href={`/app/factures/${r.id}`} className="text-primary-700 hover:underline font-mono">
                  {r.number}
                </Link>
                {r.isAvoir && (
                  <span className="ml-2 inline-flex items-center rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                    AVO
                  </span>
                )}
                {r.isAvoir && r.originalInvoiceId && r.originalNumber && (
                  <Link href={`/app/factures/${r.originalInvoiceId}`} className="ml-2 text-xs text-slate-500 hover:underline">
                    ← {r.originalNumber}
                  </Link>
                )}
              </td>
              <td className="px-4 py-2 text-sm text-slate-700">{r.issueDate ? fmtDate.format(r.issueDate) : '—'}</td>
              <td className="px-4 py-2 text-sm text-slate-700">{r.payerLabel}</td>
              <td className="px-4 py-2 text-sm text-right tabular-nums">{fmtEUR.format(r.amountTtc)}</td>
              <td className="px-4 py-2 text-sm text-right tabular-nums">
                {fmtEUR.format(r.amountTtc - r.amountPaid)}
              </td>
              <td className="px-4 py-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_PALETTE[r.status] ?? 'bg-slate-100 text-slate-700'}`}>
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

4. **`apps/web/src/components/invoices/invoices-export-button.tsx`** (Client Component) :

```typescript
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, ChevronDown } from 'lucide-react';

interface Props {
  currentRole: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function makeHref(from: Date, to: Date): string {
  return `/api/factures/export?from=${isoDate(from)}&to=${isoDate(to)}`;
}

export function InvoicesExportButton({ currentRole }: Props) {
  // RBAC D-17 : ADMIN+COMPTABLE only
  if (!['ADMIN', 'COMPTABLE'].includes(currentRole)) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="bg-white border border-slate-200 rounded-md shadow-lg py-1 z-50" align="end">
          <DropdownMenu.Item asChild>
            <a href={makeHref(monthStart, monthEnd)} className="block px-3 py-2 text-sm hover:bg-slate-100">
              Ce mois
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a href={makeHref(lastMonthStart, lastMonthEnd)} className="block px-3 py-2 text-sm hover:bg-slate-100">
              Mois dernier
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a href={makeHref(yearStart, now)} className="block px-3 py-2 text-sm hover:bg-slate-100">
              Année courante
            </a>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web typecheck</automated>
  </verify>
  <acceptance_criteria>
    - 4 fichiers `apps/web/src/components/invoices/invoices-*.tsx` créés (ls)
    - `invoices-prio-cards.tsx` contient les 4 PrioCard avec labels verbatim D-05 (`'CA facturé ce mois'`, `'Impayés'`, `'DSO moyen'`, `'À facturer'`)
    - `invoices-filters.tsx` contient 7 STATUS_CHIPS (`'DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED', 'CREDIT_NOTE'`)
    - `invoices-filters.tsx` contient le bouton `'Voir seulement impayés'` (grep)
    - `invoices-list-table.tsx` contient le badge `AVO` (grep)
    - `invoices-list-table.tsx` empty state `'Aucune facture pour cette période'` (grep)
    - `invoices-list-table.tsx` contient `<Link href={\`/app/factures/${r.id}\`}` (grep)
    - `invoices-export-button.tsx` contient `'use client'` + check `['ADMIN', 'COMPTABLE'].includes(currentRole)` (grep)
    - `invoices-export-button.tsx` link vers `/api/factures/export?from=...&to=...` (grep)
    - `pnpm --filter @qualiof/web typecheck` → exit 0
  </acceptance_criteria>
  <done>4 composants UI prêts à être composés par la page Server Component Task 3.</done>
</task>

<task type="auto">
  <name>Task 3 : Page /app/factures Server Component refondue + tests smoke</name>
  <files>apps/web/src/app/app/factures/page.tsx, apps/web/src/app/app/factures/__tests__/page.smoke.test.ts</files>
  <read_first>
    - apps/web/src/app/app/factures/page.tsx (PLACEHOLDER actuel — à REMPLACER ENTIÈREMENT)
    - apps/web/src/app/app/leads/charge/page.tsx (pattern Phase 9 — Server Component + searchParams + RBAC soft-redirect + Promise.all queries + composition composants)
    - apps/web/src/lib/auth.ts (validateRequest)
    - apps/web/src/lib/rbac.ts (hasRole pour soft-redirect — D-Phase9-Q)
  </read_first>
  <action>
1. REMPLACER ENTIÈREMENT `apps/web/src/app/app/factures/page.tsx` :

```typescript
import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { getInvoicesListData } from '@/server/actions/invoices-list';
import { InvoicesPrioCards } from '@/components/invoices/invoices-prio-cards';
import { InvoicesFilters } from '@/components/invoices/invoices-filters';
import { InvoicesListTable } from '@/components/invoices/invoices-list-table';
import { InvoicesExportButton } from '@/components/invoices/invoices-export-button';

export const dynamic = 'force-dynamic';

interface SP {
  status?: string | string[];
  period?: string;
  onlyUnpaid?: string;
  payerOrgId?: string;
  page?: string;
}

function parseFiltersFromSearchParams(sp: SP) {
  const statuses = sp.status
    ? Array.isArray(sp.status)
      ? sp.status
      : sp.status.split(',')
    : undefined;

  let from: Date | undefined;
  let to: Date | undefined;
  const now = new Date();
  switch (sp.period) {
    case 'this-month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'last-month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), q * 3, 1);
      to = new Date(now.getFullYear(), q * 3 + 3, 0);
      break;
    }
    case 'year':
      from = new Date(now.getFullYear(), 0, 1);
      to = new Date(now.getFullYear(), 11, 31);
      break;
  }

  return {
    statuses: statuses as never,
    from,
    to,
    onlyUnpaid: sp.onlyUnpaid === 'true',
    payerOrgId: sp.payerOrgId,
    period: sp.period,
  };
}

export default async function FacturesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');

  // Soft-redirect D-Phase9-Q (cohérent Phase 9)
  if (!hasRole(user, ['ADMIN', 'MANAGER', 'COMPTABLE', 'LECTEUR'])) {
    redirect('/app');
  }

  const sp = await searchParams;
  const filters = parseFiltersFromSearchParams(sp);
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const pageSize = 50;

  const { kpis, rows, total } = await getInvoicesListData({
    filters: {
      statuses: filters.statuses,
      from: filters.from,
      to: filters.to,
      payerOrgId: filters.payerOrgId,
      onlyUnpaid: filters.onlyUnpaid,
    },
    page,
    pageSize,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Factures</h1>
          <p className="text-sm text-slate-600">Suivi de trésorerie · {total} facture{total > 1 ? 's' : ''}</p>
        </div>
        <InvoicesExportButton currentRole={user.role} />
      </header>

      <InvoicesPrioCards kpis={kpis} />
      <InvoicesFilters
        filters={{
          statuses: filters.statuses,
          period: filters.period,
          onlyUnpaid: filters.onlyUnpaid,
        }}
        total={total}
      />
      <InvoicesListTable rows={rows} />

      {/* Empty state spécifique "Aucun impayé" si filtre onlyUnpaid + 0 rows */}
      {filters.onlyUnpaid && rows.length === 0 && (
        <div className="text-center text-sm text-emerald-700 mt-4" role="status">
          Aucun impayé 🎉
        </div>
      )}
    </div>
  );
}
```

2. Créer `apps/web/src/app/app/factures/__tests__/page.smoke.test.ts` (source-regex D-Phase9-N) :

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE_PATH = path.join(__dirname, '../page.tsx');
const src = readFileSync(PAGE_PATH, 'utf8');

describe('FacturesPage smoke', () => {
  it('imports les 4 composants UI Phase 11', () => {
    expect(src).toContain('InvoicesPrioCards');
    expect(src).toContain('InvoicesFilters');
    expect(src).toContain('InvoicesListTable');
    expect(src).toContain('InvoicesExportButton');
  });

  it('appelle validateRequest + soft-redirect RBAC (Phase 9 D-Phase9-Q)', () => {
    expect(src).toContain('validateRequest');
    expect(src).toContain('hasRole(user, [');
    expect(src).toContain("['ADMIN', 'MANAGER', 'COMPTABLE', 'LECTEUR']");
  });

  it('appelle getInvoicesListData avec filters + page + pageSize', () => {
    expect(src).toMatch(/getInvoicesListData\(/);
    expect(src).toContain('pageSize');
  });

  it('contient les empty states', () => {
    expect(src).toContain('Aucun impayé');
  });

  it('utilise force-dynamic (recompute à chaque request)', () => {
    expect(src).toContain("dynamic = 'force-dynamic'");
  });

  it('parse 4 périodes (this-month / last-month / quarter / year)', () => {
    expect(src).toContain("case 'this-month'");
    expect(src).toContain("case 'last-month'");
    expect(src).toContain("case 'quarter'");
    expect(src).toContain("case 'year'");
  });
});
```

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/app/app/factures/__tests__/page.smoke.test.ts` → 6 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/app/app/factures/__tests__/page.smoke.test.ts && pnpm --filter @qualiof/web typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/app/app/factures/page.tsx` est COMPLÈTEMENT remplacé (plus de placeholder — vérifier via grep négatif `expect(src).not.toContain('placeholder')`)
    - Importe les 4 composants `InvoicesPrioCards`, `InvoicesFilters`, `InvoicesListTable`, `InvoicesExportButton` (grep)
    - Appelle `getInvoicesListData(...)` (grep)
    - Soft-redirect `hasRole(user, ['ADMIN', 'MANAGER', 'COMPTABLE', 'LECTEUR'])` (grep)
    - 6/6 tests smoke verts
    - `pnpm --filter @qualiof/web build` route `/app/factures` compile
  </acceptance_criteria>
  <done>Page liste Phase 11 livrée. Placeholder remplacé. 4 PrioCard + filtres + table + bouton Exporter visibles.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4 : Backfill logInvoiceEvent dans actions existantes (FACT-01)</name>
  <files>apps/web/src/server/actions/invoices.ts, apps/web/src/server/actions/__tests__/invoices-audit.test.ts</files>
  <read_first>
    - apps/web/src/server/actions/invoices.ts (actions Phase 7-02 : createInvoiceFromParticipant, createInvoiceForSponsorGroup, recordInvoicePayment — à enrichir SANS casser les signatures)
    - apps/web/src/lib/invoice-audit.ts (logInvoiceEvent Plan 11-02)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Backfill actions existantes
  </read_first>
  <behavior>
    - Test 1 : `createInvoiceFromParticipant` succès → logInvoiceEvent appelée 2 fois : action='invoices.created' + action='invoices.issued'
    - Test 2 : `createInvoiceForSponsorGroup` succès → idem 2 calls
    - Test 3 : `recordInvoicePayment` succès → logInvoiceEvent action='invoices.payment_recorded' avec diff `{amount, method, receivedAt, fullyPaid: boolean, newStatus}`
    - Test 4 : RBAC denied ne crée PAS d'AuditLog (anti-régression)
    - Test 5 : Anti-régression Phase 7-02 : la signature `{ ok, invoiceId, documentId, number, error }` est inchangée
  </behavior>
  <action>
1. Dans `apps/web/src/server/actions/invoices.ts`, AJOUTER aux 3 actions existantes les appels `logInvoiceEvent`. NE PAS changer la logique métier, juste ajouter les calls AVANT le `return { ok: true, ... }` :

**Pour `createInvoiceFromParticipant`** (et `createInvoiceForSponsorGroup` — pattern identique) :
```typescript
import { logInvoiceEvent } from '@/lib/invoice-audit';

// ... à l'intérieur de l'action, après prisma.invoice.create() ...
await logInvoiceEvent({
  tenantId: user.tenantId,
  actorUserId: user.id,
  targetInvoiceId: createdInvoice.id,
  action: 'invoices.created',
  diff: {
    amountHt: Number(createdInvoice.amountHT),
    amountTtc: Number(createdInvoice.amountTTC),
    participantId: createdInvoice.participantId,
    payerOrgId: createdInvoice.payerOrgId,
    sessionId: createdInvoice.sessionId,
  },
});
// Création passe direct en ISSUED (cf Phase 7-02 — pas de DRAFT step) → second event
await logInvoiceEvent({
  tenantId: user.tenantId,
  actorUserId: user.id,
  targetInvoiceId: createdInvoice.id,
  action: 'invoices.issued',
  diff: { status: { before: 'DRAFT', after: 'ISSUED' } },
});
```

**Pour `recordInvoicePayment`** :
```typescript
// ... après le $transaction qui met à jour invoice + crée payment ...
const fullyPaid = newPaid >= Number(invoice.amountTTC);
const newStatus = fullyPaid ? 'PAID' : 'PARTIAL';
await logInvoiceEvent({
  tenantId: user.tenantId,
  actorUserId: user.id,
  targetInvoiceId: invoice.id,
  action: 'invoices.payment_recorded',
  diff: {
    amount: input.amount,
    method: input.method,
    receivedAt: input.receivedAt,
    fullyPaid,
    newStatus,
  },
});
```

2. Créer `apps/web/src/server/actions/__tests__/invoices-audit.test.ts` avec 5 tests (cf behavior) — pattern : mock requireRole + mock prisma + mock logInvoiceEvent + appeler les 3 actions, vérifier que logInvoiceEvent a bien été appelée.

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-audit.test.ts` → 5 verts + tests existants Phase 7-02 toujours verts (anti-régression).
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-audit.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/server/actions/invoices.ts` importe `logInvoiceEvent` (grep)
    - `createInvoiceFromParticipant` appelle `logInvoiceEvent` avec action `'invoices.created'` (grep)
    - `createInvoiceFromParticipant` appelle `logInvoiceEvent` avec action `'invoices.issued'` (grep)
    - `createInvoiceForSponsorGroup` appelle `logInvoiceEvent` (grep — au moins 2 calls)
    - `recordInvoicePayment` appelle `logInvoiceEvent` avec action `'invoices.payment_recorded'` (grep)
    - 5/5 tests verts
    - **Anti-régression Phase 7-02** : tests existants `apps/web/src/server/actions/__tests__/invoices.test.ts` (si présent) toujours verts
  </acceptance_criteria>
  <done>Backfill terminé : 3 actions existantes émettent AuditLog conforme D-18. FACT-01 (stabilisation Factures) clôturé côté server actions.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-list.test.ts` → 11/11
- `pnpm --filter @qualiof/web test -- --run src/app/app/factures/__tests__/page.smoke.test.ts` → 6/6
- `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices-audit.test.ts` → 5/5
- `pnpm --filter @qualiof/web typecheck` → exit 0
- `pnpm --filter @qualiof/web build` la route `/app/factures` compile (placeholder remplacé)
- Tests Phase 7-02 sur les 3 actions historiques toujours verts (anti-régression backfill)
</verification>

<success_criteria>
- Page `/app/factures` rend 4 PrioCard + filtres + table (plus de placeholder)
- Filtres : status multi-chips + période chips + bouton 'Voir impayés' fonctionnels
- Tri par défaut issueDate DESC, number DESC
- Empty states "Aucune facture pour cette période" / "Aucun impayé 🎉"
- Bouton "Exporter" présent et link vers /api/factures/export (RBAC ADMIN/COMPTABLE)
- Badges AVO sur lignes credit notes avec lien vers facture origine
- Backfill : 3 actions existantes émettent logInvoiceEvent
- 22 tests Vitest verts (11 + 6 + 5)
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-08-SUMMARY.md`
</output>

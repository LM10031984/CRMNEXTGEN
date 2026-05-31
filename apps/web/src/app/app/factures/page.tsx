import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { getInvoicesListData } from '@/server/actions/invoices-list';
import { InvoicesPrioCards } from '@/components/invoices/invoices-prio-cards';
import { InvoicesFilters } from '@/components/invoices/invoices-filters';
import { InvoicesListTable } from '@/components/invoices/invoices-list-table';
import { InvoicesExportButton } from '@/components/invoices/invoices-export-button';

/**
 * Phase 11 Plan 11-08 Task 3 — Page liste factures (FACT-01).
 *
 * Server Component orchestrateur :
 *  - `validateRequest` (Lucia) puis `hasRole` soft-redirect (D-Phase9-Q pattern Phase 9).
 *  - Parse searchParams → filters (statuses multi / période → from/to / payerOrgId / onlyUnpaid).
 *  - `getInvoicesListData(filters, page, pageSize)` → KPI + rows + total.
 *  - Compose 4 sous-composants UI : PrioCards / Filters / Table / ExportButton.
 *
 * RBAC (D-19) :
 *  - ADMIN / MANAGER / COMPTABLE / LECTEUR → accès page liste.
 *  - FORMATEUR / COMMERCIAL → redirect '/app' (visu fine read-only différée à
 *    une itération future, Phase 8 RBAC existant ne livre pas ce niveau de
 *    granularité côté page liste — Plan 11-08 verrouille la liste aux 4 rôles
 *    "métier finance" pour cette livraison ; FORMATEUR/COMMERCIAL gardent
 *    accès aux fiches individuelles via cross-nav sessions/leads).
 *  - Bouton Exporter (D-17) masqué pour MANAGER/LECTEUR par le composant lui-même
 *    (ADMIN + COMPTABLE only).
 *
 * `dynamic = 'force-dynamic'` : KPI temps réel + searchParams toujours frais.
 */
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
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case 'last-month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), q * 3, 1);
      to = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
      break;
    }
    case 'year':
      from = new Date(now.getFullYear(), 0, 1);
      to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
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

  // Soft-redirect D-Phase9-Q (cohérent Phase 9-03 leads/charge)
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
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Factures</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Suivi de trésorerie
            <span className="text-slate-300 mx-1.5">·</span>
            <span className="tabular-nums font-medium text-slate-700">{total}</span> facture{total > 1 ? 's' : ''}
          </p>
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

      {/* Empty state spécifique "Aucun impayé 🎉" si filtre onlyUnpaid actif + 0 rows */}
      {filters.onlyUnpaid && rows.length === 0 && (
        <div
          role="status"
          className="text-center text-sm text-emerald-700 mt-4"
        >
          Aucun impayé 🎉
        </div>
      )}
    </div>
  );
}

import Link from 'next/link';

/**
 * Phase 11 Plan 11-08 Task 2 — Filtres chips combinés (D-06).
 *
 * Pattern Server Component avec liens `<Link>` qui mettent à jour searchParams
 * (cohérent avec Phase 9.1 MatrixFilters — pas de useState/useTransition,
 * la navigation Next.js déclenche un re-render du Server Component parent).
 *
 * Filtres exposés :
 *  - Status multi-chips : DRAFT / ISSUED / PAID / PARTIAL / OVERDUE / CANCELLED / CREDIT_NOTE
 *  - Période chips     : Ce mois / Mois dernier / Trimestre / Année
 *  - Bouton 1-clic      : "Voir seulement impayés" → ?onlyUnpaid=true
 *
 * Comportement multi-chip Status :
 *  - URL `?status=ISSUED&status=PAID` → checkbox-like, click toggle in/out de l'array
 *  - Cumul avec period : `?status=ISSUED&period=this-month` parseé côté page.tsx
 *
 * Note : "Personnalisé" (DateInput from/to) prévu CONTEXT.md D-06 mais non livré
 * dans cette itération — défère au Plan futur (Q: confirmer besoin réel ; les
 * 4 raccourcis prédéfinis couvrent 95% des cas opérationnels Laurent).
 */

interface Props {
  filters: {
    statuses?: string[];
    period?: string;
    onlyUnpaid?: boolean;
  };
  total: number;
}

const STATUS_CHIPS = [
  'DRAFT',
  'ISSUED',
  'PAID',
  'PARTIAL',
  'OVERDUE',
  'CANCELLED',
  'CREDIT_NOTE',
] as const;

const PERIOD_CHIPS = [
  { key: 'this-month', label: 'Ce mois' },
  { key: 'last-month', label: 'Mois dernier' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'year', label: 'Année' },
] as const;

function buildHref(params: Record<string, string | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v) parts.push(`${key}=${encodeURIComponent(v)}`);
      }
    } else if (value !== '') {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length > 0 ? `/app/factures?${parts.join('&')}` : '/app/factures';
}

export function InvoicesFilters({ filters, total }: Props) {
  const activeStatuses = filters.statuses ?? [];

  return (
    <section aria-label="Filtres factures" className="space-y-3">
      {/* Statuts multi-chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Statut :</span>
        {STATUS_CHIPS.map((s) => {
          const active = activeStatuses.includes(s);
          const nextStatuses = active
            ? activeStatuses.filter((v) => v !== s)
            : [...activeStatuses, s];
          return (
            <Link
              key={s}
              href={buildHref({
                status: nextStatuses.length > 0 ? nextStatuses : undefined,
                period: filters.period,
                onlyUnpaid: filters.onlyUnpaid ? 'true' : undefined,
              }) as never}
              className={
                active
                  ? 'rounded-full px-3 py-1 text-xs bg-primary-600 text-white'
                  : 'rounded-full px-3 py-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200'
              }
            >
              {s}
            </Link>
          );
        })}
      </div>

      {/* Périodes chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Période :</span>
        {PERIOD_CHIPS.map((p) => {
          const active = filters.period === p.key;
          return (
            <Link
              key={p.key}
              href={buildHref({
                status: activeStatuses,
                period: active ? undefined : p.key,
                onlyUnpaid: filters.onlyUnpaid ? 'true' : undefined,
              }) as never}
              className={
                active
                  ? 'rounded-full px-3 py-1 text-xs bg-primary-600 text-white'
                  : 'rounded-full px-3 py-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200'
              }
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      {/* Toggle "Voir seulement impayés" + compteur total */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={buildHref({
            status: activeStatuses,
            period: filters.period,
            onlyUnpaid: filters.onlyUnpaid ? undefined : 'true',
          }) as never}
          className={
            filters.onlyUnpaid
              ? 'rounded-md px-3 py-1.5 text-xs font-medium bg-red-100 text-red-800'
              : 'rounded-md px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200'
          }
        >
          {filters.onlyUnpaid ? '✓ Seuls les impayés' : 'Voir seulement impayés'}
        </Link>
        <span className="text-xs text-slate-500">
          {total} facture{total > 1 ? 's' : ''}
        </span>
        {(activeStatuses.length > 0 || filters.period || filters.onlyUnpaid) && (
          <Link href="/app/factures" className="text-xs text-slate-500 hover:text-slate-700 underline">
            Réinitialiser
          </Link>
        )}
      </div>
    </section>
  );
}

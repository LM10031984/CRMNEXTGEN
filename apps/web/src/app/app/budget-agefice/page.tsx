/**
 * Vue Budget AGEFICE par apprenant. L'année se compte sur la date où le
 * dossier a été monté (financingRequestDate), PAS la date de la session
 * (cf feedback_budget_agefice_annee_dossier).
 *
 * Cas d'usage prioritaire (validé par Laurent 30/04/2026) : repérer les
 * apprenants qui n'ont pas encore consommé tout leur plafond annuel
 * de 3000€ pour les relancer commercialement.
 */

import Link from 'next/link';
import { Wallet, AlertTriangle, CheckCircle2, ChevronRight, ArrowLeft } from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { FilterChips } from '@/components/ui/filter-chips';
import { listLearnersWithAgeficeBudget } from '@/server/actions/budget-agefice';
import { PLAFOND_AGEFICE } from '@/lib/budget-agefice-constants';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

interface SP {
  year?: string;
  filter?: 'all' | 'has_budget_left' | 'no_consumption' | 'near_limit' | 'over';
  q?: string;
}

export default async function BudgetAgeficePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const sp = await searchParams;
  const year = sp.year ? parseInt(sp.year, 10) : new Date().getFullYear();
  const filter = sp.filter ?? 'has_budget_left';
  const q = sp.q?.trim() ?? '';

  const rows = await listLearnersWithAgeficeBudget({ year, filter, search: q });

  // KPI globaux (recalculés sur tous les apprenants, pas le filtre)
  const allRows = await listLearnersWithAgeficeBudget({ year });
  const totalLearners = allRows.length;
  const withBudget = allRows.filter((r) => r.consomme < PLAFOND_AGEFICE);
  const noConso = allRows.filter((r) => r.consomme === 0);
  const totalRemaining = allRows.reduce((s, r) => s + r.restant, 0);

  const filterChips = [
    { label: `Avec budget restant (${withBudget.length})`, href: `/app/budget-agefice?filter=has_budget_left&year=${year}`, active: filter === 'has_budget_left' },
    { label: `Sans consommation (${noConso.length})`, href: `/app/budget-agefice?filter=no_consumption&year=${year}`, active: filter === 'no_consumption' },
    { label: 'Proche du plafond', href: `/app/budget-agefice?filter=near_limit&year=${year}`, active: filter === 'near_limit' },
    { label: 'Au plafond / dépassé', href: `/app/budget-agefice?filter=over&year=${year}`, active: filter === 'over' },
    { label: `Tous les éligibles (${totalLearners})`, href: `/app/budget-agefice?filter=all&year=${year}`, active: filter === 'all' },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour au dashboard
      </Link>

      <PageHeader
        title={`Budget AGEFICE — ${year}`}
        subtitle={`Plafond ${fmtEUR.format(PLAFOND_AGEFICE)} / apprenant / année du dossier déposé — repère qui peut encore consommer`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Apprenants éligibles AGEFICE" value={String(totalLearners)} icon={Wallet} />
        <KPICard
          label="Avec budget restant"
          value={String(withBudget.length)}
          icon={CheckCircle2}
          accent="emerald"
        />
        <KPICard
          label="Pas encore consommé"
          value={String(noConso.length)}
          icon={Wallet}
          accent="amber"
          hint="cible relance prioritaire"
        />
        <KPICard
          label={`Reste à mobiliser ${year}`}
          value={fmtEUR.format(totalRemaining)}
          icon={Wallet}
          accent="primary"
          hint="cumul sur tous les apprenants"
        />
      </div>

      <FilterChips chips={filterChips} />

      {/* Liste */}
      <section className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            {rows.length} apprenant{rows.length > 1 ? 's' : ''} {filter === 'has_budget_left' ? 'avec budget restant' : filter === 'no_consumption' ? "n'ayant rien consommé" : filter === 'near_limit' ? 'proches du plafond' : filter === 'over' ? 'au plafond ou au-delà' : 'éligibles'}
          </h2>
        </div>

        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted-foreground italic">
            Aucun apprenant ne correspond aux critères pour {year}.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const barColor =
                r.status === 'over'
                  ? 'bg-red-500'
                  : r.status === 'near_limit'
                    ? 'bg-orange-500'
                    : r.status === 'mid'
                      ? 'bg-amber-400'
                      : r.status === 'low'
                        ? 'bg-emerald-500'
                        : 'bg-muted';
              return (
                <li key={r.personId}>
                  <Link
                    href={`/app/apprenants/${r.personId}?tab=activity`}
                    className="block p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center font-semibold text-xs shrink-0">
                        {r.firstName.charAt(0)}
                        {r.lastName.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-[180px]">
                        <div className="font-medium">
                          {r.firstName} {r.lastName.toUpperCase()}
                        </div>
                        {r.email && (
                          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                        )}
                      </div>

                      {/* Barre de progression */}
                      <div className="flex-1 min-w-[200px] max-w-md">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground tabular-nums">
                            {fmtEUR.format(r.consomme)} / {fmtEUR.format(PLAFOND_AGEFICE)}
                          </span>
                          <span
                            className={cn(
                              'font-medium tabular-nums',
                              r.status === 'over'
                                ? 'text-red-700'
                                : r.status === 'near_limit'
                                  ? 'text-orange-700'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {r.pct}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn('h-full transition-all', barColor)}
                            style={{ width: `${Math.min(100, r.pct)}%` }}
                          />
                        </div>
                      </div>

                      <div className="text-right shrink-0 min-w-[120px]">
                        <div className="text-sm font-semibold tabular-nums">
                          {fmtEUR.format(r.restant)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          restant
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {r.nbSessions > 0 && (
                          <Badge variant="muted" className="text-[10px]">
                            {r.nbSessions} session{r.nbSessions > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {r.status === 'over' && (
                          <Badge variant="danger" className="text-[10px] inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Plafond dépassé
                          </Badge>
                        )}
                        {r.status === 'free' && (
                          <Badge variant="warning" className="text-[10px]">
                            🎯 À relancer
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'primary' | 'emerald' | 'amber' | 'default';
  hint?: string;
}) {
  const cls =
    accent === 'primary'
      ? 'border-primary-200 bg-primary-50/50'
      : accent === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/50'
        : accent === 'amber'
          ? 'border-amber-200 bg-amber-50/50'
          : 'border-border bg-white';
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

/**
 * Pilotage Direction — CA réalisé vs objectif vs prévisionnel (quick 260620-d42 Plan 02).
 *
 * Vue direction : une page unique et lisible du chiffre d'affaires de l'année
 *  - cartes KPI (réalisé YTD, objectif, % atteint, prévisionnel restant,
 *    atterrissage estimé, écart vs objectif) ;
 *  - graphe à barres mensuel (réalisé + prévisionnel empilés + cible + cumul) ;
 *  - comparaison N-1 ;
 *  - formulaire de saisie de l'objectif annuel.
 *
 * RBAC : réservé ADMIN/MANAGER (garde `hasRole` + `redirect('/app')`, pattern
 * distribution-leads / budget-agefice). La sécurité réelle de la mutation est
 * dans `setRevenueTarget` (requireRole). Données via `getPilotageData` (Plan 01).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BarChart3,
  ArrowLeft,
  Target,
  TrendingUp,
  TrendingDown,
  Wallet,
  Flag,
} from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { PageHeader } from '@/components/ui/page-header';
import { FilterChips } from '@/components/ui/filter-chips';
import { getPilotageData } from '@/lib/pilotage-stats';
import { PilotageBarChart } from './pilotage-bar-chart';
import { RevenueTargetForm } from './revenue-target-form';

export const dynamic = 'force-dynamic';

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

interface SP {
  year?: string;
}

export default async function PilotagePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  if (!hasRole(user, ['ADMIN', 'MANAGER'])) redirect('/app');

  const sp = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = sp.year ? parseInt(sp.year, 10) : currentYear;

  const data = await getPilotageData(user.tenantId, year);
  const { kpis } = data;

  // Sélecteur d'année : année courante et 4 précédentes.
  const yearChips = [0, 1, 2, 3, 4].map((offset) => {
    const y = currentYear - offset;
    return {
      label: String(y),
      href: `/app/pilotage?year=${y}`,
      active: y === year,
    };
  });

  // Comparaison N-1 : delta du réalisé YTD vs total réalisé de l'année N-1.
  const deltaN1 = kpis.caRealiseYTD - kpis.totalRealiseN1;
  const deltaN1Pct =
    kpis.totalRealiseN1 > 0
      ? Math.round((deltaN1 / kpis.totalRealiseN1) * 100)
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour au dashboard
      </Link>

      <PageHeader
        title={`Pilotage Direction — ${year}`}
        subtitle="CA réalisé vs objectif vs prévisionnel, par mois et par année"
      />

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          Année
        </div>
        <FilterChips chips={yearChips} />
      </div>

      {/* Cartes KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard
          label="CA réalisé (YTD)"
          value={fmtEUR.format(kpis.caRealiseYTD)}
          icon={Wallet}
          accent="emerald"
        />
        <KPICard
          label="Objectif annuel"
          value={fmtEUR.format(kpis.objectifAnnuel)}
          icon={Target}
          accent="primary"
        />
        <KPICard
          label="% atteint"
          value={`${kpis.pctAtteint}%`}
          icon={Flag}
          accent={kpis.pctAtteint >= 100 ? 'emerald' : 'amber'}
        />
        <KPICard
          label="Prévisionnel restant"
          value={fmtEUR.format(kpis.previsionnelRestant)}
          icon={TrendingUp}
        />
        <KPICard
          label="Atterrissage estimé"
          value={fmtEUR.format(kpis.atterrissageEstime)}
          icon={BarChart3}
          hint="réalisé + prévisionnel"
        />
        <KPICard
          label="Écart vs objectif"
          value={`${kpis.ecartVsObjectif >= 0 ? '+' : ''}${fmtEUR.format(kpis.ecartVsObjectif)}`}
          icon={kpis.ecartVsObjectif >= 0 ? TrendingUp : TrendingDown}
          accent={kpis.ecartVsObjectif >= 0 ? 'emerald' : 'amber'}
          hint="atterrissage − objectif"
        />
      </div>

      {/* Graphe mensuel */}
      <PilotageBarChart
        realiseMonthly={data.realiseMonthly}
        previsionnelMonthly={data.previsionnelMonthly}
        objectifMensuel={data.objectifMensuel}
      />

      {/* Comparaison N-1 */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">
          Comparaison vs N-1
        </h2>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-[11px] text-muted-foreground">
              Réalisé {year - 1} (total)
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtEUR.format(kpis.totalRealiseN1)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">
              Réalisé {year} (YTD)
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtEUR.format(kpis.caRealiseYTD)}
            </div>
          </div>
          <div
            className={
              deltaN1 >= 0
                ? 'inline-flex items-center gap-1.5 text-emerald-700'
                : 'inline-flex items-center gap-1.5 text-amber-700'
            }
          >
            {deltaN1 >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span className="font-medium tabular-nums">
              {deltaN1 >= 0 ? '+' : ''}
              {fmtEUR.format(deltaN1)}
              {deltaN1Pct !== null ? ` (${deltaN1Pct >= 0 ? '+' : ''}${deltaN1Pct}%)` : ''}
            </span>
            <span className="text-xs text-muted-foreground">vs N-1</span>
          </div>
        </div>
      </section>

      {/* Formulaire objectif annuel */}
      <RevenueTargetForm year={year} current={data.objectifAnnuel} />
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

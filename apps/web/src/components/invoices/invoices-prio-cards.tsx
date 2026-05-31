import { TrendingUp, AlertCircle, Clock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InvoicesListKpis } from '@/server/actions/invoices-list';

/**
 * Phase 11 Plan 11-08 Task 2 — 4 PrioCard métier en haut de la liste factures (D-05).
 *
 * Pattern PrioCardLocal clone de `apps/web/src/app/app/leads/charge/page.tsx` (Phase 9-03)
 * — local car le composant dashboard interne `components/dashboard/prio-card.tsx`
 * n'est pas exporté en helper public (pattern Phase 9 réutilisé tel quel D-Phase9-K).
 *
 * Labels D-05 (verbatim CONTEXT.md) :
 *  - "CA facturé ce mois"        (icon TrendingUp emerald)
 *  - "Impayés"                   (icon AlertCircle red) + sub "{N} facture(s)"
 *  - "DSO moyen"                 (icon Clock sky) + sub "Délai moyen d'encaissement (mois)"
 *  - "À facturer"                (icon FileText amber) + sub "Inscriptions terminées sans facture"
 */

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

interface Props {
  kpis: InvoicesListKpis;
}

export function InvoicesPrioCards({ kpis }: Props) {
  return (
    <section
      aria-label="Indicateurs factures"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <PrioCardLocal
        Icon={TrendingUp}
        tone="success"
        label="CA facturé ce mois"
        value={fmtEUR.format(kpis.caMois)}
      />
      <PrioCardLocal
        Icon={AlertCircle}
        tone="danger"
        label="Impayés"
        value={fmtEUR.format(kpis.impayesAmount)}
        sub={`${kpis.impayesCount} facture${kpis.impayesCount > 1 ? 's' : ''}`}
      />
      <PrioCardLocal
        Icon={Clock}
        tone="primary"
        label="DSO moyen"
        value={kpis.dsoMoyen != null ? `${kpis.dsoMoyen} j` : '—'}
        sub="Délai moyen d'encaissement (mois)"
      />
      <PrioCardLocal
        Icon={FileText}
        tone="warning"
        label="À facturer"
        value={String(kpis.aFacturerCount)}
        sub="Inscriptions terminées sans facture"
      />
    </section>
  );
}

type Tone = 'primary' | 'success' | 'warning' | 'danger';

function PrioCardLocal({
  Icon,
  tone,
  label,
  value,
  sub,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: Tone;
  label: string;
  value: string;
  sub?: string;
}) {
  // KPI Folk-style : carte sobre, icône discrète à droite, chiffre dominant.
  const iconColor: Record<Tone, string> = {
    success: 'text-green-600',
    danger: 'text-red-600',
    primary: 'text-blue-600',
    warning: 'text-amber-600',
  };
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className={cn('h-4 w-4', iconColor[tone])} strokeWidth={1.75} />
      </div>
      <div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

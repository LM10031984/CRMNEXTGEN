import { TrendingUp, AlertCircle, Clock, FileText } from 'lucide-react';
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
        sub="Inscriptions terminées sans facture"
      />
    </section>
  );
}

function PrioCardLocal({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-primary-200 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

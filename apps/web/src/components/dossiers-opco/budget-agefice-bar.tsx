/**
 * Mini-barre de progression du budget AGEFICE consommé pour un apprenant
 * sur l'année courante (US-007). Affichée inline dans la colonne OPCO
 * uniquement quand sponsorOrg.opcoCode === 'AGEFICE'.
 *
 * Couleurs :
 *   - <60% : vert (low)
 *   - 60-90% : orange (mid)
 *   - >90% : rouge (near_limit)
 *   - >100% : gris hachuré (over)
 */

import { cn } from '@/lib/utils';

const PLAFOND_AGEFICE = 3000;
const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

interface Props {
  consumed: number;
  /** Année de référence (pour le tooltip) */
  year: number;
}

export function BudgetAgeficeBar({ consumed, year }: Props) {
  const pct = Math.min(100, Math.round((consumed / PLAFOND_AGEFICE) * 100));
  const overflow = consumed > PLAFOND_AGEFICE;
  const color = overflow
    ? 'bg-slate-400'
    : pct >= 90
      ? 'bg-red-500'
      : pct >= 60
        ? 'bg-amber-400'
        : 'bg-emerald-500';
  const remaining = Math.max(0, PLAFOND_AGEFICE - consumed);

  return (
    <div
      className="mt-0.5 inline-block w-20 align-middle"
      title={`Budget AGEFICE ${year} : ${fmtEUR.format(consumed)} / ${fmtEUR.format(PLAFOND_AGEFICE)}${overflow ? ' (dépassement !)' : ` · reste ${fmtEUR.format(remaining)}`}`}
    >
      <div className="relative h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={cn('h-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[9px] text-muted-foreground tabular-nums leading-tight mt-0.5">
        {pct}% · {fmtEUR.format(consumed)}
      </div>
    </div>
  );
}

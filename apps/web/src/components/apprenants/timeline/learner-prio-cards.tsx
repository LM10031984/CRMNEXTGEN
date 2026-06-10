import { Clock, BookOpen, Calendar } from 'lucide-react';

/**
 * Phase 9.1 Plan 04 — 3 PrioCards horizontales en haut de la fiche apprenant.
 *
 * Pattern : clone-local PrioCard Phase 6 (D-Phase9-K — décision Plan).
 * Voir UI-SPEC §"Surface 2 — Fiche apprenant" wireframe + §"LearnerPrioCards".
 *
 *  - Card 1 : ⏱  HEURES TOTALES     {totalHours} h     depuis {firstYear}
 *  - Card 2 : 📚  SESSIONS           {sessionsCount}    formées
 *  - Card 3 : 📅  HEURES {year}      {currentYearHours} h  cette année
 */

interface Props {
  totalHours: number;
  sessionsCount: number;
  currentYear: number;
  currentYearHours: number;
  firstYear: number;
}

export function LearnerPrioCards({
  totalHours,
  sessionsCount,
  currentYear,
  currentYearHours,
  firstYear,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <PrioCard
        icon={Clock}
        label="HEURES TOTALES"
        value={`${totalHours} h`}
        sub={`depuis ${firstYear}`}
      />
      <PrioCard
        icon={BookOpen}
        label="SESSIONS"
        value={String(sessionsCount)}
        sub="formées"
      />
      <PrioCard
        icon={Calendar}
        label={`HEURES ${currentYear}`}
        value={`${currentYearHours} h`}
        sub="cette année"
      />
    </div>
  );
}

function PrioCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium leading-tight">
          {label}
        </p>
      </div>
      <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

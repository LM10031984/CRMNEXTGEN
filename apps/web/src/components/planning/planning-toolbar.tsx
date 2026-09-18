'use client';
import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DEFAULT_STATUSES,
  shiftDay,
  type PlanningTrainer,
} from '@/lib/planning/build-planning-grid';
import {
  formatPlanningDate,
  parsePlanningQuery,
  REGIME_LABELS,
  STATUS_LABELS,
} from '@/lib/planning/planning-query';
import { cn } from '@/lib/utils';

export function PlanningToolbar({
  trainers,
  today,
  conflictCount,
}: {
  trainers: PlanningTrainer[];
  today: string;
  conflictCount: number;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const state = parsePlanningQuery(Object.fromEntries(search.entries()), today);
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes))
      value === null ? next.delete(key) : next.set(key, value);
    startTransition(() => router.push(`/app/planning?${next}` as Route, { scroll: false }));
  }
  function move(direction: number) {
    const date = new Date(`${state.anchor}T00:00:00Z`);
    const anchor =
      state.view === 'week'
        ? shiftDay(state.anchor, direction * 7)
        : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1))
            .toISOString()
            .slice(0, 10);
    update({ m: anchor.slice(0, 7), d: anchor });
  }
  function toggle(key: string, current: string[], value: string, empty: string | null = null) {
    const values = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    update({ [key]: values.length ? values.join(',') : empty });
  }
  const button =
    'rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
  return (
    <fieldset
      disabled={pending}
      aria-busy={pending}
      className="min-w-0 space-y-4 disabled:opacity-60"
    >
      <legend className="sr-only">Période et filtres du planning</legend>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-2">
          <button className={button} onClick={() => move(-1)} aria-label="Période précédente">
            <ChevronLeft size={16} />
          </button>
          <h2 className="min-w-40 text-center text-lg font-semibold capitalize">
            {state.view === 'month'
              ? formatPlanningDate(state.range.start, { month: 'long', year: 'numeric' })
              : `${formatPlanningDate(state.range.start, { day: 'numeric', month: 'short' })} – ${formatPlanningDate(state.range.end, { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </h2>
          <button className={button} onClick={() => move(1)} aria-label="Période suivante">
            <ChevronRight size={16} />
          </button>
          <button className={button} onClick={() => update({ m: today.slice(0, 7), d: today })}>
            Aujourd’hui
          </button>
        </div>
        <div className="flex rounded-lg border border-border p-1" aria-label="Vue du planning">
          {(['month', 'week'] as const).map((view) => (
            <button
              key={view}
              aria-pressed={state.view === view}
              onClick={() => update({ view })}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm',
                state.view === view
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {view === 'month' ? 'Mois' : 'Semaine'}
            </button>
          ))}
        </div>
        <a className={cn(button, conflictCount > 0 && 'text-danger')} href="#planning-conflits">
          {conflictCount} conflit{conflictCount > 1 ? 's' : ''}{' '}
          {state.view === 'month' ? 'ce mois' : 'cette semaine'}
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <details className="relative">
          <summary className={cn(button, 'cursor-pointer')}>
            Formateurs{' '}
            {state.filters.trainerIds?.length ? `(${state.filters.trainerIds.length})` : '· Tous'}
          </summary>
          <div className="absolute left-0 z-40 mt-2 max-h-72 w-64 overflow-auto rounded-xl border border-border bg-background p-3 shadow-lg">
            {trainers.map((t) => (
              <label key={t.id} className="flex items-center gap-2 py-1.5">
                <input
                  type="checkbox"
                  checked={state.filters.trainerIds?.includes(t.id) ?? false}
                  onChange={() => toggle('trainer', state.filters.trainerIds ?? [], t.id)}
                />
                {t.firstName} {t.lastName}
              </label>
            ))}
            <button
              className="mt-2 text-primary underline"
              onClick={() => update({ trainer: null })}
            >
              Tous les formateurs
            </button>
          </div>
        </details>
        {Object.entries(REGIME_LABELS).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={
              state.filters.regimes?.includes(value as keyof typeof REGIME_LABELS) ?? false
            }
            onClick={() => toggle('regime', state.filters.regimes ?? [], value)}
            className={cn(
              button,
              state.filters.regimes?.includes(value as keyof typeof REGIME_LABELS) &&
                'border-primary bg-primary-50 text-primary-700',
            )}
          >
            {label}
          </button>
        ))}
        <details className="relative">
          <summary className={cn(button, 'cursor-pointer')}>
            Statuts ({state.filters.statuses?.length ?? DEFAULT_STATUSES.length})
          </summary>
          <div className="absolute left-0 z-40 mt-2 w-52 rounded-xl border border-border bg-background p-3 shadow-lg">
            {Object.entries(STATUS_LABELS)
              .filter(([key]) => key !== 'DRAFT')
              .map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={(state.filters.statuses ?? DEFAULT_STATUSES).includes(value)}
                    onChange={() =>
                      toggle('status', state.filters.statuses ?? DEFAULT_STATUSES, value, 'none')
                    }
                  />
                  {label}
                </label>
              ))}
          </div>
        </details>
        <label className="ml-1 flex items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={state.filters.includeDrafts ?? false}
            onChange={(e) => update({ drafts: e.target.checked ? '1' : null })}
          />
          Afficher les brouillons
        </label>
      </div>
    </fieldset>
  );
}

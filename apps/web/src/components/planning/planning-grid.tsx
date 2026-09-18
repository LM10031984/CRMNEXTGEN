'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AvailabilityDialog, type AvailabilitySelection } from './availability-dialog';
import { availabilityDayBounds } from '@/lib/planning/availability-time';
import { AlertTriangle, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type PlanningCell,
  type PlanningEntry,
  type PlanningGridData,
  type PlanningAvailability,
} from '@/lib/planning/build-planning-grid';
import {
  formatPlanningDate,
  REGIME_CLASSES,
  REGIME_LABELS,
  STATUS_LABELS,
} from '@/lib/planning/planning-query';

type Segment = {
  start: number;
  end: number;
  lane: number;
  entry?: PlanningEntry;
  absence?: PlanningAvailability;
};
function rowSegments(row: PlanningGridData['rows'][number], week: boolean) {
  const columns = row.cells.flatMap<{ cell: PlanningCell; half: 'morning' | 'afternoon' | null }>(
    (cell) =>
      week
        ? [
            { cell, half: 'morning' as const },
            { cell, half: 'afternoon' as const },
          ]
        : [{ cell, half: null }],
  );
  const groups = new Map<string, Segment[]>();
  columns.forEach(({ cell, half }, index) => {
    const add = (key: string, entry?: PlanningEntry, absence?: PlanningAvailability) => {
      const segments = groups.get(key) ?? [];
      const previous = segments[segments.length - 1];
      if (
        previous &&
        previous.end === index &&
        previous.entry?.conflicts.join() === entry?.conflicts.join()
      )
        previous.end = index + 1;
      else segments.push({ start: index, end: index + 1, lane: 0, entry, absence });
      groups.set(key, segments);
    };
    cell.sessions
      .filter((s) => !half || s.halfDays.includes(half))
      .forEach((s) => add(`session-${s.id}`, s));
    cell.availabilities.forEach((a) => {
      const { start, end } = availabilityDayBounds(cell.date, half);
      if (Date.parse(a.startsAt) < end && Date.parse(a.endsAt) > start)
        add(`absence-${a.id}`, undefined, a);
    });
  });
  const lanes: Segment[][] = [];
  const segments: Segment[] = [];
  for (const group of groups.values()) {
    let lane = lanes.findIndex((occupied) =>
      group.every((s) => occupied.every((o) => s.end <= o.start || s.start >= o.end)),
    );
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    group.forEach((s) => {
      s.lane = lane;
      lanes[lane]!.push(s);
      segments.push(s);
    });
  }
  return { segments, laneCount: Math.max(2, lanes.length), columns };
}
function tooltip(s: PlanningEntry) {
  return `${s.code} · ${s.name || s.productName}\n${s.productName}\n${formatPlanningDate(s.startDate, { dateStyle: 'short' })} – ${formatPlanningDate(s.endDate, { dateStyle: 'short' })}\n${s.locationName || 'Lieu non renseigné'} · ${s.participantCount} / ${s.capacityMax} inscrits\n${STATUS_LABELS[s.status] ?? s.status} · ${REGIME_LABELS[s.regime]}${s.estimated ? '\nDates estimées' : ''}${s.conflicts.length ? '\nConflit : ' + s.conflicts.map((c) => (c === 'same_regime' ? 'sessions de même régime' : 'indisponibilité')).join(', ') : ''}`;
}
export function PlanningGrid({
  grid,
  view,
  today,
  editableTrainerIds = [],
}: {
  grid: PlanningGridData;
  view: 'month' | 'week';
  today: string;
  editableTrainerIds?: string[];
}) {
  const [selection, setSelection] = useState<AvailabilitySelection | null>(null);
  const week = view === 'week';
  const count = grid.days.length * (week ? 2 : 1);
  const outerColumns = `210px repeat(${count}, minmax(${week ? 66 : 40}px, 1fr))`;
  if (!grid.rows.length)
    return (
      <div className="rounded-2xl border border-border bg-background p-12 text-center text-muted-foreground">
        <CalendarRange className="mx-auto mb-3 h-8 w-8" />
        <p>
          Aucun formateur. Un formateur est une personne rattachée à une organisation avec le rôle
          Formateur.
        </p>
      </div>
    );
  return (
    <>
      <div
        className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"
        aria-label="Légende"
      >
        {Object.entries(REGIME_LABELS).map(([regime, label]) => (
          <span key={regime} className="flex items-center gap-2">
            <span
              className={cn(
                'h-3 w-3 rounded-sm border',
                REGIME_CLASSES[regime as keyof typeof REGIME_CLASSES],
              )}
            />
            {label}
          </span>
        ))}
        <span>Bordure forte : principal · fine : co-formateur</span>
        <span>Bordure pointillée : dates estimées</span>
        <span>Hachures : indisponibilité · case vide : disponible</span>
      </div>
      <div
        role="region"
        aria-label="Planning des formateurs"
        tabIndex={0}
        className="isolate max-h-[65vh] overflow-auto rounded-xl border border-border bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div style={{ minWidth: 210 + count * (week ? 66 : 40) }}>
          <div
            className="sticky top-0 z-30 grid border-b border-border bg-background"
            style={{ gridTemplateColumns: outerColumns }}
          >
            <div className="sticky left-0 z-40 flex items-center border-r border-border bg-background px-4 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Formateurs
            </div>
            {grid.days.map((day) => {
              const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
              return (
                <div
                  key={day}
                  className={cn(
                    'border-r border-border py-2 text-center text-xs',
                    weekend && 'bg-muted',
                    day === today && 'bg-primary-100 text-primary-700',
                  )}
                  style={{ gridColumn: `span ${week ? 2 : 1}` }}
                  aria-current={day === today ? 'date' : undefined}
                >
                  <div className="capitalize text-muted-foreground">
                    {formatPlanningDate(day, { weekday: 'short' }).replace('.', '')}
                  </div>
                  <div className="mt-1 font-semibold">
                    {formatPlanningDate(day, {
                      day: 'numeric',
                      ...(week ? { month: 'short' } : {}),
                    })}
                  </div>
                  {week && (
                    <div className="mt-2 grid grid-cols-2 border-t border-border pt-1 text-muted-foreground">
                      <span>Matin</span>
                      <span>Après-midi</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {grid.rows.map((row) => {
            const { segments, laneCount, columns } = rowSegments(row, week);
            const canEdit = editableTrainerIds.includes(row.trainer.id);
            return (
              <div
                key={row.trainer.id}
                data-testid={`trainer-row-${row.trainer.id}`}
                className="grid border-b border-border last:border-b-0"
                style={{ gridTemplateColumns: outerColumns }}
              >
                <div className="sticky left-0 z-20 flex flex-col justify-center gap-2 border-r border-border bg-background px-4 py-4">
                  <Link
                    className="text-sm font-semibold hover:text-primary hover:underline"
                    href={`/app/formateurs/${row.trainer.id}`}
                  >
                    {row.trainer.firstName} {row.trainer.lastName}
                  </Link>
                  <span className="w-fit rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    Principal sur {row.primarySessionCount} session
                    {row.primarySessionCount > 1 ? 's' : ''} {week ? 'cette semaine' : 'ce mois'}
                  </span>
                  {canEdit && (
                    <button
                      className="w-fit text-left text-xs font-medium text-primary hover:underline"
                      aria-label={`Déclarer une indisponibilité pour ${row.trainer.firstName} ${row.trainer.lastName}`}
                      onClick={() => setSelection({ trainer: row.trainer, day: today })}
                    >
                      + Indisponibilité
                    </button>
                  )}
                </div>
                <div
                  className="grid py-2"
                  style={{
                    gridColumn: `2 / span ${count}`,
                    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${laneCount}, 30px)`,
                  }}
                >
                  {columns.map(({ cell, half }, i) => {
                    const empty =
                      !cell.sessions.some((entry) => !half || entry.halfDays.includes(half)) &&
                      cell.availabilities.length === 0;
                    const className = cn(
                      'border-r border-border',
                      [0, 6].includes(new Date(`${cell.date}T00:00:00Z`).getUTCDay()) && 'bg-muted',
                      cell.date === today && 'bg-primary-50',
                    );
                    const style = { gridColumn: i + 1, gridRow: `1 / span ${laneCount}` };
                    return canEdit && empty ? (
                      <button
                        key={`${cell.date}-${half}`}
                        type="button"
                        style={style}
                        className={cn(
                          className,
                          'hover:bg-primary-100 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                        )}
                        aria-label={`Déclarer une indisponibilité pour ${row.trainer.firstName} ${row.trainer.lastName} le ${formatPlanningDate(cell.date, { dateStyle: 'long' })}${half === 'morning' ? ' matin' : half === 'afternoon' ? ' après-midi' : ''}`}
                        onClick={() => setSelection({ trainer: row.trainer, day: cell.date, half })}
                      />
                    ) : (
                      <div key={`${cell.date}-${half}`} className={className} style={style} />
                    );
                  })}
                  {segments.map((segment) => {
                    const { entry, absence } = segment;
                    const style = {
                      gridColumn: `${segment.start + 1} / ${segment.end + 1}`,
                      gridRow: segment.lane + 1,
                    };
                    if (entry)
                      return (
                        <Link
                          key={`${entry.id}-${segment.start}`}
                          href={`/app/sessions/${entry.id}`}
                          data-session-id={entry.id}
                          data-regime={entry.regime}
                          title={tooltip(entry)}
                          aria-label={tooltip(entry)}
                          className={cn(
                            'relative z-10 mx-0.5 my-0.5 flex min-w-0 items-center gap-1 overflow-hidden rounded-md px-1.5 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                            REGIME_CLASSES[entry.regime],
                            entry.isPrimary ? 'border-2' : 'border',
                            entry.estimated && 'border-dashed',
                            entry.conflicts.length > 0 && 'ring-2 ring-inset ring-danger',
                          )}
                          style={style}
                        >
                          {entry.conflicts.length > 0 && (
                            <AlertTriangle className="h-3 w-3 shrink-0 text-danger" />
                          )}
                          <span className="truncate">
                            {entry.code} · {entry.name || entry.productName}
                          </span>
                        </Link>
                      );
                    return (
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-label={`Modifier l’indisponibilité de ${row.trainer.firstName} ${row.trainer.lastName}`}
                        onClick={() =>
                          setSelection({ trainer: row.trainer, day: today, availability: absence })
                        }
                        key={`${absence!.id}-${segment.start}`}
                        title={`${absence!.status === 'busy' ? 'Indisponible' : 'À confirmer'}${absence!.note ? ` · ${absence!.note}` : ''}`}
                        className={cn(
                          'relative mx-0.5 my-0.5 truncate rounded border border-border px-2 py-1 text-[11px]',
                          absence!.status === 'busy'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-background text-muted-foreground/60',
                        )}
                        style={{
                          ...style,
                          backgroundImage:
                            'repeating-linear-gradient(135deg, transparent, transparent 6px, currentColor 6px, currentColor 7px)',
                        }}
                      >
                        <span className="rounded bg-background px-1">
                          {absence!.status === 'busy' ? 'Indisponible' : 'À confirmer'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <section id="planning-conflits" className="scroll-mt-8 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Conflits sur la période · {grid.conflicts.length}</h2>
        {grid.conflicts.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Aucun conflit détecté.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {grid.conflicts.map((conflict) => {
              const row = grid.rows.find((r) => r.trainer.id === conflict.trainerId)!;
              return (
                <li
                  key={`${conflict.trainerId}-${conflict.date}-${conflict.type}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <AlertTriangle className="h-4 w-4 text-danger" />
                  <span>
                    {row.trainer.firstName} {row.trainer.lastName} ·{' '}
                    {formatPlanningDate(conflict.date, { day: 'numeric', month: 'long' })} ·{' '}
                    {conflict.type === 'same_regime'
                      ? 'Sessions de même régime'
                      : 'Indisponibilité'}
                  </span>
                  {conflict.sessionIds.map((id) => (
                    <Link key={id} className="text-primary underline" href={`/app/sessions/${id}`}>
                      {
                        row.cells
                          .find((c) => c.date === conflict.date)
                          ?.sessions.find((s) => s.id === id)?.code
                      }
                    </Link>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {selection && <AvailabilityDialog selection={selection} onClose={() => setSelection(null)} />}
    </>
  );
}

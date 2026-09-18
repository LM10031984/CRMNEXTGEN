'use client';
import { useState } from 'react';
import { AvailabilityDialog, type AvailabilitySelection } from './availability-dialog';
import type { PlanningAvailability, PlanningTrainer } from '@/lib/planning/build-planning-grid';
import { toParisInput } from '@/lib/planning/availability-time';

export function TrainerAvailabilities({
  trainer,
  availabilities,
  canEdit,
  today,
  reason,
}: {
  trainer: PlanningTrainer;
  availabilities: PlanningAvailability[];
  canEdit: boolean;
  today: string;
  reason?: string | null;
}) {
  const [selection, setSelection] = useState<AvailabilitySelection | null>(null);
  const format = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  return (
    <section className="rounded-2xl border border-border bg-background p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Prochaines disponibilités
      </h2>
      {availabilities.length ? (
        <ul className="space-y-2 text-sm">
          {availabilities.map((a) => (
            <li key={a.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">
                {a.status === 'busy'
                  ? 'Indisponible'
                  : a.status === 'tentative'
                    ? 'À confirmer'
                    : 'Disponible'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {format(a.startsAt)} → {format(a.endsAt)}
              </p>
              {a.note && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{a.note}</p>
              )}
              {canEdit && ['busy', 'tentative'].includes(a.status) && (
                <button
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                  onClick={() =>
                    setSelection({
                      trainer,
                      day: toParisInput(a.startsAt).slice(0, 10),
                      availability: a,
                    })
                  }
                >
                  Modifier l’indisponibilité
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune indisponibilité à venir.</p>
      )}
      {canEdit && (
        <button
          className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
          onClick={() => setSelection({ trainer, day: today })}
        >
          Déclarer une indisponibilité
        </button>
      )}
      {reason && <p className="mt-3 text-xs text-muted-foreground">{reason}</p>}
      {selection && <AvailabilityDialog selection={selection} onClose={() => setSelection(null)} />}
    </section>
  );
}

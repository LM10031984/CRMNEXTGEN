'use client';

/**
 * Phase 15 Lot 3 (15-03) — Onglet « Agenda ».
 *
 * Maison UNIQUE de la synchro Google Calendar (Phase 14) : réembarque le
 * composant `<SessionCalendarSyncToggle>` (moteur idempotent `syncSessionCalendarAction`
 * — re-sync = 0 doublon, prouvé Phase 14) et affiche les créneaux de la session
 * jour par jour EN LECTURE.
 *
 * NE REIMPLÉMENTE AUCUNE logique de synchro : le toggle + l'action + `lib/calendar/*`
 * viennent de la Phase 14 et ne sont pas retouchés. Le doublon du toggle dans
 * l'en-tête / Paramètres est retiré (« 1 surface = 1 endroit »).
 *
 * Les créneaux éditables interactifs (SessionSlot édition) restent HORS phase :
 * ici, lecture seule (date + horaires figés 9h-13h / 14h-18h).
 */

import { CalendarClock, Clock } from 'lucide-react';
import { SessionCalendarSyncToggle } from '../session-calendar-sync-toggle';

/** Créneau sérialisé (SessionSlot aplati côté serveur — date en ISO string). */
export interface AgendaSlot {
  id: string;
  /** ISO date string (jour du créneau). */
  date: string;
  startTime: string;
  endTime: string;
  /** "morning" | "afternoon" | "full". */
  halfDay: string;
}

interface Props {
  sessionId: string;
  /** Session passée → notification désactivée côté toggle (trace uniquement). */
  isPastSession: boolean;
  /** Créneaux de la session, affichés en lecture (jour par jour). */
  slots: AgendaSlot[];
  /** Garde RBAC (ADMIN/MANAGER) : sans droit d'écriture, pas de bouton de synchro. */
  canEdit: boolean;
}

const HALF_DAY_LABEL: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  full: 'Journée',
};

const dayFmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dayFmt.format(d);
}

export function TabAgenda({ sessionId, isPastSession, slots, canEdit }: Props) {
  // Tri chronologique (date puis heure de début) — lecture ordonnée.
  const ordered = [...slots].sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return a.startTime.localeCompare(b.startTime);
  });

  return (
    <div className="space-y-6 pt-4">
      {/* ── Synchro Google Calendar (Phase 14) — maison unique ────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Synchronisation Google Calendar</h2>
        </div>
        {canEdit ? (
          <SessionCalendarSyncToggle sessionId={sessionId} isPastSession={isPastSession} />
        ) : (
          <p className="text-xs text-muted-foreground">
            La synchronisation de l'agenda est réservée aux rôles ADMIN / MANAGER.
          </p>
        )}
      </section>

      {/* ── Créneaux de la session (lecture seule) ────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Créneaux de la formation</h2>
        </div>

        {ordered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun créneau enregistré pour cette session. Les créneaux éditables
            interactifs arriveront dans un chantier ultérieur.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {ordered.map((slot) => (
              <li
                key={slot.id}
                data-testid="agenda-slot"
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span className="font-medium capitalize">{formatDay(slot.date)}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="rounded-full bg-muted/50 px-2 py-0.5 text-xs">
                    {HALF_DAY_LABEL[slot.halfDay] ?? slot.halfDay}
                  </span>
                  <span className="tabular-nums">
                    {slot.startTime} – {slot.endTime}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Lecture seule — l'édition des créneaux (agenda interactif) est un
          chantier ultérieur.
        </p>
      </section>
    </div>
  );
}

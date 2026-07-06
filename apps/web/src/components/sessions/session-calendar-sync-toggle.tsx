'use client';

/**
 * Surface UI fiche session — synchro Google Calendar (Phase 14, Plan 14-06).
 *
 * Toggle "Envoyer réellement les invitations aux apprenants" (pilote sendUpdates
 * côté cœur) + bouton "Synchroniser l'agenda Google" qui appelle la server action
 * auth-gatée `syncSessionCalendarAction` via useTransition, avec toast sonner.
 *
 * Règle invites : sessions à venir → le toggle décide la notification réelle ;
 * sessions passées → toggle désactivé (trace uniquement, jamais de spam).
 * Le formateur réel est TOUJOURS invité (géré côté cœur).
 */

import { useState, useTransition } from 'react';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { syncSessionCalendarAction } from '@/server/actions/calendar-sync';

interface Props {
  sessionId: string;
  /** session passée → notification désactivée (trace uniquement). */
  isPastSession: boolean;
  /**
   * 'drawer' (défaut) = bloc complet avec toggle "notifier les apprenants" (Paramètres).
   * 'header' = bouton compact pour la barre d'actions de la fiche (sync rapide,
   * sans notification aux apprenants — la notification reste dans le tiroir Paramètres).
   */
  variant?: 'drawer' | 'header';
}

export function SessionCalendarSyncToggle({
  sessionId,
  isPastSession,
  variant = 'drawer',
}: Props) {
  const [notifyLearners, setNotifyLearners] = useState(false);
  const [pending, startTransition] = useTransition();

  // notify : le bouton en-tête ne notifie jamais les apprenants (sync rapide sûre) ;
  // seul le tiroir Paramètres expose le toggle.
  function runSync(notify: boolean) {
    startTransition(async () => {
      const r = await syncSessionCalendarAction({ sessionId, notifyLearners: notify });
      if (r.ok) {
        const { inserted, updated, skipped } = r.recap;
        toast.success(
          `Agenda synchronisé : ${inserted} créés, ${updated} mis à jour` +
            (skipped ? `, ${skipped} ignorés` : ''),
        );
      } else {
        toast.error(r.error ?? 'Erreur lors de la synchronisation');
      }
    });
  }

  function sync() {
    runSync(notifyLearners);
  }

  // Variante en-tête : bouton compact (style aligné sur DocsButton). `disabled={pending}`
  // empêche un 2e clic pendant la synchro ; le cœur est idempotent (re-clic = update, 0 doublon).
  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={() => runSync(false)}
        disabled={pending}
        title="Créer / mettre à jour les événements agenda de cette session (idempotent)"
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
        )}
        {pending ? 'Synchro…' : "Synchroniser l'agenda"}
      </button>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Crée/maj l'événement de formation, les 15 rappels (J-15 → veille) et les 3 relances
        satisfaction dans l'agenda « Rappel Formations ». Idempotent : un re-clic ne crée pas de
        doublon.
      </p>

      {isPastSession ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Session passée — invitations en trace uniquement (pas de notification aux apprenants).
        </p>
      ) : (
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={notifyLearners}
            disabled={pending}
            onChange={(e) => setNotifyLearners(e.target.checked)}
          />
          Envoyer réellement les invitations aux apprenants
        </label>
      )}

      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-600 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Synchroniser l'agenda Google
      </button>
    </div>
  );
}

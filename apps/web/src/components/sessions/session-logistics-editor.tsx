'use client';

/**
 * Mini-éditeur logistique session (C4.i17 Qualiopi) :
 *   - Hébergement formateur (oui/non + dates + lieu)
 *   - Accessibilité PSH (oui/non + adaptations)
 *
 * Affiché sur la fiche session. Sauvegarde inline via updateSessionLogistics.
 */

import { useState, useTransition } from 'react';
import { Check, Loader2, BedDouble, Accessibility } from 'lucide-react';
import { toast } from 'sonner';
import { updateSessionLogistics } from '@/server/actions/sessions';

interface Props {
  sessionId: string;
  initial: {
    needsTrainerLodging: boolean;
    trainerLodgingPlace: string | null;
    trainerLodgingDates: string | null;
    hasDisabledLearner: boolean;
    disabilityAdaptations: string | null;
  };
}

export function SessionLogisticsEditor({ sessionId, initial }: Props) {
  const [needsTrainerLodging, setNeedsTrainerLodging] = useState(initial.needsTrainerLodging);
  const [trainerLodgingPlace, setTrainerLodgingPlace] = useState(initial.trainerLodgingPlace ?? '');
  const [trainerLodgingDates, setTrainerLodgingDates] = useState(initial.trainerLodgingDates ?? '');
  const [hasDisabledLearner, setHasDisabledLearner] = useState(initial.hasDisabledLearner);
  const [disabilityAdaptations, setDisabilityAdaptations] = useState(initial.disabilityAdaptations ?? '');
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await updateSessionLogistics({
        sessionId,
        needsTrainerLodging,
        trainerLodgingPlace,
        trainerLodgingDates,
        hasDisabledLearner,
        disabilityAdaptations,
      });
      if (r.ok) toast.success('Logistique enregistrée');
      else toast.error(r.error ?? 'Erreur');
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Logistique session (Qualiopi C4.i17)
        </h2>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-600 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Enregistrer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {/* Hébergement formateur */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 font-medium">
            <BedDouble className="h-4 w-4 text-primary" />
            <input
              type="checkbox"
              checked={needsTrainerLodging}
              onChange={(e) => setNeedsTrainerLodging(e.target.checked)}
            />
            Réservation hébergement formateur
          </label>
          {needsTrainerLodging && (
            <div className="space-y-1.5 pl-6">
              <input
                type="text"
                placeholder="Dates (ex: Du 12/05 au 14/05)"
                value={trainerLodgingDates}
                onChange={(e) => setTrainerLodgingDates(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-xs"
              />
              <input
                type="text"
                placeholder="Lieu (ex: Hôtel Mercure Nice)"
                value={trainerLodgingPlace}
                onChange={(e) => setTrainerLodgingPlace(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-xs"
              />
            </div>
          )}
        </div>

        {/* Accessibilité PSH */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 font-medium">
            <Accessibility className="h-4 w-4 text-primary" />
            <input
              type="checkbox"
              checked={hasDisabledLearner}
              onChange={(e) => setHasDisabledLearner(e.target.checked)}
            />
            Accueil d'une personne en situation de handicap
          </label>
          {hasDisabledLearner && (
            <div className="pl-6">
              <textarea
                placeholder="Adaptations à prévoir (accès, supports, durée…)"
                value={disabilityAdaptations}
                onChange={(e) => setDisabilityAdaptations(e.target.value)}
                rows={3}
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-xs"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

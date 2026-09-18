'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import {
  CreateTrainerAvailabilitySchema,
  UpdateTrainerAvailabilitySchema,
} from '@qualiof/shared/schemas';
import {
  createTrainerAvailability,
  updateTrainerAvailability,
  deleteTrainerAvailability,
} from '@/server/actions/trainer-availability';
import { toParisInput, parisInputToISO } from '@/lib/planning/availability-time';
import type { PlanningTrainer, PlanningAvailability } from '@/lib/planning/build-planning-grid';

export type AvailabilitySelection = {
  trainer: PlanningTrainer;
  day: string;
  half?: 'morning' | 'afternoon' | null;
  availability?: PlanningAvailability;
};
export function AvailabilityDialog({
  selection,
  onClose,
}: {
  selection: AvailabilitySelection;
  onClose: () => void;
}) {
  const router = useRouter();
  const existing = selection.availability;
  const [start, setStart] = useState(
    existing
      ? toParisInput(existing.startsAt)
      : `${selection.day}T${selection.half === 'afternoon' ? '13:00' : '09:00'}`,
  );
  const [end, setEnd] = useState(
    existing
      ? toParisInput(existing.endsAt)
      : `${selection.day}T${selection.half === 'morning' ? '12:00' : '17:00'}`,
  );
  const [status, setStatus] = useState(existing?.status === 'tentative' ? 'tentative' : 'busy');
  const [note, setNote] = useState(existing?.note ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const field =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
  const button =
    'rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50';
  async function save(remove = false) {
    setError(null);
    // Préserve les secondes des données importées lorsque l'heure n'a pas été touchée.
    const startsAt =
      existing && start === toParisInput(existing.startsAt)
        ? existing.startsAt
        : parisInputToISO(start);
    const endsAt =
      existing && end === toParisInput(existing.endsAt) ? existing.endsAt : parisInputToISO(end);
    const value = { startsAt, endsAt, status, note };
    if (!remove) {
      if (!startsAt || !endsAt) {
        setError('Saisissez des dates et heures valides (heure de Paris).');
        return;
      }
      const checked = existing
        ? UpdateTrainerAvailabilitySchema.safeParse({ id: existing.id, ...value })
        : CreateTrainerAvailabilitySchema.safeParse({ trainerId: selection.trainer.id, ...value });
      if (!checked.success) {
        setError(checked.error.issues[0]!.message);
        return;
      }
    }
    setPending(true);
    try {
      const result =
        remove && existing
          ? await deleteTrainerAvailability({ id: existing.id })
          : existing
            ? await updateTrainerAvailability({ id: existing.id, ...value })
            : await createTrainerAvailability({ trainerId: selection.trainer.id, ...value });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(remove ? 'Indisponibilité supprimée.' : 'Indisponibilité enregistrée.');
      router.refresh();
      onClose();
    } catch {
      setError(
        'La modification n’a pas pu être confirmée. Vérifiez votre connexion puis réessayez.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[90vh] w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
          <Dialog.Title className="pr-7 text-lg font-semibold">
            {existing ? 'Modifier une indisponibilité' : 'Déclarer une indisponibilité'}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {selection.trainer.firstName} {selection.trainer.lastName} · Heures de Paris
          </Dialog.Description>
          <Dialog.Close
            disabled={pending}
            aria-label="Fermer"
            className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </Dialog.Close>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={pending || confirmDelete} className="space-y-4 disabled:opacity-60">
              <div>
                <label htmlFor="availability-start" className="mb-1 block text-sm font-medium">
                  Début
                </label>
                <input
                  id="availability-start"
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setError(null);
                  }}
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="availability-end" className="mb-1 block text-sm font-medium">
                  Fin
                </label>
                <input
                  id="availability-end"
                  type="datetime-local"
                  required
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setError(null);
                  }}
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="availability-status" className="mb-1 block text-sm font-medium">
                  Statut
                </label>
                <select
                  id="availability-status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setError(null);
                  }}
                  className={field}
                >
                  <option value="busy">Indisponible</option>
                  <option value="tentative">À confirmer</option>
                </select>
              </div>
              <div>
                <label htmlFor="availability-note" className="mb-1 block text-sm font-medium">
                  Note (facultative)
                </label>
                <textarea
                  id="availability-note"
                  rows={3}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setError(null);
                  }}
                  className={field}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Visible par les personnes ayant accès au planning.
                </p>
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
                {error}
              </p>
            )}
            {confirmDelete ? (
              <div className="space-y-3 rounded-lg border border-danger/30 p-3">
                <p className="text-sm">Supprimer cette indisponibilité ?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    className={`${button} text-danger`}
                    onClick={() => void save(true)}
                  >
                    Confirmer la suppression
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className={button}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Conserver
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {existing && (
                  <button
                    type="button"
                    disabled={pending}
                    className={`${button} mr-auto text-danger`}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Supprimer
                  </button>
                )}
                <button type="button" disabled={pending} className={button} onClick={onClose}>
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className={`${button} border-primary bg-primary text-primary-foreground`}
                >
                  {pending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            )}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

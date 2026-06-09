'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { updateParticipant } from '@/server/actions/sessions';
import { useServerAction } from '@/lib/hooks/use-server-action';

/**
 * P3.1 — Migré sur `useServerAction` (mode simple). Plus de toast manuel,
 * plus de useState busy/setError pour l'erreur serveur : le hook gère le
 * pending, le toast d'erreur et le router.refresh() après succès.
 *
 * L'erreur locale de validation Prix HT (parseFloat NaN) reste en useState
 * car ce n'est PAS une erreur serveur (rejet pré-appel).
 */

interface EditParticipantButtonProps {
  participantId: string;
  currentPriceHT: number;
  currentStatus: string;
  currentFinancingRequestDate?: Date | string | null;
}

const STATUS_OPTIONS = [
  { value: 'PRE_ENROLLED', label: 'Pré-inscrit' },
  { value: 'VALIDATED', label: 'Validé (financement OK)' },
  { value: 'IN_PROGRESS', label: 'En formation' },
  { value: 'COMPLETED', label: 'Terminé' },
  { value: 'CANCELLED', label: 'Annulé' },
] as const;

function toIsoDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function EditParticipantButton({
  participantId,
  currentPriceHT,
  currentStatus,
  currentFinancingRequestDate,
}: EditParticipantButtonProps) {
  const [open, setOpen] = useState(false);
  const [priceHT, setPriceHT] = useState<string>(String(currentPriceHT));
  const [status, setStatus] = useState<string>(currentStatus);
  const [financingRequestDate, setFinancingRequestDate] = useState<string>(
    toIsoDate(currentFinancingRequestDate),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const { execute, pending } = useServerAction({
    action: (input: Parameters<typeof updateParticipant>[0]) =>
      updateParticipant(input),
    successMessage: ([input]) =>
      `Inscription mise à jour${input.priceHT !== undefined ? ` — ${input.priceHT.toFixed(2)} €` : ''}`,
    onSuccess: () => setOpen(false),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const parsedPrice = parseFloat(priceHT.replace(',', '.'));
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setValidationError('Prix HT invalide.');
      return;
    }

    execute({
      participantId,
      priceHT: parsedPrice,
      enrollmentStatus: status as Parameters<typeof updateParticipant>[0]['enrollmentStatus'],
      financingRequestDate: financingRequestDate || null,
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground"
        title="Modifier prix HT et statut"
      >
        <Pencil className="h-3 w-3" />
        Éditer
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-4">Modifier l'inscription</h3>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Prix HT (€)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceHT}
                  onChange={(e) => setPriceHT(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder="ex: 2000"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Statut d'inscription
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Date de dépôt du dossier (AGEFICE / OPCO)
                </label>
                <input
                  type="date"
                  value={financingRequestDate}
                  onChange={(e) => setFinancingRequestDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Détermine l'année à laquelle le budget AGEFICE est imputé. Vide = on prend la date de la session par défaut.
                </p>
              </div>
              {validationError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {validationError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

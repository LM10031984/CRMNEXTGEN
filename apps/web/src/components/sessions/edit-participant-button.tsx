'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { updateParticipant } from '@/server/actions/sessions';

interface EditParticipantButtonProps {
  participantId: string;
  currentPriceHT: number;
  currentStatus: string;
}

const STATUS_OPTIONS = [
  { value: 'PRE_ENROLLED', label: 'Pré-inscrit' },
  { value: 'VALIDATED', label: 'Validé (financement OK)' },
  { value: 'IN_PROGRESS', label: 'En formation' },
  { value: 'COMPLETED', label: 'Terminé' },
  { value: 'CANCELLED', label: 'Annulé' },
] as const;

export function EditParticipantButton({
  participantId,
  currentPriceHT,
  currentStatus,
}: EditParticipantButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [priceHT, setPriceHT] = useState<string>(String(currentPriceHT));
  const [status, setStatus] = useState<string>(currentStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const parsedPrice = parseFloat(priceHT.replace(',', '.'));
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Prix HT invalide.');
      setBusy(false);
      return;
    }

    try {
      const r = await updateParticipant({
        participantId,
        priceHT: parsedPrice,
        enrollmentStatus: status as any,
      });
      if (r.ok) {
        toast.success(`Inscription mise à jour — ${parsedPrice.toFixed(2)} €`);
        setOpen(false);
        router.refresh();
      } else {
        setError(r.error ?? 'Erreur inconnue.');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
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
          onClick={() => !busy && setOpen(false)}
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
              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

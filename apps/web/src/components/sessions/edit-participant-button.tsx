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
  currentFinancingRequestDate?: Date | string | null;
  currentFinancingMode?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'PRE_ENROLLED', label: 'Pré-inscrit' },
  { value: 'VALIDATED', label: 'Validé (financement OK)' },
  { value: 'IN_PROGRESS', label: 'En formation' },
  { value: 'COMPLETED', label: 'Terminé' },
  { value: 'CANCELLED', label: 'Annulé' },
] as const;

// Miroir exact du wizard session (étape 3) — même libellés, même ordre.
const FINANCING_OPTIONS = [
  { value: '', label: '— Mode de financement —' },
  { value: 'OPCO', label: 'OPCO' },
  { value: 'CPF', label: 'CPF' },
  { value: 'ENTREPRISE', label: 'Entreprise (paie directement)' },
  { value: 'AUTOFINANCEMENT', label: 'Autofinancement' },
  { value: 'POLE_EMPLOI', label: 'Pôle Emploi' },
  { value: 'AUTRE', label: 'Autre' },
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
  currentFinancingMode,
}: EditParticipantButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [priceHT, setPriceHT] = useState<string>(String(currentPriceHT));
  const [status, setStatus] = useState<string>(currentStatus);
  const [financingMode, setFinancingMode] = useState<string>(currentFinancingMode ?? '');
  const [financingRequestDate, setFinancingRequestDate] = useState<string>(
    toIsoDate(currentFinancingRequestDate),
  );
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
        financingRequestDate: financingRequestDate || null,
        financingMode: (financingMode || null) as any,
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
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Mode de financement
                </label>
                <select
                  value={financingMode}
                  onChange={(e) => setFinancingMode(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                >
                  {FINANCING_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
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

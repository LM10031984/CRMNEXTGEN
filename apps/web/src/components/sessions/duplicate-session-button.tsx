'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { duplicateSession } from '@/server/actions/sessions';

function plusOneMonth(iso: string): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function DuplicateSessionButton({
  sessionId,
  sessionCode,
  sourceStartDate,
}: {
  sessionId: string;
  sessionCode: string;
  sourceStartDate: Date | string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const defaultDate = plusOneMonth(typeof sourceStartDate === 'string' ? sourceStartDate : sourceStartDate.toISOString());
  const [newStartDate, setNewStartDate] = useState(defaultDate);
  const [recurring, setRecurring] = useState(false);
  const [count, setCount] = useState('3');
  const [intervalMonths, setIntervalMonths] = useState('1');

  async function onConfirm() {
    if (!newStartDate) return;
    setBusy(true);
    try {
      const r = await duplicateSession({
        sessionId,
        newStartDate,
        recurrence: recurring
          ? { count: Math.max(1, parseInt(count, 10) || 1), intervalMonths: Math.max(1, parseInt(intervalMonths, 10) || 1) }
          : undefined,
      });
      if ('ok' in r && r.ok) {
        const n = r.createdIds.length;
        toast.success(
          n === 1
            ? `Session ${r.firstCode} créée (brouillon)`
            : `${n} sessions créées (à partir de ${r.firstCode})`,
        );
        setOpen(false);
        router.push(`/app/sessions/${r.createdIds[0]}` as any);
      } else {
        toast.error('error' in r ? r.error : 'Erreur inconnue');
        setBusy(false);
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e?.message ?? e}`);
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted text-muted-foreground"
          title="Dupliquer cette session"
        >
          <Copy className="h-3.5 w-3.5" />
          Dupliquer
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Dupliquer la session</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-1">
                Crée une nouvelle session avec le même produit, tarif et formateurs que <code className="font-mono text-xs">{sessionCode}</code>. Les inscrits ne sont pas reportés. Statut <em>brouillon</em>.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={busy}
                className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Nouvelle date de début
              </label>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                La date de fin sera calculée automatiquement (même durée que la session source).
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4"
              />
              <span>Récurrence — créer plusieurs occurrences</span>
            </label>

            {recurring && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Nombre d'occurrences
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={24}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Intervalle (mois)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={intervalMonths}
                    onChange={(e) => setIntervalMonths(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={busy}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
              >
                Annuler
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!newStartDate || busy}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" />
              {busy ? 'Création…' : 'Dupliquer'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

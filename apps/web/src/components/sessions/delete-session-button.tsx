'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { deleteSession } from '@/server/actions/sessions';

export function DeleteSessionButton({
  sessionId,
  sessionCode,
  participantCount,
}: {
  sessionId: string;
  sessionCode: string;
  participantCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [busy, setBusy] = useState(false);

  const isMatch = confirmCode.trim().toUpperCase() === sessionCode.toUpperCase();

  async function onConfirm() {
    if (!isMatch) return;
    setBusy(true);
    try {
      const r = await deleteSession(sessionId);
      if (r.ok) {
        toast.success(`Session ${sessionCode} supprimée`);
        router.push('/app/sessions');
      } else {
        toast.error(r.error ?? 'Erreur lors de la suppression');
        setBusy(false);
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e?.message ?? e}`);
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          setOpen(o);
          if (!o) setConfirmCode('');
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Supprimer la session
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-xl p-6 data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <div className="flex items-start gap-3">
            <div className="shrink-0 h-10 w-10 rounded-full bg-red-100 inline-flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-700" />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-lg font-semibold">
                Supprimer la session définitivement
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-1">
                Cette action est <strong>irréversible</strong>.
                {participantCount > 0 ? (
                  <>
                    {' '}
                    Les <strong>{participantCount} inscription{participantCount > 1 ? 's' : ''}</strong> rattachée{participantCount > 1 ? 's' : ''} seront supprimée{participantCount > 1 ? 's' : ''} en cascade (factures, documents, présences).
                  </>
                ) : (
                  ' La session sera retirée de l\'historique.'
                )}
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

          <div className="mt-5">
            <label className="block text-sm font-medium mb-1.5">
              Pour confirmer, tape le code de la session :{' '}
              <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">{sessionCode}</code>
            </label>
            <input
              type="text"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder={sessionCode}
              autoFocus
              autoComplete="off"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-red-500"
            />
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
              disabled={!isMatch || busy}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {busy ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

'use client';

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw, Loader2 } from 'lucide-react';
import { reassignLead } from '@/server/actions/leads';

/**
 * Bouton "Réassigner" sur fiche Lead (Phase 9 Plan 09-03 — LEAD-01).
 *
 * Décision technique (Plan 09-03 Rule 3 — blocking issue) :
 *  Le plan demandait `@radix-ui/react-alert-dialog` qui n'est PAS installé
 *  dans `apps/web/package.json`. La référence officielle Phase 4 du pattern
 *  AlertDialog (`components/layout/user-menu-button.tsx`) utilise
 *  `@radix-ui/react-dialog` pour la confirmation déconnexion (même UX).
 *  Cohérent : on suit le pattern existant sans ajouter de dépendance.
 *
 * Flow :
 *  1. Trigger ouvre la modal de confirmation.
 *  2. Confirm → `reassignLead(leadId)` (server action Plan 09-02).
 *  3. Succès → toast vert + `router.refresh()` (revalidate fiche).
 *  4. Erreur → toast rouge avec message serveur.
 */
export function ReassignLeadButton({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      const r = await reassignLead(leadId);
      if (r.ok) {
        toast.success(
          `Lead réassigné à ${r.data?.ownerName ?? 'un commercial'}`,
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Réassigner
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <Dialog.Title className="text-lg font-semibold">
            Réassigner ce lead ?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Le lead sera réattribué au commercial le moins chargé (algorithme
            round-robin équilibré). Le commercial recevra une notification cloche
            + email (selon les préférences du tenant).
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm disabled:opacity-50"
              >
                Annuler
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Réassignation…
                </>
              ) : (
                'Réassigner'
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

'use client';

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Stamp, Loader2 } from 'lucide-react';
import { generateAcquittedInvoicePdf } from '@/server/actions/invoices';

/**
 * Quick 260813-efh — bouton « Version acquittée (OPCO/AGEFICE) » sur la fiche
 * facture.
 *
 * Remplace le rituel manuel de Laurent : ouvrir la facture, coller la mention
 * « payé », le « Fait à … le … », son tampon et sa signature, ré-enregistrer.
 * Le PDF produit porte le MÊME numéro que la facture d'origine — c'est un
 * duplicata acquitté, pas une seconde facture.
 *
 * Deux chemins (décision D-3, Laurent 13/08) :
 *  1. Facture soldée → génération directe, ouverture du PDF dans un onglet.
 *  2. Facture non soldée → dialog d'avertissement + saisie obligatoire de la
 *     date de règlement réelle (Laurent encaisse parfois hors de l'app). On
 *     avertit, on ne bloque pas.
 *
 * Pattern Dialog repris de `send-reminder-button.tsx` (Phase 11 Plan 11-06) :
 * `@radix-ui/react-alert-dialog` n'est pas installé dans le projet.
 */
interface Props {
  invoiceId: string;
  status: string;
  isFullyPaid: boolean;
}

export function DownloadAcquittedButton({ invoiceId, status, isFullyPaid }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));

  // Un avoir, un brouillon ou une facture annulée n'a pas de pièce acquittée.
  if (['CREDIT_NOTE', 'DRAFT', 'CANCELLED'].includes(status)) return null;

  function generate(paidAtOverride?: string) {
    startTransition(async () => {
      const res = await generateAcquittedInvoicePdf({ invoiceId, paidAtOverride });
      if (res.ok) {
        toast.success('Pièce acquittée générée — tampon PAYÉ et signature apposés.');
        setOpen(false);
        window.open(`/api/documents-by-invoice/${invoiceId}/acquittee`, '_blank');
      } else {
        toast.error(res.error);
      }
    });
  }

  const triggerClasses =
    'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-emerald-300 bg-emerald-50 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed';

  // Facture soldée : rien à confirmer, on génère directement.
  if (isFullyPaid) {
    return (
      <button
        type="button"
        onClick={() => generate()}
        disabled={pending}
        title="Duplicata tamponné « PAYÉ » et signé, à joindre au dossier de remboursement OPCO/AGEFICE. Même numéro de facture."
        className={triggerClasses}
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Génération…
          </>
        ) : (
          <>
            <Stamp className="h-4 w-4" /> Version acquittée (OPCO/AGEFICE)
          </>
        )}
      </button>
    );
  }

  // Facture non soldée : on demande la date de règlement réelle.
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title="Cette facture n'est pas soldée dans l'app — la date de règlement vous sera demandée."
          className={triggerClasses}
        >
          <Stamp className="h-4 w-4" /> Version acquittée (OPCO/AGEFICE)
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] max-w-[92vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <Dialog.Title className="text-lg font-semibold">
            Cette facture n&apos;est pas soldée
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Vous êtes sur le point d&apos;éditer une pièce portant la mention
            « PAYÉ » alors que le règlement n&apos;est pas enregistré dans
            l&apos;app. Indiquez la date à laquelle la facture a réellement été
            réglée — c&apos;est elle qui figurera sur le document.
          </Dialog.Description>

          <label className="mt-4 block text-sm font-medium">
            Date de règlement réelle
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 block w-full h-9 px-3 rounded-md border border-border text-sm"
            />
          </label>

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
              onClick={() => generate(paidAt)}
              disabled={pending || !paidAt}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 text-sm disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Génération…
                </>
              ) : (
                'Générer la pièce acquittée'
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

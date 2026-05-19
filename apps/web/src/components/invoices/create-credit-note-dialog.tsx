'use client';

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileMinus, Loader2 } from 'lucide-react';
import { CreateCreditNoteSchema, type CreateCreditNoteInput } from '@qualiof/shared';
import { createCreditNote } from '@/server/actions/invoices';

/**
 * Phase 11 Plan 11-05 — CTA "Créer un avoir" + Dialog Radix de saisie.
 *
 * Pattern cloné depuis `components/leads/reassign-lead-button.tsx` (Phase 9-03)
 * — `@radix-ui/react-dialog` (et NON `react-alert-dialog` qui n'est pas installé).
 *
 * Flow :
 *  1. Trigger ouvre la Dialog (montant pré-rempli au max créditable).
 *  2. Submit → server action `createCreditNote(input)` (Plan 11-05 Task 2).
 *  3. Succès → toast vert avec n° AVO + `router.refresh()` (revalidate fiche).
 *  4. Erreur → toast rouge avec message serveur.
 *
 * RBAC : le bouton est rendu côté Server Component parent (page facture)
 * via la prop `status` ∈ {ISSUED, PAID, PARTIAL, OVERDUE} — pas de check ici
 * (le serveur revalide systématiquement via `requireRole` D-19).
 */
interface Props {
  originalInvoiceId: string;
  originalAmountHt: number; // affiché en aide (max autorisé sur cette ligne)
  originalNumber: string;
}

export function CreateCreditNoteDialog({
  originalInvoiceId,
  originalAmountHt,
  originalNumber,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateCreditNoteInput>({
    resolver: zodResolver(CreateCreditNoteSchema),
    defaultValues: {
      originalInvoiceId,
      amountHtToCredit: originalAmountHt,
      motif: '',
    },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const res = await createCreditNote(data);
      if (res.ok) {
        toast.success(`Avoir ${res.number} créé`);
        setOpen(false);
        reset({
          originalInvoiceId,
          amountHtToCredit: originalAmountHt,
          motif: '',
        });
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-amber-300 bg-amber-50 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          <FileMinus className="h-4 w-4" /> Créer un avoir
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[520px] max-w-[92vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <Dialog.Title className="text-lg font-semibold">
            Créer un avoir sur {originalNumber}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Montant maximum créditable :{' '}
            <strong>{originalAmountHt.toFixed(2)} €</strong> HT. Un avoir partiel
            laisse la facture originale active ; un avoir total l'annule
            (statut <code>CANCELLED</code>).
          </Dialog.Description>

          <form onSubmit={onSubmit} className="space-y-4 mt-4">
            <input type="hidden" {...register('originalInvoiceId')} />

            <div>
              <label
                htmlFor="amountHtToCredit"
                className="block text-sm font-medium mb-1"
              >
                Montant HT à créditer (€)
              </label>
              <input
                id="amountHtToCredit"
                type="number"
                step="0.01"
                min="0.01"
                max={originalAmountHt}
                {...register('amountHtToCredit', { valueAsNumber: true })}
                className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                aria-invalid={!!errors.amountHtToCredit}
              />
              {errors.amountHtToCredit && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.amountHtToCredit.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="motif" className="block text-sm font-medium mb-1">
                Motif (obligatoire)
              </label>
              <textarea
                id="motif"
                rows={3}
                {...register('motif')}
                className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm"
                placeholder="Ex : Erreur de facturation, geste commercial, annulation partielle…"
                aria-invalid={!!errors.motif}
              />
              {errors.motif && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.motif.message}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="h-9 px-3 rounded-md border border-input bg-white text-sm disabled:opacity-50"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Création…
                  </>
                ) : (
                  "Créer l'avoir"
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

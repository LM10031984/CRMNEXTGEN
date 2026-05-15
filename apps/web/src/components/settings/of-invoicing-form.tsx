'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import {
  tenantBillingSchema,
  type TenantBillingInput,
} from '@qualiof/shared';
import { updateTenantBilling } from '@/server/actions/tenant-settings';

/**
 * Form Numérotation factures (Phase 7 Plan 07-04 — SET-03 préfixe).
 *
 * Champ : invoicePrefix (regex 2-5 lettres MAJUSCULES, default 'FAC').
 *
 * Pitfall 4 RESEARCH.md — Discontinuité de séquence :
 * `updateTenantBilling` accepte le triplet { invoicePrefix, iban, bic }. Cette
 * form ne modifie QUE le préfixe — elle doit passer les valeurs courantes
 * d'iban/bic pour ne pas les écraser à null. Si l'utilisateur a déjà émis
 * des factures (invoiceCount > 0) ET change le préfixe, on ouvre un
 * AlertDialog de confirmation (la séquence repart de 1 avec le nouveau
 * préfixe — `getNextInvoiceNumber` lit l'index par préfixe).
 *
 * Preview live : "Le prochain numéro sera : {prefix}-{(count+1).pad(6,'0')}".
 *
 * Server action : updateTenantBilling (tenant-settings.ts Plan 07-02).
 */

interface OfInvoicingFormProps {
  initial: {
    invoicePrefix: string;
    iban: string | null;
    bic: string | null;
  };
  invoiceCount: number;
  onSaved: () => void;
  onCancel: () => void;
}

export function OfInvoicingForm({
  initial,
  invoiceCount,
  onSaved,
  onCancel,
}: OfInvoicingFormProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPrefix, setPendingPrefix] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<TenantBillingInput>({
    // On utilise le schéma billing complet pour valider invoicePrefix.
    // L'iban/bic sont relayés en l'état (déjà validés à leur dernière sauvegarde)
    // mais doivent passer dans defaultValues pour satisfaire le schéma Zod.
    resolver: zodResolver(tenantBillingSchema),
    defaultValues: {
      invoicePrefix: initial.invoicePrefix || 'FAC',
      // formatIban ajoute des espaces — accepté par le preprocess Zod côté schema.
      iban: initial.iban ?? null,
      bic: initial.bic ?? null,
    },
  });

  const watchedPrefix = watch('invoicePrefix') ?? 'FAC';
  const previewNumber = `${(watchedPrefix || 'FAC').toUpperCase()}-${(invoiceCount + 1)
    .toString()
    .padStart(6, '0')}`;

  const doSave = (prefix: string) => {
    startTransition(async () => {
      const payload: TenantBillingInput = {
        invoicePrefix: prefix.toUpperCase(),
        iban: initial.iban,
        bic: initial.bic,
      };
      const result = await updateTenantBilling(payload);
      if (result.ok) {
        toast.success('Numérotation enregistrée');
        onSaved();
      } else {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const msg = messages?.[0];
            if (msg && field === 'invoicePrefix') {
              setError('invoicePrefix', { message: msg });
            }
          }
        }
        toast.error(result.error);
      }
    });
  };

  const onSubmit = (data: TenantBillingInput) => {
    const newPrefix = (data.invoicePrefix ?? '').toUpperCase();
    // Pitfall 4 — discontinuité : si on a déjà émis des factures avec un autre
    // préfixe, demander confirmation avant de basculer.
    if (invoiceCount > 0 && newPrefix !== initial.invoicePrefix) {
      setPendingPrefix(newPrefix);
      setConfirmOpen(true);
      return;
    }
    doSave(newPrefix);
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5 max-w-xs">
          <label
            htmlFor="of-invoicePrefix"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Préfixe numéro
          </label>
          <input
            id="of-invoicePrefix"
            type="text"
            maxLength={5}
            {...register('invoicePrefix', {
              setValueAs: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
            })}
            placeholder="FAC"
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.invoicePrefix && (
            <p className="text-xs text-red-600">{errors.invoicePrefix.message}</p>
          )}
        </div>

        <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Prochain numéro
          </span>
          <div className="font-mono mt-1">{previewNumber}</div>
          {invoiceCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {invoiceCount} facture{invoiceCount > 1 ? 's' : ''} émise{invoiceCount > 1 ? 's' : ''} à ce jour.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>

      {/* AlertDialog discontinuité préfixe (Pitfall 4 RESEARCH.md) — utilise
          Radix Dialog (pas d'AlertDialog primitive dans le projet ; Dialog est
          le pattern établi cf. user-menu-button.tsx). */}
      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
            <Dialog.Title className="text-lg font-semibold">
              Confirmer le changement de préfixe
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Vous avez déjà émis <strong>{invoiceCount}</strong> facture
              {invoiceCount > 1 ? 's' : ''} avec le préfixe{' '}
              <strong>{initial.invoicePrefix}</strong>. Passer à{' '}
              <strong>{pendingPrefix}</strong> créera une discontinuité dans la
              séquence : le compteur repartira à{' '}
              <strong>{pendingPrefix}-000001</strong>.
              <br />
              <br />
              Cette opération est généralement déconseillée pour la traçabilité
              comptable. Continuer ?
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (pendingPrefix) {
                    setConfirmOpen(false);
                    doSave(pendingPrefix);
                  }
                }}
                className="h-9 px-4 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                Confirmer le changement
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

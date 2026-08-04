'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  tenantBillingSchema,
  type TenantBillingInput,
} from '@qualiof/shared';
import { updateTenantBilling } from '@/server/actions/tenant-settings';
import { formatIban } from '@/lib/iban-format';

/**
 * Form Coordonnées bancaires (Phase 7 Plan 07-04 — SET-03 RIB).
 *
 * Champs : iban (FR + 23 chars), bic (8 ou 11 chars). Espaces tolérés
 * et normalisés côté Zod (cf. tenant.ts > normalizeIban/normalizeBic).
 *
 * Read mode : helper `formatIban` ajoute des espaces tous les 4 chars
 * pour la lisibilité. Stockage BDD reste en forme compacte.
 *
 * Pitfall : `updateTenantBilling` accepte le triplet { invoicePrefix, iban, bic }.
 * Cette form ne modifie QUE iban/bic — elle relaie invoicePrefix en l'état pour
 * ne pas l'écraser.
 *
 * Server action : updateTenantBilling (tenant-settings.ts Plan 07-02).
 */

interface OfBankingFormProps {
  initial: {
    invoicePrefix: string;
    iban: string | null;
    bic: string | null;
  };
  onSaved?: () => void;
  onCancel?: () => void;
}

export function OfBankingForm({ initial, onSaved, onCancel }: OfBankingFormProps) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TenantBillingInput>({
    // On valide le triplet complet via tenantBillingSchema. Le champ
    // invoicePrefix est figé sur la valeur courante (initial) — l'utilisateur
    // ne le modifie pas dans cette form (cf. OfInvoicingForm dédié).
    resolver: zodResolver(tenantBillingSchema),
    defaultValues: {
      invoicePrefix: initial.invoicePrefix,
      // Affichage initial : IBAN formaté avec espaces (UX). Zod re-normalisera
      // sur preprocess avant validation.
      iban: formatIban(initial.iban),
      bic: initial.bic ?? '',
    },
  });

  const onSubmit = (data: TenantBillingInput) => {
    startTransition(async () => {
      const payload: TenantBillingInput = {
        invoicePrefix: initial.invoicePrefix,
        iban: typeof data.iban === 'string' ? data.iban.trim() || null : data.iban,
        bic: typeof data.bic === 'string' ? data.bic.trim() || null : data.bic,
      };
      const result = await updateTenantBilling(payload);
      if (result.ok) {
        toast.success('Coordonnées bancaires enregistrées');
        onSaved?.();
      } else {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const msg = messages?.[0];
            if (msg && (field === 'iban' || field === 'bic')) {
              setError(field as 'iban' | 'bic', { message: msg });
            }
          }
        }
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="of-iban" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            IBAN
          </label>
          <input
            id="of-iban"
            type="text"
            placeholder="FR76 1234 5678 9012 3456 7890 123"
            title="Format : FR + 2 chiffres + 23 caractères, espaces autorisés"
            {...register('iban')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.iban && <p className="text-xs text-red-600">{errors.iban.message}</p>}
          <p className="text-[11px] text-muted-foreground">
            FR + 2 chiffres + 23 caractères. Les espaces sont autorisés (ils seront retirés à l'enregistrement).
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="of-bic" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            BIC
          </label>
          <input
            id="of-bic"
            type="text"
            placeholder="BNPAFRPP"
            title="8 ou 11 caractères, MAJUSCULES"
            {...register('bic')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.bic && <p className="text-xs text-red-600">{errors.bic.message}</p>}
        </div>
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
  );
}

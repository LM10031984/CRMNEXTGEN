'use client';

import { useTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  tenantAddressSchema,
  type TenantAddressInput,
} from '@qualiof/shared';
import { updateTenantAddress } from '@/server/actions/tenant-settings';

/**
 * Form Adresse + mentions légales (Phase 7 Plan 07-04 — SET-02 texte).
 *
 * Champs :
 *  - address (street, postalCode, city) stocké en Json (cf. CONTEXT.md D-03)
 *  - legalMentions textarea, max 2000 caractères avec compteur live
 *
 * Server action : updateTenantAddress (tenant-settings.ts Plan 07-02).
 *
 * Note : la partie "Logo & signatures" est dans un composant séparé
 * `OfAssetsForm` (uploads file ⇒ workflow différent).
 */

interface OfAddressFormProps {
  initial: {
    address: {
      street?: string;
      street2?: string;
      postalCode?: string;
      city?: string;
      country?: string;
    } | null;
    legalMentions: string | null;
  };
  onSaved?: () => void;
  onCancel?: () => void;
}

const MAX_LEGAL_MENTIONS = 2000;

export function OfAddressForm({ initial, onSaved, onCancel }: OfAddressFormProps) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<TenantAddressInput>({
    resolver: zodResolver(tenantAddressSchema),
    defaultValues: {
      address: {
        street: initial.address?.street ?? '',
        street2: initial.address?.street2 ?? '',
        postalCode: initial.address?.postalCode ?? '',
        city: initial.address?.city ?? '',
        country: initial.address?.country ?? 'France',
      },
      legalMentions: initial.legalMentions ?? '',
    },
  });

  const watchedMentions = watch('legalMentions') ?? '';
  const [legalCount, setLegalCount] = useState(watchedMentions.length);

  const onSubmit = (data: TenantAddressInput) => {
    startTransition(async () => {
      const result = await updateTenantAddress({
        address: data.address ?? null,
        legalMentions: data.legalMentions?.toString().trim() || null,
      });
      if (result.ok) {
        toast.success('Adresse enregistrée');
        onSaved?.();
      } else {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const msg = messages?.[0];
            if (msg) {
              setError(field as keyof TenantAddressInput, { message: msg });
            }
          }
        }
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
        <div className="space-y-1.5 sm:col-span-6">
          <label htmlFor="of-street" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rue
          </label>
          <input
            id="of-street"
            type="text"
            {...register('address.street')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="of-postalCode" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Code postal
          </label>
          <input
            id="of-postalCode"
            type="text"
            inputMode="numeric"
            {...register('address.postalCode')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-4">
          <label htmlFor="of-city" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ville
          </label>
          <input
            id="of-city"
            type="text"
            {...register('address.city')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="of-legalMentions" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mentions légales
          </label>
          <span
            className={
              legalCount > MAX_LEGAL_MENTIONS
                ? 'text-xs text-red-600'
                : 'text-xs text-muted-foreground'
            }
          >
            {legalCount} / {MAX_LEGAL_MENTIONS}
          </span>
        </div>
        <textarea
          id="of-legalMentions"
          rows={5}
          maxLength={MAX_LEGAL_MENTIONS}
          {...register('legalMentions', {
            onChange: (e) => setLegalCount(e.target.value.length),
          })}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="Apparaîtra en bas de page des conventions, factures, ..."
        />
        {errors.legalMentions && (
          <p className="text-xs text-red-600">{errors.legalMentions.message}</p>
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
  );
}

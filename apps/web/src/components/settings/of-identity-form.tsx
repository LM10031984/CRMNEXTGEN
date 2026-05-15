'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  tenantIdentitySchema,
  type TenantIdentityInput,
} from '@qualiof/shared';
import { updateTenantIdentity } from '@/server/actions/tenant-settings';

/**
 * Form Identité OF (Phase 7 Plan 07-04 — SET-01).
 *
 * Champs : name (requis), siret (Luhn-validé), numDA, rcs, legalForm.
 * Server action : updateTenantIdentity (tenant-settings.ts Plan 07-02).
 *
 * Pattern :
 *  - react-hook-form + zodResolver pour validation client immédiate.
 *  - useTransition pour ne pas bloquer l'UI pendant la save.
 *  - fieldErrors du server sont remontés via form.setError (Zod parsing
 *    réussi côté client mais peut échouer côté serveur si le Tenant est
 *    introuvable ou la BDD rejette une contrainte).
 *  - toast sonner sur succès/erreur (pattern projet).
 */

interface OfIdentityFormProps {
  initial: {
    name: string;
    siret: string | null;
    numDA: string | null;
    rcs: string | null;
    legalForm: string | null;
  };
  onSaved: () => void;
  onCancel: () => void;
}

export function OfIdentityForm({ initial, onSaved, onCancel }: OfIdentityFormProps) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TenantIdentityInput>({
    resolver: zodResolver(tenantIdentitySchema),
    defaultValues: {
      name: initial.name,
      siret: initial.siret ?? '',
      numDA: initial.numDA ?? '',
      rcs: initial.rcs ?? '',
      legalForm: initial.legalForm ?? '',
    },
  });

  const onSubmit = (data: TenantIdentityInput) => {
    startTransition(async () => {
      // Normaliser les chaînes vides en `null` côté serveur (cohérent avec
      // updateTenantIdentity qui ne distingue pas `''` de `null`).
      const payload: TenantIdentityInput = {
        name: data.name,
        siret: data.siret?.toString().trim() || null,
        numDA: data.numDA?.toString().trim() || null,
        rcs: data.rcs?.toString().trim() || null,
        legalForm: data.legalForm?.toString().trim() || null,
      };
      const result = await updateTenantIdentity(payload);
      if (result.ok) {
        toast.success('Identité enregistrée');
        onSaved();
      } else {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const msg = messages?.[0];
            if (msg) {
              setError(field as keyof TenantIdentityInput, { message: msg });
            }
          }
        }
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="of-name" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Raison sociale *
          </label>
          <input
            id="of-name"
            type="text"
            {...register('name')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="of-siret" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            SIRET
          </label>
          <input
            id="of-siret"
            type="text"
            inputMode="numeric"
            placeholder="14 chiffres"
            {...register('siret')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.siret && <p className="text-xs text-red-600">{errors.siret.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="of-numDA" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            N° Déclaration d'activité
          </label>
          <input
            id="of-numDA"
            type="text"
            placeholder="Ex: 11 75 12345 75"
            {...register('numDA')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.numDA && <p className="text-xs text-red-600">{errors.numDA.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="of-rcs" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            RCS
          </label>
          <input
            id="of-rcs"
            type="text"
            placeholder="Ex: RCS Paris 814 237 186"
            {...register('rcs')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.rcs && <p className="text-xs text-red-600">{errors.rcs.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="of-legalForm" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Forme juridique
          </label>
          <input
            id="of-legalForm"
            type="text"
            placeholder="SAS, EURL, SARL, ..."
            {...register('legalForm')}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.legalForm && <p className="text-xs text-red-600">{errors.legalForm.message}</p>}
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

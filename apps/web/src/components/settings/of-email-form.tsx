'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import {
  tenantEmailSchema,
  type TenantEmailInput,
} from '@qualiof/shared';
import { updateTenantEmail } from '@/server/actions/tenant-settings';

/**
 * Form Email expéditeur (Phase 7 Plan 07-04 — SET-03 email).
 *
 * Champ : emailFrom (email valide OU chaîne vide → fallback ENV OF_EMAIL).
 *
 * Cf. CONTEXT.md D-08 : la valeur cible est `formation@start-academy.fr` mais
 * le champ reste éditable au cas où Laurent change d'adresse plus tard.
 *
 * Sécurité : le mot de passe SMTP reste en variable d'environnement
 * (`SMTP_PASSWORD`) — jamais exposé dans l'UI. Une info-box le rappelle.
 *
 * Server action : updateTenantEmail (tenant-settings.ts Plan 07-02).
 */

interface OfEmailFormProps {
  initial: {
    emailFrom: string | null;
  };
  onSaved?: () => void;
  onCancel?: () => void;
}

export function OfEmailForm({ initial, onSaved, onCancel }: OfEmailFormProps) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TenantEmailInput>({
    resolver: zodResolver(tenantEmailSchema),
    defaultValues: { emailFrom: initial.emailFrom ?? '' },
  });

  const onSubmit = (data: TenantEmailInput) => {
    startTransition(async () => {
      const result = await updateTenantEmail(data);
      if (result.ok) {
        toast.success('Email expéditeur enregistré');
        onSaved?.();
      } else {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const msg = messages?.[0];
            if (msg && field === 'emailFrom') {
              setError('emailFrom', { message: msg });
            }
          }
        }
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="of-emailFrom" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Adresse d'envoi
        </label>
        <input
          id="of-emailFrom"
          type="email"
          autoComplete="email"
          placeholder="formation@start-academy.fr"
          {...register('emailFrom')}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {errors.emailFrom && (
          <p className="text-xs text-red-600">{errors.emailFrom.message}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Laisser vide pour repasser au fallback ENV (<code>OF_EMAIL</code>).
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Le mot de passe SMTP est géré dans la configuration serveur
          (<code>SMTP_PASSWORD</code>), pas dans cette interface (sécurité).
        </span>
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

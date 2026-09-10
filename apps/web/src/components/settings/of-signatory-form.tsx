'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { tenantSignatorySchema, type TenantSignatoryInput } from '@qualiof/shared';
import { updateTenantSignatory } from '@/server/actions/tenant-settings';

/**
 * Signataire OF pour la signature électronique (spec 2026-09-04, D-1).
 *
 * §3 : « Le signataire OF est toujours le même : un TenantSignatory (nom,
 * email, rôle) configuré une fois dans les paramètres tenant, signé
 * automatiquement en premier ou en dernier selon le réglage. »
 *
 * Les champs vides sont légitimes : ils font retomber sur le responsable OF
 * déjà connu (`OF_RESP_*`). L'ordre par défaut est « après le client » (D-3).
 */

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
const LABEL_CLASS =
  'text-xs font-medium uppercase tracking-wide text-muted-foreground';

interface OfSignatoryFormProps {
  initial: {
    signatoryName: string | null;
    signatoryEmail: string | null;
    signatoryTitle: string | null;
    signatoryOrder: 'BEFORE' | 'AFTER';
  };
  /** Nom du responsable OF, affiché comme valeur de repli. */
  fallbackName: string;
  fallbackEmail: string;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function OfSignatoryForm({
  initial,
  fallbackName,
  fallbackEmail,
  onSaved,
  onCancel,
}: OfSignatoryFormProps) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TenantSignatoryInput>({
    resolver: zodResolver(tenantSignatorySchema),
    defaultValues: {
      signatoryName: initial.signatoryName ?? '',
      signatoryEmail: initial.signatoryEmail ?? '',
      signatoryTitle: initial.signatoryTitle ?? '',
      signatoryOrder: initial.signatoryOrder,
    },
  });

  const onSubmit = (data: TenantSignatoryInput) => {
    startTransition(async () => {
      const result = await updateTenantSignatory(data);
      if (result.ok) {
        toast.success('Signataire enregistré');
        onSaved?.();
        return;
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          const msg = messages?.[0];
          if (msg && field in data) {
            setError(field as keyof TenantSignatoryInput, { message: msg });
          }
        }
      }
      toast.error(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="signatoryName" className={LABEL_CLASS}>
            Nom et prénom
          </label>
          <input
            id="signatoryName"
            placeholder={fallbackName || 'Laurent MARX'}
            {...register('signatoryName')}
            className={INPUT_CLASS}
          />
          {errors.signatoryName && (
            <p className="text-xs text-red-600">{errors.signatoryName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="signatoryTitle" className={LABEL_CLASS}>
            Qualité
          </label>
          <input
            id="signatoryTitle"
            placeholder="Gérant, PDG…"
            {...register('signatoryTitle')}
            className={INPUT_CLASS}
          />
          {errors.signatoryTitle && (
            <p className="text-xs text-red-600">{errors.signatoryTitle.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signatoryEmail" className={LABEL_CLASS}>
          Email de signature
        </label>
        <input
          id="signatoryEmail"
          type="email"
          autoComplete="email"
          placeholder={fallbackEmail || 'laurent@start-academy.fr'}
          {...register('signatoryEmail')}
          className={INPUT_CLASS}
        />
        {errors.signatoryEmail && (
          <p className="text-xs text-red-600">{errors.signatoryEmail.message}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          C&apos;est à cette adresse que le lien de signature sera envoyé.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signatoryOrder" className={LABEL_CLASS}>
          Ordre de signature
        </label>
        <select id="signatoryOrder" {...register('signatoryOrder')} className={INPUT_CLASS}>
          <option value="AFTER">L&apos;organisme signe après le client</option>
          <option value="BEFORE">L&apos;organisme signe avant le client</option>
        </select>
        <p className="text-[11px] text-muted-foreground">
          Par défaut, l&apos;organisme signe une fois le client signataire — comme aujourd&apos;hui.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Laisser un champ vide reprend le responsable de l&apos;organisme
          (<code>OF_RESP_*</code>). Sans nom ni email nulle part, l&apos;envoi pour
          signature est bloqué plutôt que deviné.
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

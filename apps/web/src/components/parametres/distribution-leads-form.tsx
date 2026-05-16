'use client';

/**
 * DistributionLeadsForm (Phase 9 Plan 09-04 Task 3 — LEAD-01 D-06).
 *
 * Formulaire client RHF + zodResolver pour les 3 toggles Tenant :
 *  - `autoAssignLeads`          — déclenche `autoAssignLead` à `createLead`
 *  - `notifyOnLeadAssignEmail`  — envoi email au commercial assigné
 *  - `notifyOnLeadAssignBell`   — création Notification cloche
 *
 * UX : les 2 toggles "Notification email" et "Notification cloche" sont visuellement
 * grisés (opacity-60 + disabled) si `autoAssignLeads` est OFF — ils restent fonctionnels
 * mais l'utilisateur voit que rien ne sera notifié tant que l'auto-assignation est OFF.
 *
 * useTransition pour ne pas bloquer l'UI pendant l'appel server action. toast sonner
 * pour le feedback success/error (cohérent Phase 7/8).
 */

import { useTransition } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { DistributionConfigSchema, type DistributionConfigInput } from '@qualiof/shared';
import { updateLeadDistributionConfig } from '@/server/actions/distribution-leads-config';

interface Props {
  initial: DistributionConfigInput;
}

export function DistributionLeadsForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, watch } = useForm<DistributionConfigInput>({
    resolver: zodResolver(DistributionConfigSchema),
    defaultValues: initial,
  });

  function onSubmit(data: DistributionConfigInput) {
    startTransition(async () => {
      const r = await updateLeadDistributionConfig(data);
      if (r.ok) {
        toast.success('Paramètres mis à jour');
      } else {
        toast.error(r.error || 'Erreur lors de la mise à jour');
      }
    });
  }

  // Watch autoAssignLeads pour visuellement disabled les 2 toggles dépendants.
  // Note : les 2 toggles dépendants RESTENT enregistrés (register) et soumis —
  // c'est purement visuel. Si l'admin remet l'auto-assign ON plus tard, ses choix
  // antérieurs sur email/cloche sont préservés.
  const auto = watch('autoAssignLeads');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <ToggleRow
        label="Auto-assignation des leads"
        description="Quand activée, chaque nouveau lead est automatiquement attribué au commercial le moins chargé (algorithme round-robin équilibré)."
        register={register('autoAssignLeads')}
      />

      <div
        className={`pl-4 border-l-2 ${auto ? 'border-primary/40' : 'border-border'} space-y-6`}
      >
        <ToggleRow
          label="Notification email à l'assignation"
          description="Envoie un email au commercial à chaque attribution (utilise le SMTP configuré dans Paramètres)."
          register={register('notifyOnLeadAssignEmail')}
          disabled={!auto}
        />
        <ToggleRow
          label="Notification cloche à l'assignation"
          description="Affiche une notification dans la cloche TopBar du commercial dès l'attribution. Le clic redirige vers la fiche du lead et marque la notification comme lue."
          register={register('notifyOnLeadAssignBell')}
          disabled={!auto}
        />
      </div>

      <div className="flex justify-end pt-4 border-t border-border">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function ToggleRow({
  label,
  description,
  register,
  disabled,
}: {
  label: string;
  description: string;
  register: UseFormRegisterReturn;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        {...register}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
    </label>
  );
}

'use client';

/**
 * RevenueTargetForm (quick 260620-d42 Plan 02 Task 2).
 *
 * Formulaire client RHF + useTransition + sonner (pattern distribution-leads-form /
 * invoice-settings-form). Saisie de l'objectif de CA annuel (EUR HT, entier) pour
 * l'année affichée → appelle `setRevenueTarget(year, amountHT)`.
 *
 * Après succès : toast + router.refresh() (la server action revalide déjà
 * /app/pilotage, refresh garantit la mise à jour immédiate des KPI/graphe).
 */

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setRevenueTarget } from '@/server/actions/revenue-target';

interface FormValues {
  amountHT: number;
}

interface Props {
  year: number;
  current: number;
}

export function RevenueTargetForm({ year, current }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { amountHT: current },
  });

  function onSubmit(data: FormValues) {
    const amount = Math.round(Number(data.amountHT));
    startTransition(async () => {
      const r = await setRevenueTarget(year, amount);
      if (r.ok) {
        toast.success(`Objectif ${year} enregistré`);
        router.refresh();
      } else {
        toast.error(r.error || "Erreur lors de l'enregistrement");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-2xl border border-border bg-white p-5 space-y-4"
    >
      <div>
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Objectif annuel
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Définissez l&apos;objectif de CA pour l&apos;année sélectionnée. Il est
          réparti sur 12 mois selon la saisonnalité historique.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="amountHT"
          className="text-sm font-medium block"
        >
          Objectif de CA {year} (EUR HT)
        </label>
        <input
          id="amountHT"
          type="number"
          min={0}
          step={1}
          {...register('amountHT', { valueAsNumber: true, min: 0 })}
          className="w-full max-w-xs h-9 px-3 rounded-md border border-border bg-white text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {errors.amountHT && (
          <p className="text-xs text-red-600">Montant invalide</p>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer l’objectif'}
        </button>
      </div>
    </form>
  );
}

'use client';

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Loader2 } from 'lucide-react';
import {
  UpdateSessionDetailsInputSchema,
  type UpdateSessionDetailsInput,
} from '@qualiof/shared';
import { updateSessionDetails } from '@/server/actions/sessions';

/**
 * Quick task 260523-oze — CTA "Modifier la session" + Dialog Radix d'édition.
 *
 * Pattern cloné de `components/invoices/create-credit-note-dialog.tsx` (Phase
 * 11 Plan 11-05) — Radix Dialog + RHF + zodResolver + useTransition + sonner.
 *
 * Flow :
 *  1. Trigger ouvre la Dialog (9 champs pré-remplis depuis `initial`).
 *  2. Submit → server action `updateSessionDetails(data)` (Quick task 260523-oze).
 *  3. Succès → toast vert "Session mise à jour" + `router.refresh()` (fiche).
 *  4. Erreur → toast rouge avec message serveur (Zod ou refine cross-field).
 *
 * RBAC : le bouton est rendu côté Server Component parent (page session)
 * via condition `['ADMIN','MANAGER'].includes(user.role)`. La server action
 * revalide systématiquement via `requireRole(['ADMIN','MANAGER'])`.
 *
 * Décision dates (cf. plan 260523-oze) : `<input type="date">` (YYYY-MM-DD)
 * pour cohérence avec le wizard de création. Le server reconstruit le
 * DateTime en préservant l'heure d'origine de la session.
 *
 * Décision pricePerLearner : props attend `number | null` (le caller convertit
 * `Decimal | null` Prisma via `Number()` côté Server Component, car les
 * Decimals ne traversent pas la frontière server→client — cf. STATE.md
 * feedback Prisma Decimal).
 */

const MODALITY_LABELS: Record<UpdateSessionDetailsInput['modality'] & string, string> = {
  PRESENTIEL: 'Présentiel',
  DISTANCIEL: 'Distanciel',
  MIXTE: 'Mixte',
  ELEARNING: 'E-learning',
};

interface Props {
  sessionId: string;
  initial: {
    name: string | null;
    startDate: Date;
    endDate: Date;
    capacityMin: number;
    capacityMax: number;
    modality: 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE' | 'ELEARNING';
    pricePerLearner: number | null;
    language: string;
    internalNotes: string | null;
  };
}

// Helper : Date → 'yyyy-mm-dd' pour <input type="date">. UTC pour rester
// aligné avec la BDD (Prisma stocke en UTC) et avec mergeDateKeepTime côté
// server (qui utilise setUTCFullYear).
function toDateInput(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function EditSessionDetailsDialog({ sessionId, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const defaultValues = {
    sessionId,
    name: initial.name ?? '',
    startDate: toDateInput(initial.startDate),
    endDate: toDateInput(initial.endDate),
    capacityMin: initial.capacityMin,
    capacityMax: initial.capacityMax,
    modality: initial.modality,
    pricePerLearner: initial.pricePerLearner,
    language: initial.language,
    internalNotes: initial.internalNotes ?? '',
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<UpdateSessionDetailsInput>({
    resolver: zodResolver(UpdateSessionDetailsInputSchema),
    defaultValues: defaultValues as UpdateSessionDetailsInput,
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const res = await updateSessionDetails(data);
      if (res.ok) {
        toast.success('Session mise à jour');
        setOpen(false);
        reset(defaultValues as UpdateSessionDetailsInput);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Re-sync defaults au cas où les props auraient changé depuis le
          // mount (router.refresh entre 2 ouvertures).
          reset(defaultValues as UpdateSessionDetailsInput);
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-all duration-300 ease-out active:scale-[0.97]"
          aria-label="Modifier les détails de la session"
        >
          <Pencil className="h-4 w-4" /> Modifier
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[640px] max-w-[92vw] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <Dialog.Title className="text-lg font-semibold">Modifier la session</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Édite les 9 champs scalaires (nom, dates, capacités, modalité, prix HT, langue,
            notes). Les autres champs (statut, lieu, formateurs, logistique) restent éditables
            individuellement depuis la fiche.
          </Dialog.Description>

          <form onSubmit={onSubmit} className="space-y-4 mt-4">
            <input type="hidden" {...register('sessionId')} />

            {/* 1. Nom de la session */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1">
                Nom de la session
              </label>
              <input
                id="name"
                type="text"
                {...register('name')}
                className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                placeholder="Laissez vide pour autogénération depuis le produit"
                aria-invalid={!!errors.name}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Nom affiché sur la fiche et les documents Qualiopi.
              </p>
              {errors.name && (
                <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* 2. Modalité */}
            <div>
              <label htmlFor="modality" className="block text-sm font-medium mb-1">
                Modalité
              </label>
              <select
                id="modality"
                {...register('modality')}
                className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                aria-invalid={!!errors.modality}
              >
                {(Object.keys(MODALITY_LABELS) as Array<keyof typeof MODALITY_LABELS>).map(
                  (k) => (
                    <option key={k} value={k}>
                      {MODALITY_LABELS[k]}
                    </option>
                  ),
                )}
              </select>
              {errors.modality && (
                <p className="text-xs text-red-600 mt-1">{errors.modality.message}</p>
              )}
            </div>

            {/* 3. Dates (grid 2 cols) */}
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium mb-1">
                    Date de début
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    {...register('startDate')}
                    className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                    aria-invalid={!!errors.startDate}
                  />
                  {errors.startDate && (
                    <p className="text-xs text-red-600 mt-1">{errors.startDate.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium mb-1">
                    Date de fin
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    {...register('endDate')}
                    className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                    aria-invalid={!!errors.endDate}
                  />
                  {errors.endDate && (
                    <p className="text-xs text-red-600 mt-1">{errors.endDate.message}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Les horaires d&apos;origine (heure/minute) sont préservés.
              </p>
            </div>

            {/* 4. Capacités (grid 2 cols) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="capacityMin" className="block text-sm font-medium mb-1">
                  Capacité min
                </label>
                <input
                  id="capacityMin"
                  type="number"
                  min="1"
                  step="1"
                  {...register('capacityMin', { valueAsNumber: true })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                  aria-invalid={!!errors.capacityMin}
                />
                {errors.capacityMin && (
                  <p className="text-xs text-red-600 mt-1">{errors.capacityMin.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="capacityMax" className="block text-sm font-medium mb-1">
                  Capacité max
                </label>
                <input
                  id="capacityMax"
                  type="number"
                  min="1"
                  step="1"
                  {...register('capacityMax', { valueAsNumber: true })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                  aria-invalid={!!errors.capacityMax}
                />
                {errors.capacityMax && (
                  <p className="text-xs text-red-600 mt-1">{errors.capacityMax.message}</p>
                )}
              </div>
            </div>

            {/* 5. Prix + Langue (grid 2 cols) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pricePerLearner" className="block text-sm font-medium mb-1">
                  Prix HT / apprenant (€)
                </label>
                <input
                  id="pricePerLearner"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('pricePerLearner', {
                    setValueAs: (v) => {
                      if (v === '' || v === null || v === undefined) return null;
                      const n = typeof v === 'number' ? v : Number(v);
                      return Number.isNaN(n) ? null : n;
                    },
                  })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                  aria-invalid={!!errors.pricePerLearner}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Laisser vide pour &laquo;&nbsp;aucun prix spécifique&nbsp;&raquo; (utilise
                  le prix produit).
                </p>
                {errors.pricePerLearner && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.pricePerLearner.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="language" className="block text-sm font-medium mb-1">
                  Langue
                </label>
                <input
                  id="language"
                  type="text"
                  maxLength={8}
                  {...register('language')}
                  className="w-full h-9 px-3 rounded-md border border-input bg-white text-sm"
                  placeholder="fr"
                  aria-invalid={!!errors.language}
                />
                {errors.language && (
                  <p className="text-xs text-red-600 mt-1">{errors.language.message}</p>
                )}
              </div>
            </div>

            {/* 6. Notes internes */}
            <div>
              <label htmlFor="internalNotes" className="block text-sm font-medium mb-1">
                Notes internes
              </label>
              <textarea
                id="internalNotes"
                rows={3}
                {...register('internalNotes')}
                className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm"
                placeholder="Visibles uniquement en interne (jamais sur les documents apprenants)."
                aria-invalid={!!errors.internalNotes}
              />
              {errors.internalNotes && (
                <p className="text-xs text-red-600 mt-1">{errors.internalNotes.message}</p>
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
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  'Enregistrer'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

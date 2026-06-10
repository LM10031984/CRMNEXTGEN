'use client';

/**
 * Dialog "Modifier" une entrée veille (Phase 13 Plan 13-03 — VEILLE-02).
 *
 * Edition des champs hors `exploitation` (qui passe par <ExploitationCell> inline
 * pour déclencher `dateLastReviewed=now()` + AuditLog `exploitation_updated`).
 *
 * Radix Dialog controlled (open/onOpenChange en props) + RHF + zodResolver(updateWatchSchema).
 *
 * Pattern cohérent avec `change-role-dialog.tsx` (Phase 8).
 */

import { useState, useTransition, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import type { RegulatoryWatch } from '@prisma/client';
import {
  updateWatchSchema,
  type UpdateWatchInput,
} from '@qualiof/shared';
import { updateWatch } from '@/server/actions/veille';

type Theme = 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';

const THEME_LABELS: Record<Theme, string> = {
  INDIC_23: '23 — Formation pro',
  INDIC_24: '24 — Secteur immobilier',
  INDIC_25: '25 — Innovations pédagogiques',
  INDIC_26: '26 — Handicap & DREETS',
};

interface EditVeilleDialogProps {
  watch: RegulatoryWatch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditVeilleDialog({
  watch,
  open,
  onOpenChange,
}: EditVeilleDialogProps) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateWatchInput>({
    resolver: zodResolver(updateWatchSchema),
    defaultValues: {
      id: watch.id,
      theme: watch.theme as Theme,
      title: watch.title,
      url: watch.url ?? '',
      source: watch.source ?? '',
      responsable: watch.responsable ?? '',
      frequency: watch.frequency ?? '',
      typeSource: watch.typeSource ?? '',
      modeSuivi: watch.modeSuivi ?? '',
    },
  });

  // Resync form quand on rouvre le dialog sur une autre ligne (watch.id différent)
  useEffect(() => {
    if (open) {
      reset({
        id: watch.id,
        theme: watch.theme as Theme,
        title: watch.title,
        url: watch.url ?? '',
        source: watch.source ?? '',
        responsable: watch.responsable ?? '',
        frequency: watch.frequency ?? '',
        typeSource: watch.typeSource ?? '',
        modeSuivi: watch.modeSuivi ?? '',
      });
    }
  }, [open, watch, reset]);

  const onSubmit = (raw: UpdateWatchInput) => {
    setServerError(null);
    // Nettoyage strings vides → null pour les champs nullables
    const data: UpdateWatchInput = {
      ...raw,
      url: raw.url?.trim() || null,
      source: raw.source?.trim() || null,
      responsable: raw.responsable?.trim() || null,
      frequency: raw.frequency?.trim() || null,
      typeSource: raw.typeSource?.trim() || null,
      modeSuivi: raw.modeSuivi?.trim() || null,
    };
    startTransition(async () => {
      const result = await updateWatch(data);
      if (result.ok) {
        toast.success('Source mise à jour');
        onOpenChange(false);
      } else {
        setServerError(result.error || 'Erreur mise à jour');
        toast.error(result.error || 'Erreur mise à jour');
      }
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
        if (!next) setServerError(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[560px] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <div className="flex items-start gap-3 mb-5">
            <div className="shrink-0 rounded-md bg-primary-50 p-2 text-primary-700">
              <Pencil className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                Modifier la source
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground break-words">
                {watch.title}
              </Dialog.Description>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <input type="hidden" {...register('id')} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-theme"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Thème *
                </label>
                <select
                  id="edit-theme"
                  {...register('theme')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
                    <option key={t} value={t}>
                      {THEME_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-frequency"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Fréquence
                </label>
                <input
                  id="edit-frequency"
                  type="text"
                  {...register('frequency')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-title"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Titre *
              </label>
              <input
                id="edit-title"
                type="text"
                {...register('title')}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {errors.title && (
                <p className="text-xs text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-url"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                URL
              </label>
              <input
                id="edit-url"
                type="url"
                {...register('url')}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {errors.url && (
                <p className="text-xs text-red-600">{errors.url.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-source"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Source
                </label>
                <input
                  id="edit-source"
                  type="text"
                  {...register('source')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-responsable"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Responsable
                </label>
                <input
                  id="edit-responsable"
                  type="text"
                  {...register('responsable')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-typesource"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Type de source
                </label>
                <input
                  id="edit-typesource"
                  type="text"
                  {...register('typeSource')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-modesuivi"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Mode de suivi
                </label>
                <input
                  id="edit-modesuivi"
                  type="text"
                  {...register('modeSuivi')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {serverError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-md p-2">
                {serverError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

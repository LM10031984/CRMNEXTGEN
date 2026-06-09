'use client';

/**
 * Dialog "+ Ajouter une source veille" (Phase 13 Plan 13-03 — VEILLE-02).
 *
 * Radix Dialog + react-hook-form + zodResolver(createWatchSchema) — pattern
 * cohérent avec `change-role-dialog.tsx` (Phase 8) et `create-credit-note-dialog.tsx`
 * (Phase 11).
 *
 * Le server action `createWatch` (Plan 02) :
 *  - guard `requireRole(['ADMIN','MANAGER'])` strict
 *  - default `status='ACTIVE'`, `suggestedBy='USER'`
 *  - AuditLog `regulatoryWatch.created` avec diff source='manual-ui'
 *
 * D-07 (CONTEXT) — `exploitation` = textarea simple (pas de rich-text).
 */

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Newspaper } from 'lucide-react';
import {
  createWatchSchema,
  type CreateWatchInput,
} from '@qualiof/shared';
import { createWatch } from '@/server/actions/veille';

type Theme = 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';

const THEME_LABELS: Record<Theme, string> = {
  INDIC_23: '23 — Formation pro',
  INDIC_24: '24 — Secteur immobilier',
  INDIC_25: '25 — Innovations pédagogiques',
  INDIC_26: '26 — Handicap & DREETS',
};

interface AddVeilleDialogProps {
  /** Onglet courant — pré-rempli dans le select theme. */
  defaultTheme?: Theme;
}

export function AddVeilleDialog({ defaultTheme }: AddVeilleDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWatchInput>({
    resolver: zodResolver(createWatchSchema),
    defaultValues: {
      theme: defaultTheme ?? 'INDIC_23',
      title: '',
      url: '',
      source: '',
      responsable: '',
      frequency: '',
      typeSource: '',
      modeSuivi: '',
      exploitation: '',
    },
  });

  const onSubmit = (raw: CreateWatchInput) => {
    setServerError(null);
    // Nettoyage : envoyer null pour les champs string vides (cohérent schema nullable)
    const data: CreateWatchInput = {
      ...raw,
      url: raw.url?.trim() || null,
      source: raw.source?.trim() || null,
      responsable: raw.responsable?.trim() || null,
      frequency: raw.frequency?.trim() || null,
      typeSource: raw.typeSource?.trim() || null,
      modeSuivi: raw.modeSuivi?.trim() || null,
      exploitation: raw.exploitation?.trim() || null,
    };
    startTransition(async () => {
      const result = await createWatch(data);
      if (result.ok) {
        toast.success('Source ajoutée à la veille');
        setOpen(false);
        reset({
          theme: defaultTheme ?? 'INDIC_23',
          title: '',
          url: '',
          source: '',
          responsable: '',
          frequency: '',
          typeSource: '',
          modeSuivi: '',
          exploitation: '',
        });
      } else {
        setServerError(result.error || 'Erreur lors de la création');
        toast.error(result.error || 'Erreur lors de la création');
      }
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        setOpen(next);
        if (!next) setServerError(null);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Ajouter une source
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[560px] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <div className="flex items-start gap-3 mb-5">
            <div className="shrink-0 rounded-md bg-primary-50 p-2 text-primary-700">
              <Newspaper className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                Ajouter une source de veille
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Documenter une nouvelle source pour l&apos;audit Qualiopi (indicateurs 23 / 24 / 25 / 26).
              </Dialog.Description>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="add-theme"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Thème *
                </label>
                <select
                  id="add-theme"
                  {...register('theme')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
                    <option key={t} value={t}>
                      {THEME_LABELS[t]}
                    </option>
                  ))}
                </select>
                {errors.theme && (
                  <p className="text-xs text-red-600">{errors.theme.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="add-frequency"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Fréquence
                </label>
                <input
                  id="add-frequency"
                  type="text"
                  placeholder="Mensuelle, Hebdo, Trimestrielle…"
                  {...register('frequency')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="add-title"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Titre *
              </label>
              <input
                id="add-title"
                type="text"
                placeholder="Titre court de la source (ex: France Compétences — Actualités)"
                {...register('title')}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {errors.title && (
                <p className="text-xs text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="add-url"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                URL
              </label>
              <input
                id="add-url"
                type="url"
                placeholder="https://…"
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
                  htmlFor="add-source"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Source
                </label>
                <input
                  id="add-source"
                  type="text"
                  placeholder="Organisme, éditeur…"
                  {...register('source')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="add-responsable"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Responsable
                </label>
                <input
                  id="add-responsable"
                  type="text"
                  placeholder="Direction, Nom Prénom…"
                  {...register('responsable')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="add-typesource"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Type de source
                </label>
                <input
                  id="add-typesource"
                  type="text"
                  placeholder="RSS, Newsletter, Site web…"
                  {...register('typeSource')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="add-modesuivi"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Mode de suivi
                </label>
                <input
                  id="add-modesuivi"
                  type="text"
                  placeholder="Email, RSS reader, manuel…"
                  {...register('modeSuivi')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="add-exploitation"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Exploitation (audit Qualiopi)
              </label>
              <textarea
                id="add-exploitation"
                rows={3}
                placeholder="Comment cette source est-elle exploitée dans l'OF ?"
                {...register('exploitation')}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
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
                {pending ? 'Ajout…' : 'Ajouter la source'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

'use client';

/**
 * InvoiceSettingsForm (Phase 11 Plan 11-04 Task 3 — FACT-02/FACT-03).
 *
 * Formulaire client RHF pour 2 paramètres tenant Facturation :
 *  - `creditNotePrefix` (D-02) — préfixe séquence avoirs CGI art. 289 (default "AVO").
 *  - `invoiceReminderDays` (D-10) — array 1-3 entiers strictement croissants
 *    (default [30, 45]) consommé par le worker Plan 11-06.
 *
 * UX :
 *  - 2 champs Input texte avec hints explicatifs sous chaque label.
 *  - Délais saisis en CSV "30, 45" → parsés côté client en `number[]` avant
 *    validation Zod (`InvoiceReminderSettingsSchema`) — UX plus simple qu'un
 *    multi-array dynamique pour 2-3 valeurs.
 *  - Préfixe upper-cased automatiquement (setValueAs).
 *  - Validation client (Zod safeParse) avant l'appel server pour éviter un
 *    round-trip dans le cas du mauvais format. Toast.error si parse fail,
 *    toast.success si server ok.
 *
 * Anti-régression Phase 7-04 : ce formulaire est WRAPPÉ par un nouveau
 * `<SettingsSection title="Facturation — Relances et avoirs">` AJOUTÉ à la
 * page `/app/parametres` APRÈS la section "Numérotation factures" existante.
 * Les 6 sections Phase 7-04 (Identity/Address/Assets/Invoicing/Banking/Email)
 * restent intactes.
 *
 * Pattern : clone des conventions `distribution-leads-form.tsx` (Phase 9 D-Phase9-R)
 * + `of-invoicing-form.tsx` (Phase 7 hints + uppercase input + tailwind direct).
 */

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  InvoiceReminderSettingsSchema,
  type InvoiceReminderSettingsInput,
} from '@qualiof/shared';
import { updateInvoiceReminderSettings } from '@/server/actions/invoice-settings';

interface Props {
  initial: {
    invoiceReminderDays: number[];
    creditNotePrefix: string | null;
  };
  /** Appelé après save réussi — pattern Phase 7 SettingsSection. */
  onSaved?: () => void;
  /** Appelé sur clic "Annuler" — pattern Phase 7 SettingsSection. */
  onCancel?: () => void;
}

/** Champs internes du formulaire (avant parsing CSV → number[]). */
interface InvoiceSettingsFormFields {
  creditNotePrefix: string;
  invoiceReminderDaysCsv: string;
}

export function InvoiceSettingsForm({ initial, onSaved, onCancel }: Props) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvoiceSettingsFormFields>({
    defaultValues: {
      creditNotePrefix: initial.creditNotePrefix ?? 'AVO',
      invoiceReminderDaysCsv: (initial.invoiceReminderDays.length > 0
        ? initial.invoiceReminderDays
        : [30, 45]
      ).join(', '),
    },
  });

  const onSubmit = handleSubmit((data) => {
    // Parse CSV "30, 45, 60" → [30, 45, 60] (filtre les NaN pour tolérer
    // virgules en fin de chaîne ou espaces orphelins).
    const days = data.invoiceReminderDaysCsv
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));

    const payload: InvoiceReminderSettingsInput = {
      invoiceReminderDays: days,
      creditNotePrefix: (data.creditNotePrefix ?? '').trim().toUpperCase() || undefined,
    };

    // Validation client AVANT le server roundtrip (UX immédiate sur format invalide).
    const parsed = InvoiceReminderSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      const firstMsg = parsed.error.issues[0]?.message ?? 'Saisie invalide';
      toast.error(`Validation échouée : ${firstMsg}`);
      return;
    }

    startTransition(async () => {
      const res = await updateInvoiceReminderSettings(parsed.data);
      if (res.ok) {
        toast.success('Paramètres Facturation enregistrés');
        onSaved?.();
      } else {
        toast.error(res.error || 'Erreur lors de la mise à jour');
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5 max-w-xs">
        <label
          htmlFor="invoice-creditNotePrefix"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Préfixe avoirs
        </label>
        <input
          id="invoice-creditNotePrefix"
          type="text"
          maxLength={8}
          {...register('creditNotePrefix', {
            setValueAs: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
          })}
          placeholder="AVO"
          aria-describedby="invoice-creditNotePrefix-help"
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <p
          id="invoice-creditNotePrefix-help"
          className="text-[11px] text-muted-foreground"
        >
          Format : majuscules + chiffres uniquement (1-8 caractères). Ex : AVO, NC, AV2026.
          Séquence distincte des factures (CGI art. 289).
        </p>
        {errors.creditNotePrefix && (
          <p className="text-xs text-red-600">{errors.creditNotePrefix.message}</p>
        )}
      </div>

      <div className="space-y-1.5 max-w-sm">
        <label
          htmlFor="invoice-invoiceReminderDaysCsv"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Délais de relance (jours après échéance)
        </label>
        <input
          id="invoice-invoiceReminderDaysCsv"
          type="text"
          {...register('invoiceReminderDaysCsv')}
          placeholder="30, 45"
          aria-describedby="invoice-reminder-days-help"
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <p
          id="invoice-reminder-days-help"
          className="text-[11px] text-muted-foreground"
        >
          1 à 3 délais strictement croissants (ex : 30, 45 ou 30, 45, 60). Niveau 1
          (ton amical) au premier délai, niveau 2 (ton ferme) au second.
        </p>
        {errors.invoiceReminderDaysCsv && (
          <p className="text-xs text-red-600">{errors.invoiceReminderDaysCsv.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="inline-flex items-center px-4 py-2 rounded-md border border-input bg-white hover:bg-muted disabled:opacity-50 text-sm font-medium"
          >
            Annuler
          </button>
        ) : null}
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

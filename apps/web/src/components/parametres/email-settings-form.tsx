'use client';

/**
 * EmailSettingsForm (Phase 22 Plan 22-11 — D-06 garde-fou applicatif envois).
 *
 * Formulaire client de la section Paramètres « Envois d'emails » :
 *  1. Interrupteur général `emailsEnabled` — OFF par défaut (fail-closed).
 *     OFF : seules les sessions de test cochées peuvent recevoir des emails,
 *     dans les catégories cochées.
 *  2. 6 checkboxes par catégorie (libellés `EMAIL_CATEGORY_LABELS`), avec hint
 *     « qui reçoit » — ⚠ Relances factures peut toucher un apprenant (règle
 *     payeur : l'auto-entrepreneur est son propre payeur).
 *  3. Sessions autorisées en mode test : liste de checkboxes (sessions passées
 *     en props par le Server Component) + chips des sélectionnées.
 *
 * Pattern : clone conventions `invoice-settings-form.tsx` (RHF + safeParse
 * client avant l'appel server + toasts sonner + tailwind direct). Sélecteur de
 * sessions en primitives natives (pas de Dialog Radix — leçon projet fallback).
 */

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmailSettingsSchema, type EmailSettingsInput } from '@qualiof/shared';
import { EMAIL_CATEGORY_LABELS, type EmailCategory } from '@/lib/email-policy';
import { updateEmailSettings } from '@/server/actions/email-settings';

export interface SelectableSession {
  id: string;
  /** Libellé pré-formaté côté serveur : "SES-0094 · Titre produit · 12/05/2026". */
  label: string;
}

interface Props {
  initial: EmailSettingsInput;
  /** Sessions sélectionnables (30 récentes ∪ déjà sélectionnées — jamais masquées). */
  sessions: SelectableSession[];
  onSaved?: () => void;
  onCancel?: () => void;
}

/** Champs booleans du formulaire (testSessionIds géré à part en state). */
type EmailSettingsFormFields = Omit<EmailSettingsInput, 'testSessionIds'>;

const CATEGORY_FIELDS: Array<{
  field: keyof EmailSettingsFormFields;
  category: EmailCategory;
  hint: string;
  warn?: boolean;
}> = [
  {
    field: 'invoiceRemindersEnabled',
    category: 'invoice_reminder',
    hint: 'Destinataire : le payeur de la facture. ⚠ Peut toucher un apprenant (règle payeur : l\'auto-entrepreneur est son propre payeur).',
    warn: true,
  },
  {
    field: 'preinscriptionRemindersEnabled',
    category: 'preinscription_reminder',
    hint: 'Destinataire : le candidat qui n\'a pas complété son formulaire de pré-inscription.',
  },
  {
    field: 'opcoRemindersEnabled',
    category: 'opco_reminder',
    hint: 'Destinataire : l\'OPCO / le sponsor en attente (remboursement ou paiement).',
  },
  {
    field: 'opcoSubmissionsEnabled',
    category: 'opco_submission',
    hint: 'Destinataire : l\'OPCO — envoi du dossier de prise en charge avec pièces jointes.',
  },
  {
    field: 'internalNotificationsEnabled',
    category: 'internal_notification',
    hint: 'Destinataires : les membres de l\'équipe (pack fin de formation terminé, lead assigné).',
  },
  {
    field: 'userInvitationsEnabled',
    category: 'user_invitation',
    hint: 'Destinataires : les nouveaux membres invités (lien d\'activation / reset mot de passe).',
  },
];

export function EmailSettingsForm({ initial, sessions, onSaved, onCancel }: Props) {
  const [isPending, startTransition] = useTransition();
  const [testSessionIds, setTestSessionIds] = useState<string[]>(initial.testSessionIds ?? []);

  const { register, handleSubmit, watch } = useForm<EmailSettingsFormFields>({
    defaultValues: {
      emailsEnabled: initial.emailsEnabled,
      invoiceRemindersEnabled: initial.invoiceRemindersEnabled,
      preinscriptionRemindersEnabled: initial.preinscriptionRemindersEnabled,
      opcoRemindersEnabled: initial.opcoRemindersEnabled,
      opcoSubmissionsEnabled: initial.opcoSubmissionsEnabled,
      internalNotificationsEnabled: initial.internalNotificationsEnabled,
      userInvitationsEnabled: initial.userInvitationsEnabled,
    },
  });

  const emailsEnabled = watch('emailsEnabled');

  function toggleSession(id: string) {
    setTestSessionIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const selectedSessions = sessions.filter((s) => testSessionIds.includes(s.id));

  const onSubmit = handleSubmit((data) => {
    const payload: EmailSettingsInput = { ...data, testSessionIds };

    // Validation client AVANT le server roundtrip (UX immédiate).
    const parsed = EmailSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      const firstMsg = parsed.error.issues[0]?.message ?? 'Saisie invalide';
      toast.error(`Validation échouée : ${firstMsg}`);
      return;
    }

    startTransition(async () => {
      const res = await updateEmailSettings(parsed.data);
      if (res.ok) {
        toast.success('Réglages d\'envoi d\'emails enregistrés');
        onSaved?.();
      } else {
        toast.error(res.error || 'Erreur lors de la mise à jour');
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ── 1. Interrupteur général ─────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('emailsEnabled')}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">Activer les envois d&apos;emails</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              OFF : seules les sessions de test ci-dessous peuvent recevoir des emails, dans
              les catégories cochées. ON : toutes les catégories cochées envoient pour tout
              le parc.
            </span>
          </span>
        </label>
        {!emailsEnabled && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 ml-7">
            Mode test : aucun email ne part en dehors des sessions autorisées ci-dessous.
          </p>
        )}
      </div>

      {/* ── 2. Catégories ──────────────────────────────────────────────── */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Catégories d&apos;emails autorisées
        </legend>
        {CATEGORY_FIELDS.map(({ field, category, hint, warn }) => (
          <label key={field} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register(field)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <span>
              <span className="block text-sm font-medium">
                {EMAIL_CATEGORY_LABELS[category]}
              </span>
              <span
                className={`block text-[11px] mt-0.5 ${warn ? 'text-amber-700' : 'text-muted-foreground'}`}
              >
                {hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* ── 3. Sessions autorisées en mode test ────────────────────────── */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sessions autorisées en mode test
        </legend>
        <p className="text-[11px] text-muted-foreground">
          Quand l&apos;interrupteur général est OFF, seuls les emails rattachés à ces sessions
          partent (dans les catégories cochées). Maximum 20 sessions.
        </p>
        {selectedSessions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedSessions.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium"
              >
                {s.label}
                <button
                  type="button"
                  aria-label={`Retirer ${s.label}`}
                  onClick={() => toggleSession(s.id)}
                  className="hover:text-red-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {sessions.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground italic">Aucune session disponible.</p>
          ) : (
            sessions.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={testSessionIds.includes(s.id)}
                  onChange={() => toggleSession(s.id)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="truncate">{s.label}</span>
              </label>
            ))
          )}
        </div>
      </fieldset>

      {/* ── Actions ────────────────────────────────────────────────────── */}
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

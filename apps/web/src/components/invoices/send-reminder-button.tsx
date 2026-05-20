'use client';

import { useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';
import { sendInvoiceReminder } from '@/server/actions/invoices';

/**
 * Phase 11 Plan 11-06 Task 3 — Bouton "Envoyer relance maintenant" sur fiche facture.
 *
 * Décision D-Phase9-J reproduite (Phase 9-03) :
 *  `@radix-ui/react-alert-dialog` n'est PAS installé. On utilise
 *  `@radix-ui/react-dialog` (déjà utilisé pour CreateCreditNoteDialog Plan 11-05
 *  + ReassignLeadButton Phase 9-03) pour la confirmation.
 *
 * Décision D-09 (CONTEXT.md Phase 11) :
 *  La server action `sendInvoiceReminder` est partagée cron + manual ;
 *  le bouton appelle `triggered_by: 'manual'` → ignore l'idempotence 24h.
 *
 * Flow :
 *  1. Trigger ouvre la modal de confirmation (affiche dernière relance + niveau).
 *  2. Confirm → `sendInvoiceReminder({ invoiceId, triggered_by: 'manual' })`.
 *  3. Succès → toast vert (niveau, DRY RUN si SMTP_HOST vide) + close + `router.refresh()`.
 *  4. Erreur → toast rouge (message serveur : PAID/CANCELLED/email manquant/niveau max).
 *
 * Bouton désactivé si :
 *  - status ∉ {ISSUED, PARTIAL, OVERDUE} (auto-stop D-13)
 *  - reminderCount >= maxLevel (niveau maximum atteint, ex. 2/2)
 */
interface Props {
  invoiceId: string;
  status: string;
  lastReminderAt: Date | null;
  reminderCount: number;
  maxLevel: number;
}

const fmtDateTime = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function SendReminderButton({
  invoiceId,
  status,
  lastReminderAt,
  reminderCount,
  maxLevel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isEligibleStatus = ['ISSUED', 'PARTIAL', 'OVERDUE'].includes(status);
  const isLevelMaxed = reminderCount >= maxLevel;
  const disabled = !isEligibleStatus || isLevelMaxed;

  const lastReminderLabel = lastReminderAt
    ? `Dernière relance le ${fmtDateTime.format(lastReminderAt)} (niveau ${reminderCount}/${maxLevel}).`
    : 'Aucune relance envoyée pour cette facture.';

  const tooltipText = !isEligibleStatus
    ? 'Relances impossibles sur facture non éligible (payée, annulée, brouillon, avoir).'
    : isLevelMaxed
      ? `Niveau maximum atteint (${reminderCount}/${maxLevel}).`
      : lastReminderLabel;

  function handleConfirm() {
    startTransition(async () => {
      const res = await sendInvoiceReminder({
        invoiceId,
        triggered_by: 'manual',
      });
      if (res.ok) {
        toast.success(
          `Relance envoyée (niveau ${res.level})${res.dryRun ? ' — DRY RUN (SMTP non configuré)' : ''}`,
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={tooltipText}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-orange-300 bg-orange-50 text-sm font-medium text-orange-900 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" /> Envoyer relance maintenant
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] max-w-[92vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <Dialog.Title className="text-lg font-semibold">
            Envoyer une relance ?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {lastReminderLabel} Un email sera envoyé immédiatement au payeur
            avec le récapitulatif de la facture. Cette relance s'incrémentera
            dans le compteur (niveau {Math.min(reminderCount + 1, maxLevel)}/
            {maxLevel}).
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm disabled:opacity-50"
              >
                Annuler
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 text-sm disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Envoi…
                </>
              ) : (
                'Envoyer la relance'
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

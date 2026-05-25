'use client';

import { useState, useTransition } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { sendPreEnrollmentReminder } from '@/server/actions/preinscription-reminders';

interface Props {
  preEnrollmentId: string;
  reminderCount: number;
  lastReminderSentAt: Date | null;
}

const SKIP_REASON_LABEL: Record<string, string> = {
  'no-email': 'Aucune adresse email',
  'not-pending': 'Statut différent de PENDING_FORM',
  expired: 'Lien expiré',
  'max-reminders': '3 relances déjà envoyées (limite atteinte)',
  cooldown: 'Une relance a été envoyée il y a moins de 6 jours',
};

export function SingleReminderButton({
  preEnrollmentId,
  reminderCount,
  lastReminderSentAt,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(force: boolean) {
    startTransition(async () => {
      const r = await sendPreEnrollmentReminder(preEnrollmentId, { force });
      if (r.ok) {
        const msg = r.dryRun
          ? `Relance #${r.reminderNumber} envoyée à ${r.to} (mode test SMTP)`
          : `Relance #${r.reminderNumber} envoyée à ${r.to}`;
        toast.success(msg);
      } else if (r.skippedReason) {
        toast.warning(SKIP_REASON_LABEL[r.skippedReason] ?? r.skippedReason);
      } else {
        toast.error(r.error ?? 'Erreur lors de l\'envoi');
      }
      router.refresh();
    });
  }

  const lastDate = lastReminderSentAt
    ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(
        lastReminderSentAt instanceof Date ? lastReminderSentAt : new Date(lastReminderSentAt),
      )
    : null;

  return (
    <div className="rounded-xl border border-border bg-white p-4 flex items-center justify-between">
      <div className="text-sm">
        <div className="font-medium">Relances email</div>
        <div className="text-xs text-muted-foreground">
          {reminderCount === 0
            ? 'Aucune relance envoyée pour l\'instant.'
            : `${reminderCount} relance${reminderCount > 1 ? 's' : ''} envoyée${reminderCount > 1 ? 's' : ''}${lastDate ? ` · dernière le ${lastDate}` : ''}.`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          Envoyer une relance
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending}
          title="Forcer l'envoi (ignore cooldown 6j et limite 3 relances)"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-60"
        >
          Forcer
        </button>
      </div>
    </div>
  );
}

'use client';

import { useTransition } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendDossierReminderEmail } from '@/server/actions/dossier-reminder';

interface Props {
  participantId: string;
  /** Cacher le bouton si non applicable (dossier complet ou pas de facture) */
  disabled?: boolean;
}

export function DossierReminderButton({ participantId, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await sendDossierReminderEmail(participantId);
      if (!r.ok) {
        toast.error(r.error ?? 'Erreur envoi relance');
        return;
      }
      const dryRunNote = r.dryRun ? ' (mode test SMTP)' : '';
      toast.success(`Relance ${r.reminderType === 'attente-opco' ? 'OPCO' : 'client'} envoyée à ${r.to}${dryRunNote}`);
    });
  }

  if (disabled) return null;

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title="Relancer par email"
      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-wait"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
    </button>
  );
}

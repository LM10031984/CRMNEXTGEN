'use client';

/**
 * Bouton "Composer dossier OPCO" — déclenche composeOpcoSubmission et
 * redirige vers la page prévisu /app/dossiers-opco/envoyer/[id].
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mailbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { composeOpcoSubmission } from '@/server/actions/opco-submission';

export function ComposeOpcoButton({
  participantId,
  disabled,
}: {
  participantId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const r = await composeOpcoSubmission(participantId);
      if (!r.ok || !r.submissionId) {
        toast.error(r.error ?? 'Erreur composition dossier');
        return;
      }
      const missingNote = r.missing && r.missing.length > 0
        ? ` (${r.missing.length} pièce${r.missing.length > 1 ? 's' : ''} manquante${r.missing.length > 1 ? 's' : ''})`
        : '';
      toast.success(`Dossier composé${missingNote} — prêt à éditer`);
      router.push(`/app/dossiers-opco/envoyer/${r.submissionId}` as any);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      title={disabled ? 'Émets d\'abord la facture' : 'Composer le dossier OPCO complet'}
      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mailbox className="h-3.5 w-3.5" />}
    </button>
  );
}

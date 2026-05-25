'use client';

/**
 * Bouton primaire "Marquer terminée" pour les sessions IN_PROGRESS.
 *
 * Bascule le statut → COMPLETED. Côté serveur, `updateSessionStatus` détecte
 * la transition et déclenche automatiquement la génération du pack fin de
 * formation en arrière-plan (cf sessions.ts). L'utilisateur recevra un email
 * quand le pack sera prêt — pas besoin de rester sur la page.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateSessionStatus } from '@/server/actions/sessions';

interface Props {
  sessionId: string;
  participantCount: number;
}

export function MarkCompletedButton({ sessionId, participantCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const r = await updateSessionStatus({ sessionId, newStatus: 'COMPLETED' });
      if (!r.ok) {
        toast.error(r.error ?? 'Échec de la clôture');
        return;
      }
      if (r.autoPackTriggered) {
        toast.success('Session terminée — pack fin de formation lancé', {
          description: 'Tu recevras un email quand les documents seront prêts.',
          duration: 7000,
        });
      } else {
        toast.success('Session terminée');
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || participantCount === 0}
      title={
        participantCount === 0
          ? 'Aucun apprenant inscrit'
          : 'Clôture la session et lance la génération du pack fin de formation'
      }
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
      Marquer terminée
    </button>
  );
}

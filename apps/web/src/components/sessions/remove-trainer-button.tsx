'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { X, Loader2 } from 'lucide-react';
import { removeSessionTrainer } from '@/server/actions/sessions';

interface Props {
  sessionId: string;
  personId: string;
  personName: string;
}

/**
 * Bouton "supprimer" sur une ligne formateur de la fiche session.
 * Demande confirmation puis appelle removeSessionTrainer.
 */
export function RemoveTrainerButton({ sessionId, personId, personName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Retirer ${personName} de cette session ?`)) return;
    startTransition(async () => {
      const r = await removeSessionTrainer({ sessionId, personId });
      if (r.ok) {
        toast.success(`${personName} retiré`);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={`Retirer ${personName}`}
      aria-label={`Retirer ${personName} de la session`}
      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <X className="h-4 w-4" />
      )}
    </button>
  );
}

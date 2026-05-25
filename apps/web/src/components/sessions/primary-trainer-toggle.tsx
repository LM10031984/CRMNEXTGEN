'use client';

/**
 * Toggle étoile pour marquer un formateur comme principal de la session.
 * Le formateur principal signe tous les docs Qualiopi (convention, grille,
 * satisfaction…).
 */

import { useTransition } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { setPrimaryTrainer } from '@/server/actions/session-trainers';

export function PrimaryTrainerToggle({
  sessionId,
  personId,
  personName,
  isPrimary,
}: {
  sessionId: string;
  personId: string;
  personName: string;
  isPrimary: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (isPrimary) return; // déjà primary, no-op
    startTransition(async () => {
      const r = await setPrimaryTrainer(sessionId, personId);
      if (!r.ok) {
        toast.error(r.error ?? 'Erreur');
        return;
      }
      toast.success(`${personName} défini comme formateur principal`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || isPrimary}
      title={
        isPrimary
          ? 'Formateur principal — signe les docs Qualiopi'
          : 'Définir comme formateur principal'
      }
      className={`inline-flex items-center justify-center h-6 w-6 rounded transition-colors ${
        isPrimary
          ? 'text-amber-500'
          : 'text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-50'
      }`}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Star className={`h-3.5 w-3.5 ${isPrimary ? 'fill-current' : ''}`} />
      )}
    </button>
  );
}

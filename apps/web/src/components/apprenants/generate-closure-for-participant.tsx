'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateClosurePack } from '@/server/actions/closure-pack';

interface Props {
  sessionId: string;
  participantId: string;
  sessionLabel?: string;
}

/**
 * Bouton compact "Pack fin de formation" pour un seul stagiaire.
 * Réutilise generateClosurePack avec un filtre participantIds=[participantId].
 */
export function GenerateClosureForParticipantButton({
  sessionId,
  participantId,
  sessionLabel,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const r = await generateClosurePack(sessionId, { participantIds: [participantId] });
      if (!r.ok) {
        setError(r.error ?? 'Erreur lors du lancement');
        toast.error(r.error ?? 'Erreur lors du lancement');
        return;
      }
      if (r.alreadyComplete) {
        toast.info(
          sessionLabel
            ? `Tous les docs existent déjà pour ${sessionLabel} — voir l'onglet Documents`
            : 'Tous les docs existent déjà pour cet apprenant',
        );
        router.refresh();
        return;
      }
      if (r.batchId) {
        const detail =
          r.skippedExisting && r.skippedExisting > 0
            ? ` (${r.skippedExisting} déjà fait${r.skippedExisting > 1 ? 's' : ''})`
            : '';
        toast.success(
          sessionLabel
            ? `Pack lancé pour ${sessionLabel} : ${r.total} doc${(r.total ?? 0) > 1 ? 's' : ''} à générer${detail}`
            : `Pack lancé : ${r.total} docs à générer${detail}`,
        );
        router.push(`/app/sessions/${sessionId}/closure/${r.batchId}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={error ?? 'Générer le pack fin de formation pour cet apprenant'}
      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-white text-[11px] text-foreground hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3" />}
      Pack fin de formation
    </button>
  );
}

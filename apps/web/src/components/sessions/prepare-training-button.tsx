'use client';

/**
 * Bouton "Préparer la formation" sur la fiche session.
 *
 * Génère en 1 clic le Programme + la Convention pour chaque apprenant
 * inscrit. Pendant typique du Pack fin de formation : avant la formation =
 * Programme + Convention par stagiaire ; après = Pack 10 docs Qualiopi.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Loader2, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { prepareTrainingForSession } from '@/server/actions/prepare-training';

interface Props {
  sessionId: string;
  participantCount: number;
}

export function PrepareTrainingButton({ sessionId, participantCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLaunch() {
    setError(null);
    startTransition(async () => {
      const r = await prepareTrainingForSession(sessionId);
      if (!r.ok) {
        setError(r.error ?? 'Erreur lors de la génération');
        return;
      }
      const programmes = r.programmesGenerated;
      const conventions = r.conventionsGenerated;
      const convocations = r.convocationsGenerated;
      const deroule = r.derouleGenerated ? 1 : 0;
      if (r.errors.length === 0) {
        toast.success(
          `Préparation OK : programme + ${deroule ? 'déroulé + ' : ''}check-list + ${conventions} convention${conventions > 1 ? 's' : ''} + ${convocations} convocation${convocations > 1 ? 's' : ''}`,
        );
      } else {
        toast.warning(
          `Partiel : ${programmes} programme, ${deroule} déroulé, ${conventions}/${r.total} convention(s), ${convocations}/${r.total} convocation(s) (${r.errors.length} erreur${r.errors.length > 1 ? 's' : ''})`,
        );
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={participantCount === 0}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          participantCount === 0
            ? 'Aucun apprenant inscrit'
            : 'Génère programme + convention pour chaque apprenant'
        }
      >
        <ClipboardList className="h-4 w-4" /> Préparer la formation
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={() => !pending && setOpen(false)}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Préparer la formation</h2>
          </div>
          <button
            type="button"
            onClick={() => !pending && setOpen(false)}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Génère les documents nécessaires avant la formation
          (Qualiopi indic 6, 9, 10, 17) :
        </p>
        <ul className="text-sm space-y-1 mb-4 ml-4 list-disc">
          <li>Programme de formation (1 par produit)</li>
          <li>Déroulé pédagogique (1 par produit, généré par IA)</li>
          <li>Check-list formation (1 par session)</li>
          <li>Convention de formation (1 par apprenant)</li>
          <li>Convocation stagiaire (1 par apprenant)</li>
        </ul>

        <div className="rounded-lg bg-primary-50 border border-primary-100 px-4 py-3 mb-5 text-sm">
          <strong className="text-primary-900">{participantCount}</strong>
          <span className="text-primary-700"> apprenant(s) · </span>
          <strong className="text-primary-900">{participantCount * 2 + 3} documents</strong>
          <span className="text-primary-700"> (3 partagés + {participantCount * 2} par stagiaire)</span>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 mb-4 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="h-9 px-4 rounded-md border border-border bg-white text-sm hover:bg-muted/40 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={pending || participantCount === 0}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Lancer la préparation
          </button>
        </div>
      </div>
    </>
  );
}

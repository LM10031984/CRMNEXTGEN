'use client';

/**
 * Bouton "📦 Pack fin de formation" sur la fiche session.
 *
 * Modale de confirmation avec estimation : N apprenants × 5 docs.
 * Au clic, lance generateClosurePack et redirige vers la page batch
 * progression. Disponible quel que soit le statut de la session — la
 * server action filtre déjà sur les participants éligibles.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Loader2, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { generateClosurePack } from '@/server/actions/closure-pack';

interface Props {
  sessionId: string;
  participantCount: number;
}

export function GenerateClosurePackButton({ sessionId, participantCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totalDocs = participantCount * 5;
  const estSeconds = Math.ceil((participantCount * 150) / 5); // 150s/apprenant, concurrency 5
  const estMinutes = Math.ceil(estSeconds / 60);

  function handleLaunch() {
    setError(null);
    startTransition(async () => {
      const r = await generateClosurePack(sessionId);
      if (r.ok && r.batchId) {
        toast.success(`Pack lancé : ${r.total ?? 0} documents en file`);
        router.push(`/app/sessions/${sessionId}/closure/${r.batchId}`);
      } else {
        setError(r.error ?? 'Erreur lors du lancement');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={participantCount === 0}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,82,122,0.45),0_0_20px_rgba(0,82,122,0.25)] transition-all duration-300 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
        title={participantCount === 0 ? 'Aucun apprenant inscrit' : 'Génère 5 documents Qualiopi pour chaque apprenant'}
      >
        <Package className="h-4 w-4" /> Pack fin de formation
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={() => !pending && setOpen(false)}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Pack fin de formation</h2>
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
          Cette action va générer en parallèle, pour chaque apprenant éligible, les
          5 documents Qualiopi de fin de formation :
        </p>

        <ul className="text-sm space-y-1 mb-4 ml-4 list-disc">
          <li>Attestation de fin de formation</li>
          <li>Certificat de réalisation</li>
          <li>QCM final (questions générées par IA)</li>
          <li>Grille d'observation (compétences générées par IA)</li>
          <li>Analyse des besoins (rétroactive, IA)</li>
        </ul>

        <div className="rounded-lg bg-primary-50 border border-primary-100 px-4 py-3 mb-5">
          <div className="text-sm">
            <strong className="text-primary-900">{participantCount}</strong>
            <span className="text-primary-700"> apprenant(s) × </span>
            <strong className="text-primary-900">5 docs</strong>
            <span className="text-primary-700"> = </span>
            <strong className="text-primary-900">{totalDocs} documents</strong>
          </div>
          <div className="text-xs text-primary-700 mt-1">
            Durée estimée : ~{estMinutes} min (génération IA en arrière-plan)
          </div>
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
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,82,122,0.45),0_0_20px_rgba(0,82,122,0.25)] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Lancer la génération
          </button>
        </div>
      </div>
    </>
  );
}

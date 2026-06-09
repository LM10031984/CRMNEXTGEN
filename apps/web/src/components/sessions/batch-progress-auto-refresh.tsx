'use client';

/**
 * Auto-refresh de la fiche session quand un batch closure est RUNNING ou
 * PENDING — toutes les 5 secondes. Affiche une vraie progress bar avec
 * pourcentage du dernier batch en cours.
 *
 * Stoppe automatiquement quand le batch passe à COMPLETED/PARTIAL/FAILED.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Package } from 'lucide-react';

interface Props {
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  totalDocs: number;
  doneDocs: number;
  errorDocs: number;
}

export function BatchProgressAutoRefresh({ status, totalDocs, doneDocs, errorDocs }: Props) {
  const router = useRouter();
  const isRunning = status === 'RUNNING' || status === 'PENDING';

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [isRunning, router]);

  if (!isRunning) return null;

  const pct = totalDocs > 0 ? Math.round((doneDocs / totalDocs) * 100) : 0;
  const remaining = totalDocs - doneDocs - errorDocs;

  return (
    <section className="rounded-2xl border-2 border-primary-200 bg-primary-50/40 p-5">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <h2 className="font-semibold inline-flex items-center gap-2 text-primary-900">
          <Package className="h-4 w-4" /> Pack de fin de formation en cours
        </h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          rafraîchissement auto · toutes les 5s
        </span>
      </div>

      <div className="flex items-center gap-3 text-sm mb-2">
        <span className="font-medium tabular-nums text-primary-900">
          {doneDocs} / {totalDocs} docs
        </span>
        {errorDocs > 0 && (
          <span className="text-red-700 tabular-nums">
            · {errorDocs} erreur{errorDocs > 1 ? 's' : ''}
          </span>
        )}
        <span className="text-muted-foreground tabular-nums">
          · {remaining} restant{remaining > 1 ? 's' : ''}
        </span>
        <span className="ml-auto text-xl font-bold tabular-nums text-primary">
          {pct}%
        </span>
      </div>

      <div className="h-2 rounded-full bg-white border border-primary-200 overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-[11px] text-muted-foreground mt-2 italic">
        Ollama traite les docs un par un (concurrence=3). Tu peux quitter cette page — la génération continue côté serveur. Tu recevras un email à la fin.
      </p>
    </section>
  );
}

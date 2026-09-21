'use client';

/**
 * Le panneau « génération en cours » de la matrice.
 *
 * CE QU'IL RÉPARE (production, 21/09)
 *
 * Le chemin unitaire de la matrice — « Régénérer » sur une cellule — envoyait
 * le document en file, JETAIT le `batchId` rendu par le serveur, et affichait
 * un toast « résultat dans ~2 min ». L'écran, lui, continuait d'offrir un lien
 * vers un document que le worker allait remplacer : 404, « jusqu'à ce qu'on
 * recharge une fois ou deux ».
 *
 * Deux moitiés, et il faut les deux :
 *   1. la cellule passe « en cours » et n'offre plus de lien (`GENERATING`,
 *      `lib/derive-cell-state.ts`) ;
 *   2. l'écran se remet à jour SEUL quand le job a fini — c'est ce composant.
 *      Sans lui, on aurait troqué un « not found » contre un « en cours »
 *      éternel.
 *
 * LE SERVEUR EST LA SEULE SOURCE DE VÉRITÉ. Les `batchIds` viennent de la page,
 * qui lit les jobs en file ou en cours. Aucun état client à synchroniser : un
 * rechargement en plein milieu retrouve le panneau, et le `router.refresh()`
 * final le fait disparaître puisque plus rien n'est en vol.
 *
 * `ClosureBatchProgress` savait déjà tout faire — suivre un batch, montrer
 * chaque job, relancer les erreurs. Il n'était monté que sur sa page dédiée.
 */

import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ClosureBatchProgress } from '@/components/sessions/closure-batch-progress';

export interface GenerationEnCoursPanelProps {
  sessionId: string;
  /** Batchs ayant au moins un job en file ou en cours, lus côté serveur. */
  batchIds: readonly string[];
}

export function GenerationEnCoursPanel({ sessionId, batchIds }: GenerationEnCoursPanelProps) {
  // Le cas de loin le plus fréquent : rien n'est en vol. On sort AVANT tout
  // hook — `useRouter` vit dans le composant interne — pour que la matrice
  // reste rendable hors routeur (tests, aperçus) quand il n'y a rien à suivre.
  if (batchIds.length === 0) return null;
  return <PanneauActif sessionId={sessionId} batchIds={batchIds} />;
}

function PanneauActif({ sessionId, batchIds }: GenerationEnCoursPanelProps) {
  const router = useRouter();

  return (
    <section
      aria-live="polite"
      className="mx-5 mb-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3"
    >
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-sky-900">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Génération en cours
      </h3>
      <p className="mb-3 text-xs text-sky-800">
        Les cellules concernées restent en attente et s’ouvriront d’elles-mêmes une fois le document
        prêt — inutile de recharger la page.
      </p>
      <div className="flex flex-col gap-3">
        {batchIds.map((batchId) => (
          <ClosureBatchProgress
            key={batchId}
            batchId={batchId}
            sessionId={sessionId}
            onSettled={() => router.refresh()}
          />
        ))}
      </div>
    </section>
  );
}

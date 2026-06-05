'use client';

/**
 * Validation 1-clic du brouillon IA du programme produit, **depuis la fiche
 * session** (pas obligé d'aller sur la fiche produit).
 *
 * Bug remonté Laurent 2026-06-04 : "le programme est lié au produit, je dois
 * le retrouver en un seul clic ici". Cette bannière inline règle ça :
 *  - 1 clic "Valider le programme" → server action validateAiDraftProduct
 *  - 1 clic "Voir le programme" → ouvre /api/documents/{pdfId} en nouvel onglet
 *  - 1 clic "Éditer sur le produit" → ouvre fiche produit en nouvel onglet
 *
 * La bannière complète sur la fiche produit (<AiDraftValidationBanner>)
 * existe toujours pour les gens qui arrivent directement par le produit.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validateAiDraftProduct } from '@/server/actions/crud-edits';

interface Props {
  productId: string;
  aiDraftedAt: Date;
  productPdfId: string | null;
  canValidate: boolean;
}

export function InlineAiDraftValidator({
  productId,
  aiDraftedAt,
  productPdfId,
  canValidate,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const draftDate = new Date(aiDraftedAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  function handleValidate() {
    startTransition(async () => {
      const r = await validateAiDraftProduct(productId);
      if (r.ok) {
        toast.success('Programme validé — le pack fin de formation est débloqué.');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur lors de la validation');
      }
    });
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 flex items-start gap-3">
      <div className="shrink-0 h-8 w-8 rounded-md bg-amber-100 text-amber-700 inline-flex items-center justify-center">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-amber-900">
            Programme IA à valider
          </span>
          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-mono">
            généré {draftDate}
          </span>
        </div>
        <p className="text-xs text-amber-800 mt-0.5 leading-snug">
          Tant que le programme n'est pas validé, le pack fin de formation est bloqué.
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {canValidate && (
            <button
              type="button"
              onClick={handleValidate}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors shadow-sm disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {pending ? 'Validation…' : 'Valider le programme'}
            </button>
          )}
          {productPdfId && (
            <a
              href={`/api/documents/${productPdfId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-amber-300 bg-white text-amber-800 text-xs font-medium hover:bg-amber-50 transition-colors"
            >
              Voir le programme PDF
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <a
            href={`/app/produits/${productId}?tab=programme`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            Éditer le contenu
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {!canValidate && (
          <p className="text-[11px] text-amber-700 mt-2 italic">
            Seuls les rôles ADMIN ou MANAGER peuvent valider.
          </p>
        )}
      </div>
    </div>
  );
}

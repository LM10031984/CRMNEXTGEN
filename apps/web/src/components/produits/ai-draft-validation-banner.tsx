'use client';

/**
 * BUG-P0-02 — Bannière affichée sur le tab Programme quand un produit a été
 * généré par IA et n'a pas encore été validé par un humain (ADMIN ou MANAGER).
 *
 * Tant que la bannière est présente, `getSessionCompleteness` ajoute un
 * blocker `product_ai_unreviewed` qui empêche le pack fin de formation
 * (cf. lib/sessions/completeness.ts).
 *
 * Action "Valider" → server action validateAiDraftProduct → aiDraftedAt = null.
 * Action "Réviser" → ouvre la modale d'édition produit existante (TODO :
 * brancher sur EditProductButton si présent — pour l'instant lien direct).
 */

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { validateAiDraftProduct } from '@/server/actions/crud-edits';

interface Props {
  productId: string;
  aiDraftedAt: Date;
  /** Rôle utilisateur courant (ADMIN/MANAGER peuvent valider, autres voient juste la bannière info). */
  canValidate: boolean;
}

export function AiDraftValidationBanner({ productId, aiDraftedAt, canValidate }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const draftDate = new Date(aiDraftedAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  function handleValidate() {
    setError(null);
    startTransition(async () => {
      const r = await validateAiDraftProduct(productId);
      if (r.ok) {
        toast.success('Brouillon IA validé. Le produit peut désormais être utilisé pour des conventions Qualiopi.');
        router.refresh();
      } else {
        setError(r.error ?? 'Erreur lors de la validation');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-9 w-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-amber-900">Brouillon IA — non validé</h4>
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
              généré le {draftDate}
            </span>
          </div>
          <p className="text-sm text-amber-800 mb-3">
            Ce programme a été auto-rempli par l'IA (Ollama). Un humain doit le relire et
            le valider avant qu'il puisse servir de base à une convention Qualiopi.
            Tant qu'il n'est pas validé, le pack fin de formation est bloqué sur toutes
            les sessions de ce produit.
          </p>
          {!canValidate && (
            <div className="text-xs text-amber-700 inline-flex items-center gap-1.5 mb-3">
              <AlertTriangle className="h-3.5 w-3.5" />
              Seuls les rôles ADMIN ou MANAGER peuvent valider.
            </div>
          )}
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mb-3">
              {error}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleValidate}
              disabled={pending || !canValidate}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Valider le programme
            </button>
            <a
              href={`/app/produits/${productId}/edit`}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-amber-300 bg-white text-amber-900 text-sm font-medium hover:bg-amber-50"
            >
              Réviser le contenu
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

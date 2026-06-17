'use client';

import { useState, useTransition } from 'react';
import { FileText, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { generateProgrammeForProduct } from '@/server/actions/programme-generator';

export function GenerateProductProgrammeButton({
  productId,
  regenerateOnly = false,
}: {
  productId: string;
  /** N'affiche que le bouton « Régénérer » (carte programme déjà présent). */
  regenerateOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState<string | null>(null);

  function run(force: boolean) {
    startTransition(async () => {
      try {
        const r = await generateProgrammeForProduct(productId, { force });
        if (r?.ok && r.documentId) {
          setDocId(r.documentId);
          toast.success(force ? 'Programme régénéré' : 'Programme disponible');
          window.open(`/api/documents/${r.documentId}`, '_blank');
        } else {
          toast.error(r?.error ?? 'Erreur génération programme (réponse vide du serveur)');
        }
      } catch (e: any) {
        toast.error(`Erreur : ${e?.message ?? String(e)}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {!regenerateOnly && (
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors',
            pending && 'opacity-70 cursor-wait',
          )}
          title="Génère le programme PDF prêt pour Qualiopi à partir des champs ci-dessous"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Voir le programme PDF
        </button>
      )}
      <button
        type="button"
        onClick={() => run(true)}
        disabled={pending}
        title="Régénérer le programme avec les champs et le prix actuels du produit"
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-foreground text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-70 disabled:cursor-wait"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} />
        Régénérer
      </button>
      {docId && (
        <a
          href={`/api/documents/${docId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          <ExternalLink className="h-3 w-3" /> Réouvrir
        </a>
      )}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { FileText, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { generateDerouleForProduct } from '@/server/actions/deroule-product-generator';

export function GenerateProductDerouleButton({
  productId,
  programmeReady = false,
  variant = 'primary',
}: {
  productId: string;
  programmeReady?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState<string | null>(null);

  if (!programmeReady) {
    return (
      <div className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-sm font-medium bg-muted text-muted-foreground cursor-not-allowed opacity-60" title="Générez d'abord le Programme PDF">
        <FileText className="h-4 w-4" />
        Générer après le programme
      </div>
    );
  }

  function run(force: boolean) {
    startTransition(async () => {
      try {
        const r = await generateDerouleForProduct(productId, { force });
        if (r?.ok && r.documentId) {
          setDocId(r.documentId);
          if (r.usedStub) {
            toast.warning('Déroulé généré en mode stub (Ollama indisponible) — relance plus tard');
          } else {
            toast.success(force ? 'Déroulé régénéré' : 'Déroulé pédagogique disponible');
          }
          window.open(`/api/documents/${r.documentId}`, '_blank');
        } else {
          toast.error(r?.error ?? 'Erreur génération déroulé');
        }
      } catch (e: any) {
        toast.error(`Erreur : ${e?.message ?? String(e)}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => run(false)}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-sm font-medium transition-colors',
          variant === 'primary'
            ? 'bg-primary text-white hover:bg-primary-600'
            : 'border border-border bg-white text-foreground hover:bg-muted/40',
          pending && 'opacity-70 cursor-wait',
        )}
        title="Voir le déroulé pédagogique du produit (génère si absent)"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Voir le déroulé péda.
      </button>
      <button
        type="button"
        onClick={() => run(true)}
        disabled={pending}
        title="Régénérer (force une nouvelle génération IA)"
        className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-white hover:bg-muted/40 text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" />
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

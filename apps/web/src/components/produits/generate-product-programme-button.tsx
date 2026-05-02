'use client';

import { useState, useTransition } from 'react';
import { FileText, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { generateProgrammeForProduct } from '@/server/actions/programme-generator';

export function GenerateProductProgrammeButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState<string | null>(null);

  const handleGenerate = () => {
    startTransition(async () => {
      try {
        const r = await generateProgrammeForProduct(productId);
        if (r?.ok && r.documentId) {
          setDocId(r.documentId);
          window.open(`/api/documents/${r.documentId}`, '_blank');
        } else {
          toast.error(r?.error ?? 'Erreur génération programme (réponse vide du serveur)');
        }
      } catch (e: any) {
        toast.error(`Erreur : ${e?.message ?? String(e)}`);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleGenerate}
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

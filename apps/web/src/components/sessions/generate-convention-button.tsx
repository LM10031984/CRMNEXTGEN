'use client';

import { useState, useTransition } from 'react';
import { FileText, Loader2, Check, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { generateConventionForParticipant } from '@/server/actions/convention-generator';

export function GenerateConventionButton({
  participantId,
  initialDocumentId,
}: {
  participantId: string;
  initialDocumentId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState<string | null>(initialDocumentId ?? null);

  const handleGenerate = () => {
    startTransition(async () => {
      const r = await generateConventionForParticipant(participantId);
      if (r.ok && r.documentId) {
        setDocId(r.documentId);
        toast.success('Convention générée');
      } else {
        toast.error(r.error ?? 'Erreur génération convention');
      }
    });
  };

  if (docId) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={`/api/documents/${docId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-sky-100 text-sky-800 text-xs font-medium hover:bg-sky-200"
        >
          <Check className="h-3.5 w-3.5" /> Convention prête <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Régénérer
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-sky-700 text-white text-xs font-medium hover:bg-sky-800 transition-colors',
        pending && 'opacity-70 cursor-wait',
      )}
      title="Génère la convention de formation professionnelle (Articles L.6353-1 et D.6353-1)"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      Convention
    </button>
  );
}

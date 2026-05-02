'use client';

import { useState, useTransition } from 'react';
import { FileText, Loader2, Check, ExternalLink, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateProgrammeForParticipant } from '@/server/actions/programme-generator';

export function GenerateProgrammeButton({
  participantId,
  initialDocumentId,
}: {
  participantId: string;
  initialDocumentId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState<string | null>(initialDocumentId ?? null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      const r = await generateProgrammeForParticipant(participantId);
      if (r.ok && r.documentId) {
        setDocId(r.documentId);
      } else {
        setError(r.error ?? 'Erreur génération');
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
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-100 text-emerald-800 text-xs font-medium hover:bg-emerald-200"
        >
          <Check className="h-3.5 w-3.5" /> Programme prêt <ExternalLink className="h-3 w-3" />
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-600 transition-colors',
          pending && 'opacity-70 cursor-wait',
        )}
        title="Génère un PDF programme conforme au produit, basé sur les données de la session"
      >
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Génération…
          </>
        ) : (
          <>
            <FileText className="h-3.5 w-3.5" /> Générer programme
          </>
        )}
      </button>
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-red-600">
          <AlertCircle className="h-3 w-3" /> {error}
        </span>
      )}
    </div>
  );
}

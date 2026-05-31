'use client';

import { useState, useTransition } from 'react';
import { Receipt, Loader2, Check, ExternalLink, AlertCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateAgeficeForParticipant } from '@/server/actions/agefice-generator';

export function GenerateAgeficeButton({
  participantId,
  initialDocumentId,
}: {
  participantId: string;
  initialDocumentId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState<string | null>(initialDocumentId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleGenerate = () => {
    setError(null);
    setWarnings([]);
    startTransition(async () => {
      const r = await generateAgeficeForParticipant(participantId);
      if (r.warnings) setWarnings(r.warnings);
      if (r.ok && r.documentId) {
        setDocId(r.documentId);
      } else {
        setError(r.error ?? 'Erreur génération AGEFICE');
      }
    });
  };

  if (docId) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <a
            href={`/api/documents/${docId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-100 text-amber-800 text-xs font-medium hover:bg-amber-200"
          >
            <Check className="h-3.5 w-3.5" /> AGEFICE prêt <ExternalLink className="h-3 w-3" />
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
        {warnings.length > 0 && (
          <div className="text-[10px] text-amber-700 space-y-0.5">
            {warnings.map((w, i) => (
              <div key={i} className="inline-flex items-start gap-1">
                <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" /> {w}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-all duration-300 ease-out active:scale-[0.97]',
            pending && 'opacity-70 cursor-wait',
          )}
          title="Génère le récapitulatif AGEFICE pré-rempli (54+ champs depuis Person + Org EI + AgeficeProfile + Session)"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
          Générer AGEFICE
        </button>
        {error && (
          <span className="inline-flex items-center gap-1 text-[11px] text-red-600">
            <AlertCircle className="h-3 w-3" /> {error}
          </span>
        )}
      </div>
    </div>
  );
}

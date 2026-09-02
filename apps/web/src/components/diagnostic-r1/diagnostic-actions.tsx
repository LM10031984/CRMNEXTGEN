'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Maximize2, RotateCcw } from 'lucide-react';
import {
  completeDiagnostic,
  reopenDiagnostic,
  upgradeDiagnosticToComplet,
} from '@/server/actions/diagnostics';

/**
 * Les trois actions de fin de diagnostic.
 *
 * « Passer en audit complet » ne coûte aucune ressaisie : le set léger est un
 * sous-ensemble strict du complet, les réponses restent, les questions
 * manquantes apparaissent. C'est le test de contrat du référentiel qui le
 * garantit, pas une promesse d'écran.
 */
export function DiagnosticActions({
  diagnosticId,
  variant,
  status,
  isComplete,
}: {
  diagnosticId: string;
  variant: 'LEGER' | 'COMPLET';
  status: 'EN_COURS' | 'TERMINE' | 'ARCHIVE';
  isComplete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Action impossible');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
      {variant === 'LEGER' && status !== 'ARCHIVE' && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => upgradeDiagnosticToComplet(diagnosticId),
              'Passé en audit complet — aucune réponse perdue',
            )
          }
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
          Passer en audit complet
        </button>
      )}

      {status === 'EN_COURS' ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => completeDiagnostic(diagnosticId), 'Diagnostic terminé')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Terminer le diagnostic
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => reopenDiagnostic(diagnosticId), 'Diagnostic rouvert')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Rouvrir
        </button>
      )}

      {status === 'EN_COURS' && !isComplete && (
        <span className="text-xs text-muted-foreground">
          Terminer reste possible même avec des données manquantes — elles seront signalées dans le
          rapport.
        </span>
      )}
    </div>
  );
}

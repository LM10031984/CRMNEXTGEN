'use client';

/**
 * Remet en file une soumission dont l'envoi a définitivement échoué.
 *
 * N'apparaît QUE sur les soumissions `FAILED` : on ne « renvoie » pas un
 * programme déjà parti, le prospect le recevrait deux fois.
 */

import { useTransition } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { relancerSoumissionDiagnostic } from '@/server/actions/diagnostic-admin';

export function RelancerDiagnosticButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await relancerSoumissionDiagnostic(submissionId);
      if (!r.ok) {
        toast.error(r.error ?? 'Relance impossible');
        return;
      }
      toast.success('Remis en file — le programme repartira au prochain passage du worker.');
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-white text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Renvoyer le programme
    </button>
  );
}

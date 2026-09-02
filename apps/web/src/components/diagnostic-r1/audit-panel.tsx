'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Download, FileText, HelpCircle, Loader2, RefreshCw } from 'lucide-react';

import { generateDiagnosticAudit } from '@/server/actions/diagnostic-audit';
import type { FingerprintComparison } from '@/lib/diagnostic-r1/fingerprint';

/**
 * Le rapport d'audit sur la fiche diagnostic.
 *
 * Le bandeau de péremption est le cœur du panneau, pas un ornement : un audit
 * généré puis dépassé par une correction de saisie est un document qui ment au
 * client. Tant qu'il est périmé, on le dit avant de proposer de le télécharger.
 */
export function AuditPanel({
  diagnosticId,
  hasDocument,
  freshness,
  documentId,
  answersCount,
}: {
  diagnosticId: string;
  hasDocument: boolean;
  freshness: FingerprintComparison;
  documentId: string | null;
  answersCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const r = await generateDiagnosticAudit(diagnosticId);
      if (r.ok) {
        toast.success('Rapport d’audit généré');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <section className="rounded-lg border border-border overflow-hidden">
      <header className="px-4 py-3 bg-muted/50 border-b border-border flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" aria-hidden />
          Rapport d’audit
        </h2>
        <span className="text-xs text-muted-foreground">17 pages · valorisé 3 000 €</span>
      </header>

      <div className="p-4 space-y-3">
        {hasDocument && freshness === 'stale' && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            <span>
              Le diagnostic a changé depuis la génération de ce rapport : le PDF ne correspond plus
              à ce qui est saisi. Régénérez-le avant de le remettre.
            </span>
          </div>
        )}

        {/* « Pas d'empreinte » n'est pas « périmé » : on dit qu'on ne sait pas,
            plutôt que d'accuser un document qui va peut-être très bien. */}
        {hasDocument && freshness === 'unknown' && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed">
            <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            <span>
              Ce rapport a été produit sans empreinte de contrôle : impossible de vérifier s’il
              correspond encore aux données saisies. Le régénérer lèvera le doute.
            </span>
          </div>
        )}

        {!hasDocument && (
          <p className="text-xs text-muted-foreground">
            Aucun rapport généré pour l’instant. Le rapport restitue les {answersCount} réponses
            chapitre par chapitre, avec les scores, le tunnel et le financement en dernière page.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={pending || answersCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : hasDocument ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {hasDocument ? 'Régénérer le rapport' : 'Générer le rapport d’audit'}
          </button>

          {hasDocument && documentId && (
            <a
              href={`/api/documents/${documentId}`}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm hover:bg-muted ${
                freshness === 'stale'
                  ? 'border-amber-300 text-amber-800 dark:text-amber-300'
                  : 'border-border'
              }`}
            >
              <Download className="h-4 w-4" />
              {freshness === 'stale'
                ? 'Ouvrir la version périmée'
                : freshness === 'unknown'
                  ? 'Ouvrir le PDF (non vérifiable)'
                  : 'Ouvrir le PDF'}
            </a>
          )}
        </div>

        {answersCount === 0 && (
          <p className="text-xs text-muted-foreground">
            Il faut au moins une réponse pour qu’il y ait quelque chose à restituer.
          </p>
        )}
      </div>
    </section>
  );
}

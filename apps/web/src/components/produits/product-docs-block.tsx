import Link from 'next/link';
import { FileText, ChevronRight } from 'lucide-react';
import { resolveDocsForProduct } from '@/lib/resolve-docs-db';

/**
 * Phase 9.3 Plan 03 (surface 2/3) — bloc Documents de la fiche produit.
 *
 * Server Component branché sur le résolveur UNION (lecture seule, scope
 * tenant). Recette : tout doc produit (PROGRAMME, déroulé…) accessible en
 * ≤ 2 clics depuis la fiche. Badge 'no_proof' si contenu stub.
 */
export async function ProductDocsBlock({
  tenantId,
  productId,
}: {
  tenantId: string;
  productId: string;
}) {
  const docs = await resolveDocsForProduct(tenantId, productId);
  if (docs === null) return null;

  return (
    <section className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Documents du produit ({docs.length})
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          PDFs générés au niveau produit (programme, déroulé pédagogique…) — partagés par toutes
          les sessions.
        </p>
      </div>
      {docs.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground italic">
          Aucun document généré pour ce produit. Le programme PDF apparaîtra ici dès sa première
          génération (onglet Programme).
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={`${d.source}:${d.sourceId}`}>
              <Link
                href={d.href as never}
                target={d.href.startsWith('/api/') ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3.5 hover:bg-muted/30 transition-colors"
              >
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1 font-medium text-sm truncate">{d.label}</span>
                {d.usedStub && (
                  <span
                    title="Généré en fallback stub (sans IA) — à régénérer avant l'audit"
                    className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
                  >
                    ⚠ no_proof
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {d.generatedAt ? d.generatedAt.toLocaleDateString('fr-FR') : '—'}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

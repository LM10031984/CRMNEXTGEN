import Link from 'next/link';
import { FileText, ExternalLink } from 'lucide-react';
import { GenerateProductProgrammeButton } from '@/components/produits/generate-product-programme-button';

/**
 * Phase 9.1 Plan 09.1-05 Task 2 — Tab "Programme" de la fiche produit
 * (Server Component).
 *
 * Affiche :
 *  - Lien vers le PDF programme produit `/api/documents/{pdfId}` (si présent)
 *  - Rendu markdown brut `<pre className="whitespace-pre-wrap">` (MVP — pas de
 *    parser markdown, le contenu Qualiopi reste lisible tel quel)
 *
 * Empty state (UI-SPEC §Empty states) : "Programme de formation à créer" +
 * `<GenerateProductProgrammeButton>` (CTA existant — pattern Phase 4).
 */

interface Props {
  markdown?: string | null;
  pdfId?: string | null;
  productId: string;
}

export function ProductProgrammeTab({ markdown, pdfId, productId }: Props) {
  const hasContent = Boolean(markdown && markdown.trim().length > 0) || Boolean(pdfId);

  if (!hasContent) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
        <h3 className="text-base font-semibold mb-1">Programme de formation à créer</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Générez le programme Qualiopi pour ce produit en 1 clic.
        </p>
        <div className="inline-block">
          <GenerateProductProgrammeButton productId={productId} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pdfId && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/50 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-white text-primary">
              <FileText className="h-4 w-4" />
            </span>
            <div className="text-sm">
              <div className="font-semibold">Programme PDF disponible</div>
              <div className="text-xs text-muted-foreground">
                Document Qualiopi partagé pour toutes les sessions de ce produit.
              </div>
            </div>
          </div>
          <Link
            href={`/api/documents/${pdfId}` as any}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-white text-primary px-3 py-2 text-sm font-medium hover:bg-primary/5 transition-colors"
          >
            Voir le PDF
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {markdown && markdown.trim().length > 0 && (
        <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6">
          <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
            Programme détaillé
          </h3>
          <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed max-h-[600px] overflow-auto">
            {markdown}
          </pre>
        </section>
      )}
    </div>
  );
}

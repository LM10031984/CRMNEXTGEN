import Link from 'next/link';
import { FileText, ExternalLink } from 'lucide-react';
import { marked } from 'marked';
import { GenerateProductProgrammeButton } from '@/components/produits/generate-product-programme-button';
import { AiDraftValidationBanner } from '@/components/produits/ai-draft-validation-banner';

/**
 * Phase 9.1 Plan 09.1-05 Task 2 — Tab "Programme" de la fiche produit
 * (Server Component).
 *
 * Affiche :
 *  - Lien vers le PDF programme produit `/api/documents/{pdfId}` (si présent)
 *  - Programme markdown rendu en HTML via `marked` (BUG-P0-03 — avant : `<pre
 *    whitespace-pre-wrap>` affichait `##`, `###`, `-` bruts ce qui rend les
 *    programmes IA illisibles)
 *
 * Empty state (UI-SPEC §Empty states) : "Programme de formation à créer" +
 * `<GenerateProductProgrammeButton>` (CTA existant — pattern Phase 4).
 */

interface Props {
  markdown?: string | null;
  pdfId?: string | null;
  productId: string;
  /** BUG-P0-02 — date de génération IA si le produit est un brouillon non revu */
  aiDraftedAt?: Date | null;
  /** Le rôle courant peut-il valider le brouillon IA (ADMIN/MANAGER) */
  canValidateAiDraft?: boolean;
}

/**
 * Configure marked pour un rendu Qualiopi propre. `gfm: true` active les
 * listes, tables, etc. `breaks: false` pour ne pas créer un `<br>` à chaque
 * saut de ligne (les programmes utilisent des paragraphes explicites).
 */
marked.setOptions({ gfm: true, breaks: false });

export function ProductProgrammeTab({
  markdown,
  pdfId,
  productId,
  aiDraftedAt,
  canValidateAiDraft = false,
}: Props) {
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
      {aiDraftedAt && (
        <AiDraftValidationBanner
          productId={productId}
          aiDraftedAt={aiDraftedAt}
          canValidate={canValidateAiDraft}
        />
      )}
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
        <section className="rounded-2xl border border-border bg-white p-6">
          <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
            Programme détaillé
          </h3>
          <div
            className="text-sm text-foreground leading-relaxed max-h-[600px] overflow-auto
              [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2
              [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2
              [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-muted-foreground [&_h3]:mt-3 [&_h3]:mb-1
              [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1
              [&_p]:my-2
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1
              [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1
              [&_li]:leading-snug
              [&_strong]:font-semibold [&_em]:italic
              [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
              [&_table]:my-3 [&_table]:border-collapse [&_table]:w-full
              [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:text-left
              [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1
              [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: marked.parse(markdown, { async: false }) as string }}
          />
        </section>
      )}
    </div>
  );
}

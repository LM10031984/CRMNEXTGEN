import { getDocsForProduct } from '@/lib/docs/get-docs-for';
import { UnifiedDocsList } from '@/components/docs/unified-docs-list';

/**
 * Phase 9.3 Plan 09.3-03 Task 3 — Tab « Documents » de la fiche produit
 * (NAV-02(b)(c), Server Component).
 *
 * Agrège via `getDocsForProduct` (resolveDocs sur les 6 sources) :
 *  - docs product-level (PROGRAMME, déroulé…) ;
 *  - docs des sessions/apprenants du produit (NAV-02b) ;
 *  - liens docs tenant (CGV/RI) croisés (NAV-02c).
 *
 * D-09.3-06 — ≤2 clics : chaque doc porte sa cross-nav via `<UnifiedDocsList>`.
 * Scope tenantId garanti par le wrapper (variable réelle `user.tenantId`
 * passée par la page produit).
 */

interface Props {
  productId: string;
  tenantId: string;
}

export async function ProductDocsTab({ productId, tenantId }: Props) {
  const docs = await getDocsForProduct(productId, tenantId);

  return (
    <section className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Documents du produit ({docs.length})
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Programme et déroulé du produit, preuves des sessions et apprenants formés,
          plus les documents organisme (CGV/RI). Un document en mode stub est signalé
          « non conforme ».
        </p>
      </div>
      <UnifiedDocsList docs={docs} />
    </section>
  );
}

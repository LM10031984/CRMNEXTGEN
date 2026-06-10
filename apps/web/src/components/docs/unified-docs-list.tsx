import Link from 'next/link';
import { ExternalLink, ArrowUpRight } from 'lucide-react';
import { DocStatusBadge } from '@/components/sessions/qualiopi-matrix/doc-status-badge';
import { DOC_TYPE_LABELS } from '@/lib/doc-scope';
import type { UnifiedDoc, DocAnchor } from '@/lib/docs/resolve-docs';

/**
 * Phase 9.3 Plan 09.3-03 Task 1 — `<UnifiedDocsList>` (NAV-02 + NAV-03).
 *
 * Rendu réutilisable d'une liste `UnifiedDoc[]` (sortie de `resolveDocs`)
 * branchée sur les fiches apprenant + produit (D-09.3-05). Server Component,
 * lecture seule, aucun effet de bord.
 *
 * NAV-03 — `usedStub` visible (blocker T4 ind. 11) : un doc en mode stub ne
 * passe JAMAIS pour conforme. Mapping `UnifiedDoc.status` → DocStatusBadge
 * (contrat RÉEL vérifié 2026-06-10 : `state ∈ DocStatusState`,
 * `warning?: 'no_proof'` LITTÉRAL, AUCUNE prop `title`) :
 *  - present → <DocStatusBadge state="GENERATED" /> (emerald)
 *  - stub    → <DocStatusBadge state="MANUAL_OK" warning="no_proof" /> (amber
 *              AlertTriangle) + <span> « non conforme » adjacent (le texte
 *              d'avertissement passe par ce span, JAMAIS par `title`).
 *  - missing → <DocStatusBadge state="MISSING" /> (red)
 *
 * D-09.3-06 — ≤2 clics : chaque doc porte un lien de téléchargement (si href)
 * + une cross-nav vers son ancre (participant/session → /app/sessions/{id} ;
 * product → /app/produits/{id} ; tenant → /app/parametres).
 */

interface UnifiedDocsListProps {
  docs: UnifiedDoc[];
}

/** Libellé FR court réutilisé du catalog (fallback = docType brut). */
function docLabel(docType: string): string {
  return DOC_TYPE_LABELS[docType]?.long ?? DOC_TYPE_LABELS[docType]?.short ?? docType;
}

/** Cross-nav par ancre (pattern Link Phase 9.1 matrix-row). */
function anchorHref(anchor: DocAnchor): string | null {
  switch (anchor.level) {
    case 'participant':
      return anchor.sessionId ? `/app/sessions/${anchor.sessionId}` : null;
    case 'session':
      return anchor.sessionId ? `/app/sessions/${anchor.sessionId}` : null;
    case 'product':
      return `/app/produits/${anchor.productId}`;
    case 'tenant':
      return '/app/parametres';
    default:
      return null;
  }
}

function anchorLabel(anchor: DocAnchor): string {
  switch (anchor.level) {
    case 'participant':
      return 'Voir la session';
    case 'session':
      return 'Voir la session';
    case 'product':
      return 'Voir le produit';
    case 'tenant':
      return 'Paramètres organisme';
    default:
      return 'Voir';
  }
}

export function UnifiedDocsList({ docs }: UnifiedDocsListProps) {
  if (docs.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground italic">
        Aucun document. Les preuves Qualiopi (session, produit, participant, organisme)
        apparaîtront ici dès qu'elles seront produites.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {docs.map((doc) => {
        const label = docLabel(doc.docType);
        const href = anchorHref(doc.anchor);
        const navLabel = anchorLabel(doc.anchor);
        const key = `${doc.sourceTable}-${doc.sourceId}-${doc.docType}`;

        return (
          <li key={key} className="flex items-center gap-3 p-3 flex-wrap">
            {/* NAV-03 — badge d'état (mapping contrat réel DocStatusBadge). */}
            {doc.status === 'present' && (
              <DocStatusBadge state="GENERATED" label={label} />
            )}
            {doc.status === 'stub' && (
              <DocStatusBadge state="MANUAL_OK" warning="no_proof" label={label} />
            )}
            {doc.status === 'missing' && <DocStatusBadge state="MISSING" label={label} />}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{label}</span>
                {doc.qualiopiIndicator && (
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {doc.qualiopiIndicator}
                  </span>
                )}
              </div>
              {/* NAV-03 — un stub ne passe JAMAIS pour conforme : texte explicite
                  via <span>, jamais via prop `title` (inexistante). */}
              {doc.status === 'stub' && (
                <span className="block text-amber-700 text-xs mt-0.5">
                  Mode stub — NON conforme, à régénérer
                </span>
              )}
              {doc.status === 'missing' && (
                <span className="block text-red-700 text-xs mt-0.5">
                  Preuve à produire
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {doc.href && (
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Télécharger
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
              {href && (
                <Link
                  href={href as never}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {navLabel}
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

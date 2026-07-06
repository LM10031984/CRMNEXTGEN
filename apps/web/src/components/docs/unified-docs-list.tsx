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
 * 09.3-03-fix CORRECTION 1 — SOURCE UNIQUE : libellé (catalogue `DOC_TYPE_LABELS`)
 * et indicateur (`doc.qualiopiIndicator`, déjà résolu depuis le catalogue) sont
 * affichés SÉPARÉMENT, jamais collés. L'indicateur passe par un chip distinct
 * précédé d'un séparateur « · » visible. Si null → aucun chip.
 *
 * 09.3-03-fix CORRECTION 2 — DÉDUP : par défaut on n'affiche QUE les docs
 * `isCurrent:true`. Quand une lignée a des versions antérieures, un badge discret
 * « v{N} » dépliable (<details>) révèle l'historique non-courant.
 *
 * NAV-03 — `usedStub` visible (blocker T4 ind. 11) : un doc en mode stub ne passe
 * JAMAIS pour conforme. Mapping `UnifiedDoc.status` → DocStatusBadge (contrat RÉEL :
 * `state ∈ DocStatusState`, `warning?: 'no_proof'` LITTÉRAL, AUCUNE prop `title`) :
 *  - present → <DocStatusBadge state="GENERATED" /> (emerald)
 *  - stub    → <DocStatusBadge state="MANUAL_OK" warning="no_proof" /> + texte « non conforme »
 *  - missing → <DocStatusBadge state="MISSING" /> (red)
 *
 * D-09.3-06 — ≤2 clics : chaque doc porte un lien de téléchargement (si href)
 * + une cross-nav vers son ancre (participant/session → /app/sessions/{id} ;
 * product → /app/produits/{id} ; tenant → /app/parametres).
 */

interface UnifiedDocsListProps {
  docs: UnifiedDoc[];
}

/** Libellé FR humain réutilisé du catalog (fallback = docType brut). */
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

/** Clé de lignée (docType × ancrage logique) — sert à grouper les versions. */
function lineageKey(doc: UnifiedDoc): string {
  const a = doc.anchor;
  const anchorPart =
    a.level === 'participant'
      ? `participant:${a.sessionId}:${a.participantId}`
      : a.level === 'session'
        ? `session:${a.sessionId}`
        : a.level === 'product'
          ? `product:${a.productId}`
          : `tenant:${a.tenantId}`;
  return `${doc.docType}@@${anchorPart}`;
}

/** Une ligne de doc (présentation partagée entre courant et historique). */
function DocRow({ doc, dimmed }: { doc: UnifiedDoc; dimmed?: boolean }) {
  const label = docLabel(doc.docType);
  const href = anchorHref(doc.anchor);
  const navLabel = anchorLabel(doc.anchor);

  return (
    <div className={`flex items-center gap-3 p-3 flex-wrap ${dimmed ? 'opacity-70' : ''}`}>
      {/* NAV-03 — badge d'état (mapping contrat réel DocStatusBadge). */}
      {doc.status === 'present' && <DocStatusBadge state="GENERATED" label={label} />}
      {doc.status === 'stub' && (
        <DocStatusBadge state="MANUAL_OK" warning="no_proof" label={label} />
      )}
      {doc.status === 'missing' && <DocStatusBadge state="MISSING" label={label} />}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{label}</span>
          {/* CORRECTION 1 — indicateur SÉPARÉ du libellé, séparateur « · » visible.
              Si null → aucun chip (jamais de numéro collé au libellé). */}
          {doc.qualiopiIndicator && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {doc.qualiopiIndicator}
              </span>
            </span>
          )}
        </div>
        {doc.status === 'stub' && (
          <span className="block text-amber-700 text-xs mt-0.5">
            Mode stub — NON conforme, à régénérer
          </span>
        )}
        {doc.status === 'missing' && (
          <span className="block text-red-700 text-xs mt-0.5">Preuve à produire</span>
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
    </div>
  );
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

  // CORRECTION 2 — n'afficher que les versions COURANTES ; indexer l'historique
  // par lignée pour le badge « v{N} » dépliable.
  const currents = docs.filter((d) => d.isCurrent);
  const historyByLineage = new Map<string, UnifiedDoc[]>();
  for (const d of docs) {
    if (d.isCurrent) continue;
    const key = lineageKey(d);
    const arr = historyByLineage.get(key);
    if (arr) arr.push(d);
    else historyByLineage.set(key, [d]);
  }

  return (
    <ul className="divide-y divide-border">
      {currents.map((doc) => {
        const key = `${doc.sourceTable}-${doc.sourceId}-${doc.docType}`;
        const history = historyByLineage.get(lineageKey(doc)) ?? [];
        const olderSorted = [...history].sort(
          (a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0),
        );

        return (
          <li key={key}>
            <div className="flex items-center">
              <div className="flex-1 min-w-0">
                <DocRow doc={doc} />
              </div>
              {/* CORRECTION 2 — badge « v{N} » : compteur de versions de la lignée.
                  N = doc.version (le courant porte le rang max). Cliquable seulement
                  s'il existe un historique. */}
              {doc.version > 1 && (
                <span className="shrink-0 pr-3 text-[10px] font-mono text-muted-foreground">
                  v{doc.version}
                </span>
              )}
            </div>

            {olderSorted.length > 0 && (
              <details className="px-3 pb-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none inline-flex items-center gap-1">
                  <span className="underline decoration-dotted">
                    {olderSorted.length} version{olderSorted.length > 1 ? 's' : ''} antérieure
                    {olderSorted.length > 1 ? 's' : ''}
                  </span>
                </summary>
                <div className="mt-1 ml-2 border-l border-border pl-2 divide-y divide-border/60">
                  {olderSorted.map((old) => (
                    <DocRow
                      key={`${old.sourceTable}-${old.sourceId}-${old.docType}`}
                      doc={old}
                      dimmed
                    />
                  ))}
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

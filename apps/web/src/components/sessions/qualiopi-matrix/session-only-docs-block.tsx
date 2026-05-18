/**
 * Phase 9.1 Plan 03 Task 1 — SessionOnlyDocsBlock (Server Component).
 *
 * 3 cards horizontales (UI-SPEC §Surface 1 — "Documents session" bloc) :
 *   Déroulé pédagogique · Grille d'observation formateur · Checklist formation
 *
 * Chaque card affiche :
 *  - titre + pastille état (DocStatusBadge atom Plan 02)
 *  - si PDF présent → "Voir le PDF" (target=_blank, D-14 1-clic) + bouton "Re-générer"
 *  - si manquant → "Pas encore généré" + bouton "Générer le {label}"
 *
 * `canWrite=false` (FORMATEUR/COMMERCIAL/COMPTABLE) → masque les CTAs Générer/Re-générer.
 *
 * Server Component pur — pas de useState, juste un Link vers la page closure pour
 * relancer une génération côté server action.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Sparkles, RefreshCw, FileText } from 'lucide-react';
import { DocStatusBadge } from './doc-status-badge';

interface PdfRef {
  id: string;
}

export interface SessionOnlyDocsBlockProps {
  sessionId: string;
  deroulePdfRef?: PdfRef;
  grilleObsPdfRef?: PdfRef;
  checklistPdfRef?: PdfRef;
  canWrite: boolean;
}

const CARDS: Array<{
  key: 'DEROULE' | 'GRILLE_OBS' | 'CHECKLIST';
  title: string;
  shortLabel: string;
}> = [
  { key: 'DEROULE', title: 'Déroulé pédagogique', shortLabel: 'Déroulé' },
  { key: 'GRILLE_OBS', title: "Grille d'observation formateur", shortLabel: 'Grille observation' },
  { key: 'CHECKLIST', title: 'Checklist formation', shortLabel: 'Checklist' },
];

export function SessionOnlyDocsBlock({
  sessionId,
  deroulePdfRef,
  grilleObsPdfRef,
  checklistPdfRef,
  canWrite,
}: SessionOnlyDocsBlockProps) {
  const pdfRefByKey: Record<'DEROULE' | 'GRILLE_OBS' | 'CHECKLIST', PdfRef | undefined> = {
    DEROULE: deroulePdfRef,
    GRILLE_OBS: grilleObsPdfRef,
    CHECKLIST: checklistPdfRef,
  };

  return (
    <section
      aria-labelledby="session-only-docs-heading"
      className="rounded-2xl border border-border bg-white p-5"
    >
      <h2
        id="session-only-docs-heading"
        className="font-semibold inline-flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground mb-4"
      >
        <FileText className="h-4 w-4" aria-hidden="true" /> Documents session
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CARDS.map((card) => {
          const pdf = pdfRefByKey[card.key];
          const hasPdf = !!pdf;
          return (
            <article
              key={card.key}
              className="rounded-xl border border-border bg-white p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold leading-tight">{card.title}</h3>
                <DocStatusBadge
                  state={hasPdf ? 'GENERATED' : 'MISSING'}
                  label={card.title}
                />
              </div>
              {hasPdf ? (
                <div className="flex items-center gap-2 flex-wrap mt-auto">
                  <a
                    href={`/api/documents/${pdf!.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" /> Voir le PDF
                  </a>
                  {canWrite && (
                    <Link
                      href={`/app/sessions/${sessionId}/closure` as Route}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Re-générer
                    </Link>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 mt-auto">
                  <p className="text-xs text-muted-foreground italic">Pas encore généré</p>
                  {canWrite && (
                    <Link
                      href={`/app/sessions/${sessionId}/closure` as Route}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" /> Générer le {card.shortLabel}
                    </Link>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

'use client';

/**
 * SessionOnlyDocsBlock — sidebar "Documents session" (3 cards).
 *
 * Quick task 260525-jpq — bugs I + J :
 *  - I : la pastille "Grille observation" lisait uniquement Document.GRILLE_OBS_SESSION
 *        alors que la matrice lit aussi PedagogicalAsset.kind='GRILLE_OBS' par
 *        participant (cf. derive-cell-state.ts L70-71). On aligne via
 *        `grilleObsAssetCount` passé en prop.
 *  - J : les CTAs ouvraient la page batch globale (Pack fin de formation).
 *        On les bascule en server actions inline (useTransition + sonner
 *        toast + router.refresh).
 *
 * WHY le flag "post-formation" supprimé : Laurent veut pouvoir générer la
 * grille obs avant la formation aussi — le générateur a un fallback stub
 * si pas de présences confirmées.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles, RefreshCw, FileText } from 'lucide-react';
import { DocStatusBadge } from './doc-status-badge';
import { generateGrilleObsSessionForSession } from '@/server/actions/generate-grille-obs-session';
import { generateDerouleForProduct } from '@/server/actions/deroule-product-generator';
import { generateChecklistForSession } from '@/server/actions/generate-checklist-formation';
import { generateSatisfactionSessionForSession } from '@/server/actions/generate-satisfaction-session';

interface PdfRef {
  id: string;
}

type CardKey = 'DEROULE' | 'GRILLE_OBS' | 'CHECKLIST' | 'SATISFACTION_SESSION';

export interface SessionOnlyDocsBlockProps {
  sessionId: string;
  productId: string | null;
  deroulePdfRef?: PdfRef;
  grilleObsPdfRef?: PdfRef;
  checklistPdfRef?: PdfRef;
  /** A5 — Bilan satisfaction session (ind. 30). */
  satisfactionPdfRef?: PdfRef;
  grilleObsAssetCount: number;
  canWrite: boolean;
}

const CARDS: Array<{
  key: CardKey;
  title: string;
  shortLabel: string;
  article: 'le' | 'la';
}> = [
  { key: 'DEROULE', title: 'Déroulé pédagogique', shortLabel: 'Déroulé', article: 'le' },
  { key: 'GRILLE_OBS', title: "Grille d'observation formateur", shortLabel: 'Grille observation', article: 'la' },
  { key: 'CHECKLIST', title: 'Checklist formation', shortLabel: 'Checklist', article: 'la' },
  // A5 — 4ᵉ carte. L'action `generateSatisfactionSessionForSession` existait
  // mais la carte manquait : un OF ne pouvait régénérer le bilan
  // satisfaction session qu'en relançant le pack complet (trou conformité
  // ind. 30 identifié par le plan A5).
  { key: 'SATISFACTION_SESSION', title: 'Bilan satisfaction session', shortLabel: 'Bilan satisfaction', article: 'le' },
];

export function SessionOnlyDocsBlock({
  sessionId,
  productId,
  deroulePdfRef,
  grilleObsPdfRef,
  checklistPdfRef,
  satisfactionPdfRef,
  grilleObsAssetCount,
  canWrite,
}: SessionOnlyDocsBlockProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const pdfRefByKey: Record<CardKey, PdfRef | undefined> = {
    DEROULE: deroulePdfRef,
    GRILLE_OBS: grilleObsPdfRef,
    CHECKLIST: checklistPdfRef,
    SATISFACTION_SESSION: satisfactionPdfRef,
  };

  const hasPdfByKey: Record<CardKey, boolean> = {
    DEROULE: !!deroulePdfRef,
    GRILLE_OBS: !!grilleObsPdfRef || grilleObsAssetCount > 0,
    CHECKLIST: !!checklistPdfRef,
    SATISFACTION_SESSION: !!satisfactionPdfRef,
  };

  function runGenerate(
    label: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    startTransition(async () => {
      try {
        const res = await action();
        if (res.ok) {
          toast.success(`${label} généré`);
          router.refresh();
        } else {
          toast.error(res.error ?? `Erreur génération ${label}`);
        }
      } catch (e: any) {
        toast.error(e?.message ?? `Erreur génération ${label}`);
      }
    });
  }

  function handleGenerate(
    key: CardKey,
    label: string,
    opts: { force?: boolean } = {},
  ) {
    if (key === 'DEROULE') {
      if (!productId) {
        toast.error('Produit lié manquant');
        return;
      }
      runGenerate(label, () => generateDerouleForProduct(productId, opts));
    } else if (key === 'GRILLE_OBS') {
      runGenerate(label, () => generateGrilleObsSessionForSession(sessionId, opts));
    } else if (key === 'CHECKLIST') {
      runGenerate(label, () => generateChecklistForSession(sessionId, opts));
    } else {
      // SATISFACTION_SESSION — l'action wrappe satisfactionSessionGenerator
      // sans support de `force` (re-génère systématiquement, le résultat
      // est déterministe à partir des SessionParticipant satisfactions).
      // Le bouton "Re-générer" reste fonctionnel : `opts.force` est ignoré
      // sans erreur.
      void opts;
      runGenerate(label, () => generateSatisfactionSessionForSession(sessionId));
    }
  }

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map((card) => {
          const pdf = pdfRefByKey[card.key];
          const hasPdf = hasPdfByKey[card.key];
          const deroulleDisabled = card.key === 'DEROULE' && !productId;
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
                  {pdf ? (
                    <a
                      href={`/api/documents/${pdf.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" /> Voir le PDF
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Généré par participant (voir matrice)
                    </p>
                  )}
                  {canWrite && (
                    <button
                      type="button"
                      disabled={isPending || deroulleDisabled}
                      onClick={() => handleGenerate(card.key, card.shortLabel, { force: true })}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-wait"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      {isPending ? 'Génération…' : 'Re-générer'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 mt-auto">
                  <p className="text-xs text-muted-foreground italic">Pas encore généré</p>
                  {canWrite && (
                    <button
                      type="button"
                      disabled={isPending || deroulleDisabled}
                      onClick={() => handleGenerate(card.key, card.shortLabel)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-wait"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      {isPending ? 'Génération…' : `Générer ${card.article} ${card.shortLabel}`}
                    </button>
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

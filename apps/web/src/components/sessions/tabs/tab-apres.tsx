'use client';

/**
 * Phase 15 Lot 2 (15-02) — Onglet « Après la formation » (le pack).
 *
 * Réembarque DANS l'onglet (plus de bandeau page-wide) :
 *   - le CTA « Générer le pack » + le bloc pack `<ClosureFormationBlock>`
 *     (pré-rendus côté serveur, passés en slots `packCta` / `closureBlock` /
 *     `pendantBlock` — pattern RSC : nœuds React en props, pas de fonction
 *     importée d'un module client).
 *   - le suivi du batch en cours via `<BatchProgressAutoRefresh>`.
 *   - les 4 docs « niveau session » (Déroulé · Grille obs session · Checklist ·
 *     Bilan satisfaction session) repris de `SessionOnlyDocsBlock` (supprimé),
 *     une LIGNE par doc, chacune câblée sur SA server action.
 *
 * Source unique (LOCKED) : le compteur « manquants » dérive de
 * `apresMissingCount` → `docCompletion(closureItems)` (même source que la
 * matrice). AUCUN recompte local.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, FileText, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { BatchProgressAutoRefresh } from '../batch-progress-auto-refresh';
import { docCompletion, type CompletionItem, type DocState } from '@/lib/sessions/doc-completion';
import { apresMissingCount } from './tab-apres-helpers';
import { generateDerouleForProduct } from '@/server/actions/deroule-product-generator';
import { generateGrilleObsSessionForSession } from '@/server/actions/generate-grille-obs-session';
import { generateChecklistForSession } from '@/server/actions/generate-checklist-formation';
import { generateSatisfactionSessionForSession } from '@/server/actions/generate-satisfaction-session';

type SessionDocKey = 'deroule' | 'grilleObs' | 'checklist' | 'satisfactionSession';

interface SessionDocRef {
  state: DocState;
  /** URL d'ouverture du PDF si généré. */
  pdfUrl?: string;
}

interface Props {
  sessionId: string;
  productId: string | null;
  canWrite: boolean;
  /**
   * État des 4 docs niveau session (source : getSessionClosureStatus +
   * proxy grilleObsAssetCount, dérivé côté page).
   */
  sessionDocs: Record<SessionDocKey, SessionDocRef>;
  /**
   * Items « closure » comptés par `docCompletion` — MÊME source que la matrice.
   * Le compteur « manquants » de l'onglet en dérive (jamais recompté).
   */
  closureItems: CompletionItem[];
  /** Suivi du dernier batch closure (rendu DANS l'onglet). */
  batch?: {
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
    totalDocs: number;
    doneDocs: number;
    errorDocs: number;
  } | null;
  /** Slots pré-rendus côté serveur (nœuds React, pas de fonction client). */
  packCta?: React.ReactNode;
  pendantBlock?: React.ReactNode;
  closureBlock?: React.ReactNode;
}

const SESSION_CARDS: Array<{
  key: SessionDocKey;
  title: string;
  shortLabel: string;
}> = [
  { key: 'deroule', title: 'Déroulé pédagogique', shortLabel: 'Déroulé' },
  { key: 'grilleObs', title: "Grille d'observation session", shortLabel: 'Grille observation' },
  { key: 'checklist', title: 'Checklist formation', shortLabel: 'Checklist' },
  { key: 'satisfactionSession', title: 'Bilan satisfaction session', shortLabel: 'Bilan satisfaction' },
];

export function TabApres({
  sessionId,
  productId,
  canWrite,
  sessionDocs,
  closureItems,
  batch,
  packCta,
  pendantBlock,
  closureBlock,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Source unique : compteur dérivé de docCompletion (via apresMissingCount).
  const completion = docCompletion(closureItems);
  const missing = apresMissingCount(closureItems);

  function runGenerate(label: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      try {
        const res = await action();
        if (res.ok) {
          toast.success(`${label} généré`);
          router.refresh();
        } else {
          toast.error(res.error ?? `Erreur génération ${label}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Erreur génération ${label}`);
      }
    });
  }

  function handleGenerate(key: SessionDocKey, label: string, force = false) {
    if (key === 'deroule') {
      if (!productId) {
        toast.error('Produit lié manquant');
        return;
      }
      runGenerate(label, () => generateDerouleForProduct(productId, { force }));
    } else if (key === 'grilleObs') {
      runGenerate(label, () => generateGrilleObsSessionForSession(sessionId, { force }));
    } else if (key === 'checklist') {
      runGenerate(label, () => generateChecklistForSession(sessionId, { force }));
    } else {
      // satisfactionSession — pas de `force` (re-génère systématiquement,
      // déterministe à partir des satisfactions SessionParticipant).
      runGenerate(label, () => generateSatisfactionSessionForSession(sessionId));
    }
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Suivi du batch en cours — DANS l'onglet (plus de bandeau page-wide). */}
      {batch && (
        <BatchProgressAutoRefresh
          status={batch.status}
          totalDocs={batch.totalDocs}
          doneDocs={batch.doneDocs}
          errorDocs={batch.errorDocs}
        />
      )}

      {/* CTA « Générer le pack » (slot serveur). */}
      {packCta && (
        <section className="rounded-2xl border border-border bg-white p-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-base">Pack fin de formation</h2>
            <p className="text-sm text-muted-foreground">
              {completion.ready}/{completion.total} prêts
              {missing > 0 && <> · {missing} manquant{missing > 1 ? 's' : ''}</>}
            </p>
          </div>
          {packCta}
        </section>
      )}

      {/* « Pendant » fondu dans Après (slot serveur). */}
      {pendantBlock}

      {/* Bloc pack détaillé (slot serveur). */}
      {closureBlock}

      {/* 4 docs niveau session — une ligne par doc, câblée sur SA server action. */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 inline-flex items-center gap-2">
          <FileText className="h-4 w-4" aria-hidden="true" /> Documents niveau session
        </h3>
        <ul className="divide-y divide-border">
          {SESSION_CARDS.map((card) => {
            const ref = sessionDocs[card.key];
            const has = ref.state === 'generated';
            const disabled = pending || (card.key === 'deroule' && !productId);
            return (
              <li key={card.key} className="flex items-center gap-3 py-2.5">
                {has ? (
                  <span className="h-4 w-4 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span
                    className="h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-50 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{card.title}</span>

                {has && ref.pdfUrl && (
                  <a
                    href={ref.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-medium text-primary hover:bg-primary-50 transition-colors shrink-0"
                  >
                    Ouvrir <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                {canWrite && (
                  <button
                    type="button"
                    onClick={() => handleGenerate(card.key, card.shortLabel, has)}
                    disabled={disabled}
                    // Nom accessible = titre du doc → ciblé par les tests
                    // (/déroulé/i, /grille/i, /checklist/i, /bilan satisfaction/i).
                    aria-label={`${has ? 'Régénérer' : 'Générer'} ${card.title}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-semibold shrink-0 transition-colors disabled:opacity-60 disabled:cursor-wait shadow-sm bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : has ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {has ? 'Régénérer' : 'Générer'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

'use client';

/**
 * 🪄 DocDock — bouton floating magique bas-droite de la fiche session.
 *
 * Objectif : 1 endroit unique pour TROUVER + GÉNÉRER + TÉLÉCHARGER n'importe
 * quel document Qualiopi pré-formation, sans avoir à scroller toute la fiche.
 *
 * Bug remonté Laurent 2026-06-04 : "il manque le doc AGEFICE SES-0094, je ne
 * vois pas comment la générer · trouver les docs c'est compliqué · fais un
 * truc de dingue".
 *
 * UX :
 *   - Bouton circulaire gradient violet/primary en bas-droite (z-40)
 *   - Badge rouge avec compteur de docs manquants (animation pulse si > 0)
 *   - Au clic : popover 420px qui ouvre vers le haut-gauche
 *       · Compteur "X/Y docs prêts"
 *       · Search live (filtre instant sur label + nom apprenant)
 *       · Bouton "⚡ Tout générer (X manquants)" si applicable
 *       · Liste compacte : icône état · label · action
 *         · ✓ généré → bouton "Ouvrir" (target=_blank)
 *         · ◯ manquant → bouton "Générer" (server action + toast)
 *         · ⏳ en cours → loader
 *
 * Raccourci clavier `g` (quand pas dans input) → ouvre/ferme.
 */

import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  X,
  Search,
  Check,
  Loader2,
  ExternalLink,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  dispatchGenerateDoc,
  dispatchGenerateMissing,
} from '@/server/actions/dispatch-generate-doc';
import type { DispatchableDocType } from '@/lib/sessions/dispatch-doc-types';

export interface DocDockItem {
  /** Clé unique stable (ex: 'programme' ou 'convention-{participantId}') */
  key: string;
  docType: DispatchableDocType;
  label: string;
  /** Pour les docs par stagiaire — affiché sous le label */
  participantName?: string;
  participantId?: string;
  /** Indicateur Qualiopi à afficher en chip discret */
  indic?: string;
  state: 'generated' | 'missing' | 'pending';
  /** URL complète pour ouvrir le PDF (target=_blank). Présent si state='generated'. */
  pdfUrl?: string;
  /** Section UX (Partagés / Par stagiaire / IA) */
  section: 'shared' | 'participant' | 'ai';
}

interface Props {
  sessionId: string;
  items: DocDockItem[];
  canGenerate: boolean;
}

export function DocDock({ sessionId, items, canGenerate }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Raccourci clavier 'g' pour ouvrir
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
      if (tgt?.isContentEditable) return;
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-focus search à l'ouverture
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const missingCount = items.filter((it) => it.state === 'missing').length;
  const pendingCount = items.filter((it) => it.state === 'pending').length;
  const generatedCount = items.filter((it) => it.state === 'generated').length;
  const total = items.length;

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.participantName?.toLowerCase().includes(q) ||
        it.docType.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Group par section pour affichage
  const grouped = useMemo(() => {
    const groups: Record<'shared' | 'participant' | 'ai', DocDockItem[]> = {
      shared: [],
      participant: [],
      ai: [],
    };
    for (const it of filtered) groups[it.section].push(it);
    return groups;
  }, [filtered]);

  function handleGenerate(item: DocDockItem, force = false) {
    setGeneratingKeys((prev) => new Set(prev).add(item.key));
    startTransition(async () => {
      try {
        const r = await dispatchGenerateDoc({
          sessionId,
          docType: item.docType,
          participantId: item.participantId,
          force,
        });
        if (r.ok) {
          if (r.enqueued) {
            toast.success(`${item.label} — génération IA lancée en arrière-plan`);
          } else {
            toast.success(force ? `${item.label} régénéré` : `${item.label} généré`);
          }
          router.refresh();
        } else {
          toast.error(r.error ?? `Erreur ${item.label}`);
        }
      } finally {
        setGeneratingKeys((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        });
      }
    });
  }

  function handleGenerateAll() {
    const toGenerate = items.filter((it) => it.state === 'missing');
    if (toGenerate.length === 0) return;
    const keys = new Set(toGenerate.map((it) => it.key));
    setGeneratingKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    startTransition(async () => {
      try {
        const r = await dispatchGenerateMissing({
          sessionId,
          items: toGenerate.map((it) => ({
            docType: it.docType,
            participantId: it.participantId,
          })),
        });
        if (r.ok) {
          toast.success(`⚡ ${r.success} document${r.success > 1 ? 's' : ''} généré${r.success > 1 ? 's' : ''}`);
        } else {
          toast.warning(
            `${r.success}/${r.total} généré${r.success > 1 ? 's' : ''} · ${r.failed} échec${r.failed > 1 ? 's' : ''}`,
          );
        }
        router.refresh();
      } finally {
        setGeneratingKeys(new Set());
      }
    });
  }

  return (
    <>
      {/* Bouton floating bas-droite — visible toujours sur la fiche session */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Documents Qualiopi (raccourci : g)"
        aria-label="Ouvrir le panneau Documents"
        className={cn(
          'fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full text-white shadow-lg hover:shadow-2xl transition-all inline-flex items-center justify-center group',
          'bg-gradient-to-br from-violet-500 via-primary to-violet-600',
          'hover:scale-110 active:scale-95',
          open && 'scale-110 ring-4 ring-primary/20',
        )}
      >
        <Sparkles
          className={cn('h-6 w-6 transition-transform', open ? 'rotate-180' : 'group-hover:rotate-12')}
        />
        {missingCount > 0 && !open && (
          <span className="absolute -top-1.5 -right-1.5 min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold inline-flex items-center justify-center border-2 border-white shadow-md">
            <span className="relative inline-flex">
              <span className="absolute inset-0 -m-2 inline-flex rounded-full bg-red-400 opacity-50 animate-ping"></span>
              <span className="relative tabular-nums">{missingCount}</span>
            </span>
          </span>
        )}
        {pendingCount > 0 && !open && (
          <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-sky-500 inline-flex items-center justify-center border-2 border-white shadow-md">
            <Loader2 className="h-3 w-3 text-white animate-spin" />
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] cursor-default"
          />
          {/* Panel */}
          <div
            role="dialog"
            aria-label="Documents Qualiopi"
            className="fixed bottom-24 right-6 z-50 w-[440px] max-w-[calc(100vw-3rem)] max-h-[75vh] rounded-2xl border border-border bg-white shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200"
          >
            {/* Header */}
            <div className="p-4 border-b border-border bg-gradient-to-r from-violet-50 via-white to-primary-50/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-base inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Documents Qualiopi
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                  <Check className="h-3 w-3" /> {generatedCount}/{total} prêts
                </span>
                {pendingCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 font-medium">
                    <Loader2 className="h-3 w-3 animate-spin" /> {pendingCount} en cours
                  </span>
                )}
                {missingCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-medium">
                    {missingCount} manquant{missingCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cherche un doc ou un apprenant…"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* CTA Tout générer */}
            {canGenerate && missingCount > 0 && (
              <div className="px-3 pt-3">
                <button
                  type="button"
                  onClick={handleGenerateAll}
                  disabled={pending}
                  className="w-full h-10 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:from-amber-600 hover:to-orange-600 disabled:opacity-60 disabled:cursor-wait transition-all shadow-sm hover:shadow-md inline-flex items-center justify-center gap-2"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Tout générer ({missingCount} manquant{missingCount > 1 ? 's' : ''})
                </button>
              </div>
            )}

            {/* List scroll */}
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-8 px-4">
                  Aucun document ne correspond à « {query} ».
                </p>
              ) : (
                <>
                  {grouped.shared.length > 0 && (
                    <DocSection title="Partagés (produit / session)">
                      {grouped.shared.map((it) => (
                        <DocRow
                          key={it.key}
                          item={it}
                          generating={generatingKeys.has(it.key)}
                          onGenerate={() => handleGenerate(it, false)}
                          onRegenerate={() => handleGenerate(it, true)}
                          canGenerate={canGenerate}
                        />
                      ))}
                    </DocSection>
                  )}
                  {grouped.participant.length > 0 && (
                    <DocSection title="Par stagiaire">
                      {grouped.participant.map((it) => (
                        <DocRow
                          key={it.key}
                          item={it}
                          generating={generatingKeys.has(it.key)}
                          onGenerate={() => handleGenerate(it, false)}
                          onRegenerate={() => handleGenerate(it, true)}
                          canGenerate={canGenerate}
                        />
                      ))}
                    </DocSection>
                  )}
                  {grouped.ai.length > 0 && (
                    <DocSection title="Génération IA (asynchrone)">
                      {grouped.ai.map((it) => (
                        <DocRow
                          key={it.key}
                          item={it}
                          generating={generatingKeys.has(it.key)}
                          onGenerate={() => handleGenerate(it, false)}
                          onRegenerate={() => handleGenerate(it, true)}
                          canGenerate={canGenerate}
                        />
                      ))}
                    </DocSection>
                  )}
                </>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Raccourci : appuie <kbd className="px-1 py-0.5 rounded bg-white border border-border font-mono">g</kbd>
              </span>
              <span>Pack fin de formation → bouton 🔴 en haut</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ── Sous-composants ──────────────────────────────────────────────────── */

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-1">
        {title}
      </h4>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function DocRow({
  item,
  generating,
  onGenerate,
  onRegenerate,
  canGenerate,
}: {
  item: DocDockItem;
  generating: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  canGenerate: boolean;
}) {
  const stateNode =
    item.state === 'pending' || generating ? (
      <Loader2 className="h-4 w-4 text-sky-500 animate-spin shrink-0" />
    ) : item.state === 'generated' ? (
      <span className="h-4 w-4 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shrink-0">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    ) : (
      <span
        className="h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-50 shrink-0"
        aria-hidden="true"
      />
    );

  return (
    <li
      className={cn(
        'flex items-center gap-2 px-2 py-2 rounded-lg transition-colors group',
        item.state === 'missing' && 'hover:bg-amber-50/60',
        item.state === 'generated' && 'hover:bg-emerald-50/40',
        generating && 'bg-sky-50/40',
      )}
    >
      {stateNode}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{item.label}</div>
        {(item.participantName || item.indic) && (
          <div className="text-[11px] text-muted-foreground truncate">
            {item.participantName}
            {item.participantName && item.indic ? ' · ' : ''}
            {item.indic && <span className="font-mono">{item.indic}</span>}
          </div>
        )}
      </div>
      {/* Actions inline */}
      {item.state === 'generated' && item.pdfUrl ? (
        <div className="inline-flex items-center gap-0.5 shrink-0">
          <a
            href={item.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium text-primary hover:bg-primary-50 transition-colors"
          >
            Ouvrir
            <ExternalLink className="h-3 w-3" />
          </a>
          {canGenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={generating}
              title="Régénérer (efface le PDF actuel)"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-amber-50 hover:text-amber-700 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </button>
          )}
        </div>
      ) : item.state === 'missing' && canGenerate ? (
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition-colors shadow-sm"
        >
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Générer'}
        </button>
      ) : item.state === 'pending' ? (
        <span className="text-[11px] text-sky-700 font-medium">IA…</span>
      ) : null}
    </li>
  );
}

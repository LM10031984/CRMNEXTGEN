'use client';

/**
 * 📁 DocDockDrawer — hub documents central, V2 du DocDock floating.
 *
 * Remplace `<DocDock>` floating (bouton magique bas-droite). Ouvert via
 * bouton "Documents" du SessionHeaderBar. Drawer side panel (pas popover).
 *
 * Comportement drawer (commit ui-d garde-fous) :
 *   - z-[60] au-dessus de TopBar (z-10) et SessionHeaderBar (z-9)
 *   - Backdrop semi-opaque cliquable pour fermer
 *   - ESC ferme
 *   - body scroll-lock tant qu'ouvert
 *   - Focus trap entre backdrop et drawer
 *   - Auto-focus search input à l'ouverture
 *
 * Contenu :
 *   - Header : titre contextuel "Documents · {compteur}"
 *   - Programme épinglé en haut (carte distincte)
 *   - Search live
 *   - Bouton "⚡ Tout générer" (X manquants)
 *   - Sections collapsibles par apprenant
 *   - Footer : lien "Vue tableau" vers la matrice existante (#section-doc-matrix)
 *
 * Génération : appelle les MÊMES server actions que l'ancien DocDock floating
 * (dispatchGenerateDoc + dispatchGenerateMissing). Pas de nouveau chemin.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Table,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  dispatchGenerateDoc,
  dispatchGenerateMissing,
} from '@/server/actions/dispatch-generate-doc';
import { docCompletion } from '@/lib/sessions/doc-completion';
import type { DocDockItem } from '@/components/sessions/doc-dock';

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  items: DocDockItem[];
  canGenerate: boolean;
  /** Anchor cible du bouton "Vue tableau" — matrice ParticipantDocMatrix existante. */
  tableViewHref?: string;
}

export function DocDockDrawer({
  open,
  onClose,
  sessionId,
  items,
  canGenerate,
  tableViewHref = '#section-doc-matrix',
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // ─── Lifecycle : ESC + scroll-lock + focus trap ──────────────────────
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Focus trap minimal : confine Tab dans le drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);

    // Autofocus search
    const t = setTimeout(() => searchRef.current?.focus(), 50);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  // ─── Source unique compétude (partagée avec timeline) ────────────────
  const completion = useMemo(() => docCompletion(items), [items]);

  // ─── Programme épinglé en haut ───────────────────────────────────────
  const programmeItem = items.find((it) => it.docType === 'PROGRAMME');
  const otherItems = items.filter((it) => it.docType !== 'PROGRAMME');

  // ─── Search ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return otherItems;
    const q = query.trim().toLowerCase();
    return otherItems.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.participantName?.toLowerCase().includes(q) ||
        it.docType.toLowerCase().includes(q),
    );
  }, [otherItems, query]);

  // ─── Grouping par apprenant pour la section participant + ai ────────
  // (Section 'shared' reste en haut, séparée.)
  const sharedFiltered = filtered.filter((it) => it.section === 'shared');
  const participantGroups = useMemo(() => {
    const byParticipant = new Map<string, DocDockItem[]>();
    for (const it of filtered) {
      if (it.section === 'shared') continue;
      const key = it.participantName ?? '—';
      const arr = byParticipant.get(key) ?? [];
      arr.push(it);
      byParticipant.set(key, arr);
    }
    return Array.from(byParticipant.entries());
  }, [filtered]);

  // ─── Handlers actions (server actions existantes — pas de nouveau chemin) ──
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
          toast.success(
            r.enqueued
              ? `${item.label} — IA en cours`
              : force
                ? `${item.label} régénéré`
                : `${item.label} généré`,
          );
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
    const toGen = items.filter((it) => it.state === 'missing');
    if (toGen.length === 0) return;
    setGeneratingKeys((prev) => {
      const next = new Set(prev);
      for (const it of toGen) next.add(it.key);
      return next;
    });
    startTransition(async () => {
      try {
        const r = await dispatchGenerateMissing({
          sessionId,
          items: toGen.map((it) => ({
            docType: it.docType,
            participantId: it.participantId,
          })),
        });
        if (r.ok) {
          toast.success(`⚡ ${r.success} document${r.success > 1 ? 's' : ''} généré${r.success > 1 ? 's' : ''}`);
        } else {
          toast.warning(`${r.success}/${r.total} OK · ${r.failed} échec${r.failed > 1 ? 's' : ''}`);
        }
        router.refresh();
      } finally {
        setGeneratingKeys(new Set());
      }
    });
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop — clic ferme + scroll-lock implicite */}
      <div
        className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer side panel — z-60 au-dessus topbar/header sticky */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Documents Qualiopi"
        className="fixed top-0 right-0 bottom-0 z-[60] w-full sm:w-[480px] max-w-full bg-white shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <header className="p-4 border-b border-border bg-gradient-to-r from-violet-50/40 via-white to-primary-50/30">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-bold text-base inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              Documents Qualiopi
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground"
              aria-label="Fermer le drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
              <Check className="h-3 w-3" /> {completion.ready}/{completion.total} prêts
            </span>
            {completion.pending > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 font-medium">
                <Loader2 className="h-3 w-3 animate-spin" /> {completion.pending} en cours
              </span>
            )}
            {completion.missing > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-medium">
                {completion.missing} manquant{completion.missing > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </header>

        {/* Programme épinglé */}
        {programmeItem && (
          <section className="p-3 border-b border-border bg-primary-50/30">
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 inline-flex items-center gap-1">
              <FileText className="h-3 w-3" /> Programme épinglé
            </h3>
            <PinnedItem item={programmeItem} canGenerate={canGenerate} onGenerate={(force) => handleGenerate(programmeItem, force)} generating={generatingKeys.has(programmeItem.key)} />
          </section>
        )}

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cherche un doc ou un apprenant…"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Tout générer */}
        {canGenerate && completion.missing > 0 && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={handleGenerateAll}
              disabled={pending}
              className="w-full h-10 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60 disabled:cursor-wait transition-all shadow-sm inline-flex items-center justify-center gap-2"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Tout générer ({completion.missing})
            </button>
          </div>
        )}

        {/* Liste scroll */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-8">
              Aucun document ne correspond à « {query} ».
            </p>
          ) : (
            <>
              {sharedFiltered.length > 0 && (
                <DocSection title="Partagés (session/produit)">
                  {sharedFiltered.map((it) => (
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
              {participantGroups.map(([participantName, group]) => (
                <DocSection key={participantName} title={participantName}>
                  {group.map((it) => (
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
              ))}
            </>
          )}
        </div>

        {/* Footer : lien Vue tableau (matrice existante réutilisée) */}
        <footer className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between">
          <a
            href={tableViewHref}
            onClick={onClose}
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1.5"
          >
            <Table className="h-3.5 w-3.5" />
            Vue tableau complète
          </a>
          <span className="text-[10px] text-muted-foreground">ESC pour fermer</span>
        </footer>
      </aside>
    </>
  );
}

/* ── Sous-composants ──────────────────────────────────────────────────── */

function PinnedItem({
  item,
  canGenerate,
  onGenerate,
  generating,
}: {
  item: DocDockItem;
  canGenerate: boolean;
  onGenerate: (force: boolean) => void;
  generating: boolean;
}) {
  if (item.state === 'generated' && item.pdfUrl) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={item.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center gap-2 h-10 px-3 rounded-lg bg-emerald-100 border border-emerald-200 text-emerald-800 text-sm font-medium hover:bg-emerald-200 transition-colors"
        >
          <Check className="h-4 w-4" />
          <span className="flex-1 truncate">{item.label}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
        {canGenerate && item.docType && (
          <button
            type="button"
            onClick={() => onGenerate(true)}
            disabled={generating}
            title="Régénérer"
            className="h-10 w-10 rounded-lg border border-border bg-white text-muted-foreground hover:bg-amber-50 hover:text-amber-700 inline-flex items-center justify-center"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    );
  }
  if (item.state === 'pending' || generating) {
    return (
      <div className="h-10 px-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-sm inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{item.label} — IA en cours</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onGenerate(false)}
      disabled={!canGenerate || !item.docType}
      className="w-full h-10 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60 inline-flex items-center justify-center gap-2 shadow-sm"
    >
      <Sparkles className="h-4 w-4" />
      Générer {item.label}
    </button>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-1 sticky top-0 bg-white">
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
      <span className="h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-50 shrink-0" aria-hidden="true" />
    );

  return (
    <li
      className={cn(
        'flex items-center gap-2 px-2 py-2 rounded-md transition-colors',
        item.state === 'missing' && 'hover:bg-amber-50/40',
        item.state === 'generated' && 'hover:bg-emerald-50/30',
      )}
    >
      {stateNode}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.label}</div>
      </div>
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
              title="Régénérer"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-amber-50 hover:text-amber-700 transition-colors"
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

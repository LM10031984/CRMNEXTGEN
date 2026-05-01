'use client';

/**
 * Palette Cmd+K (Ctrl+K) — recherche universelle dans tout QualiOF.
 *
 * Couvre : apprenants, organisations, sessions, produits + raccourcis vers
 * les actions courantes (nouvelle session, pré-inscription, etc.) +
 * section "Récents" (5 dernières fiches consultées via localStorage).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Search,
  User,
  Building2,
  Calendar,
  BookOpen,
  Plus,
  Clock,
  ArrowRight,
  Inbox,
  Receipt,
  ClipboardCheck,
} from 'lucide-react';

import {
  universalSearch,
  type UniversalSearchResult,
  type UniversalHit,
} from '@/server/actions/search-universal';

const RECENT_KEY = 'qualiof-cmdk-recents';
const RECENT_MAX = 5;

interface RecentItem {
  kind: UniversalHit['kind'];
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  visitedAt: number;
}

const KIND_ICON: Record<UniversalHit['kind'], React.ComponentType<{ className?: string }>> = {
  person: User,
  org: Building2,
  session: Calendar,
  product: BookOpen,
};

const KIND_LABEL: Record<UniversalHit['kind'], string> = {
  person: 'Apprenant',
  org: 'Organisation',
  session: 'Session',
  product: 'Produit',
};

const SHORTCUTS = [
  { label: 'Nouvelle session', icon: Plus, href: '/app/sessions/nouvelle', keywords: 'créer ajouter session formation' },
  { label: 'Pré-inscriptions à valider', icon: Inbox, href: '/app/preinscriptions', keywords: 'préinscription valider apprenant' },
  { label: 'Dossiers OPCO', icon: ClipboardCheck, href: '/app/dossiers-opco', keywords: 'dossier opco agefice remboursement' },
  { label: 'Factures', icon: Receipt, href: '/app/factures', keywords: 'facture facturation paiement' },
] as const;

function loadRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentItem[];
  } catch {
    return [];
  }
}

function saveRecent(item: Omit<RecentItem, 'visitedAt'>) {
  try {
    const list = loadRecents().filter((r) => !(r.kind === item.kind && r.id === item.id));
    list.unshift({ ...item, visitedAt: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // ignore
  }
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniversalSearchResult>({
    persons: [],
    orgs: [],
    sessions: [],
    products: [],
  });
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Raccourci clavier global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Charge les récents à l'ouverture
  useEffect(() => {
    if (open) setRecents(loadRecents());
    else setQuery('');
  }, [open]);

  // Recherche debounced
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setResults({ persons: [], orgs: [], sessions: [], products: [] });
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await universalSearch(query);
        setResults(r);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  const navigate = useCallback(
    (href: string, recentItem?: Omit<RecentItem, 'visitedAt'>) => {
      if (recentItem) saveRecent(recentItem);
      setOpen(false);
      router.push(href as any);
    },
    [router],
  );

  const totalResults =
    results.persons.length + results.orgs.length + results.sessions.length + results.products.length;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} loop>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Chercher un apprenant, organisation, session, produit…"
              className="flex-1 outline-none text-sm bg-transparent placeholder:text-muted-foreground"
            />
            <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
              Esc
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            {loading && (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">
                Recherche…
              </div>
            )}

            {/* Récents (visibles si pas de query) */}
            {!query && recents.length > 0 && (
              <Command.Group heading="Récents">
                <GroupHeader icon={Clock} label="Récemment consultés" />
                {recents.map((r) => {
                  const Icon = KIND_ICON[r.kind];
                  return (
                    <Command.Item
                      key={`${r.kind}-${r.id}`}
                      value={`recent-${r.id}`}
                      onSelect={() => navigate(r.href, r)}
                      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-muted text-sm"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.title}</div>
                        {r.subtitle && (
                          <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                        )}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Raccourcis (visibles si pas de query OU si match) */}
            {!query && (
              <Command.Group>
                <GroupHeader icon={Plus} label="Actions rapides" />
                {SHORTCUTS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <Command.Item
                      key={s.href}
                      value={s.label + ' ' + s.keywords}
                      onSelect={() => navigate(s.href)}
                      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-muted text-sm"
                    >
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="flex-1 font-medium">{s.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Résultats par catégorie */}
            <ResultGroup label="Apprenants" hits={results.persons} onSelect={navigate} />
            <ResultGroup label="Organisations" hits={results.orgs} onSelect={navigate} />
            <ResultGroup label="Sessions" hits={results.sessions} onSelect={navigate} />
            <ResultGroup label="Produits" hits={results.products} onSelect={navigate} />

            {query.trim().length >= 2 && totalResults === 0 && !loading && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucun résultat pour <strong>"{query}"</strong>.
              </div>
            )}
          </Command.List>

          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            <span>
              <kbd className="border border-border rounded px-1 py-0.5">↑</kbd>
              <kbd className="border border-border rounded px-1 py-0.5 ml-1">↓</kbd> naviguer
              <kbd className="border border-border rounded px-1 py-0.5 ml-3">↵</kbd> ouvrir
            </span>
            <span>
              <kbd className="border border-border rounded px-1 py-0.5">⌘</kbd>
              <kbd className="border border-border rounded px-1 py-0.5 ml-1">K</kbd> pour rouvrir
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

function GroupHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
      <Icon className="h-3 w-3" /> {label}
    </div>
  );
}

function ResultGroup({
  label,
  hits,
  onSelect,
}: {
  label: string;
  hits: UniversalHit[];
  onSelect: (href: string, recent: Omit<RecentItem, 'visitedAt'>) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <Command.Group>
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      {hits.map((h) => {
        const Icon = KIND_ICON[h.kind];
        return (
          <Command.Item
            key={`${h.kind}-${h.id}`}
            value={`${h.kind}-${h.id}-${h.title}`}
            onSelect={() =>
              onSelect(h.href, { kind: h.kind, id: h.id, title: h.title, subtitle: h.subtitle, href: h.href })
            }
            className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-muted text-sm"
          >
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{h.title}</div>
              {h.subtitle && <div className="text-xs text-muted-foreground truncate">{h.subtitle}</div>}
            </div>
            <span className="text-[10px] text-muted-foreground">{KIND_LABEL[h.kind]}</span>
          </Command.Item>
        );
      })}
    </Command.Group>
  );
}

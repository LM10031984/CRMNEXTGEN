'use client';

/**
 * 🎯 Vue ULTIME des documents par apprenant — 1 card visuelle par stagiaire
 * qui montre TOUS ses 11 docs Qualiopi en un coup d'œil avec PDF cliquables.
 *
 * Remplace la matrice tableau cryptique (Pg/Cv/Cn...) par des cartes claires
 * style Trello. Demande Laurent 2026-06-04 : "trouve la solution ultime ·
 * un apprenant je trouve ses docs · améliore ça de 100%".
 *
 * Structure d'une card :
 *   ┌─ NOM Prénom ─────────────── 7/11 ✓ ──┐
 *   │ Sponsor · Financement                │
 *   │ ─────────── Pré-formation ────────── │
 *   │ ✓ Convention [PDF]  ✓ Convocation … │
 *   │ ─────────── Pack fin ──────────────  │
 *   │ ◯ Attestation       ◯ Certificat … │
 *   └──────────────────────────────────────┘
 *
 * Recherche live + filtre par état (Tous / Incomplets / Complets).
 * Click sur ✓ → ouvre PDF. Click sur ◯ → déclenche génération via DocDock action.
 */

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Users,
  Wallet,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatFunderCode } from '@/lib/funder-codes';
import { dispatchGenerateDoc } from '@/server/actions/dispatch-generate-doc';
import type { DispatchableDocType } from '@/lib/sessions/dispatch-doc-types';

interface DocSlot {
  /** Clé stable pour React */
  key: string;
  /** Libellé affiché */
  label: string;
  /** Indicateur Qualiopi */
  indic: string;
  /** ID du doc/asset (présent si généré) */
  pdfId?: string;
  /** Pour ouvrir le PDF : /api/documents/{id} ou /api/pedagogical-assets/{id} */
  resourceKind: 'document' | 'asset';
  /** Pour déclencher la génération via dispatch action */
  dispatchType?: DispatchableDocType;
  /** Si l'analyse besoin Ollama est en cours pour cet apprenant */
  pending?: boolean;
  /** Si non applicable (ex: AGEFICE pour un salarié non TNS) */
  notApplicable?: boolean;
}

export interface ParticipantCardData {
  participantId: string;
  personId: string;
  fullName: string;
  sponsorOrgLabel: string;
  funderCode: string | null;
  isAgefice: boolean;
  /** 7 docs pré-formation, dans l'ordre du process Laurent */
  preDocs: DocSlot[];
  /** 7 docs post-formation, dans l'ordre du process Laurent */
  postDocs: DocSlot[];
}

interface Props {
  sessionId: string;
  participants: ParticipantCardData[];
  canGenerate: boolean;
}

export function ParticipantDocsCards({ sessionId, participants, canGenerate }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('all');
  const [pending, startTransition] = useTransition();
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = participants;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.sponsorOrgLabel.toLowerCase().includes(q),
      );
    }
    if (filter === 'incomplete') {
      list = list.filter((p) => countCompletion(p).done < countCompletion(p).total);
    } else if (filter === 'complete') {
      list = list.filter((p) => countCompletion(p).done >= countCompletion(p).total);
    }
    return list;
  }, [participants, query, filter]);

  function handleGenerate(participantId: string, slot: DocSlot, force = false) {
    if (!slot.dispatchType) {
      toast.info(`${slot.label} — disponible uniquement via le Pack fin de formation`);
      return;
    }
    const k = `${participantId}-${slot.key}`;
    setGeneratingKeys((prev) => new Set(prev).add(k));
    startTransition(async () => {
      try {
        const r = await dispatchGenerateDoc({
          sessionId,
          docType: slot.dispatchType!,
          participantId,
          force,
        });
        if (r.ok) {
          toast.success(
            r.enqueued
              ? `${slot.label} — IA en cours`
              : force
                ? `${slot.label} régénéré`
                : `${slot.label} généré`,
          );
          router.refresh();
        } else {
          toast.error(r.error ?? `Erreur ${slot.label}`);
        }
      } finally {
        setGeneratingKeys((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      }
    });
  }

  const incompleteCount = participants.filter(
    (p) => countCompletion(p).done < countCompletion(p).total,
  ).length;

  if (participants.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-8 text-center text-sm text-muted-foreground italic">
        Aucun apprenant inscrit pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cherche un apprenant ou un sponsor…"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1 text-xs">
          <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>
            Tous ({participants.length})
          </FilterTab>
          <FilterTab active={filter === 'incomplete'} onClick={() => setFilter('incomplete')}>
            Incomplets ({incompleteCount})
          </FilterTab>
          <FilterTab active={filter === 'complete'} onClick={() => setFilter('complete')}>
            Complets ({participants.length - incompleteCount})
          </FilterTab>
        </div>
      </div>

      {/* Grille de cards */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-6">
          Aucun apprenant ne correspond à « {query} ».
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <ParticipantCard
              key={p.participantId}
              data={p}
              onGenerate={(slot) => handleGenerate(p.participantId, slot, false)}
              onRegenerate={(slot) => handleGenerate(p.participantId, slot, true)}
              generatingKeys={generatingKeys}
              canGenerate={canGenerate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Card composant
   ════════════════════════════════════════════════════════════════════ */

function ParticipantCard({
  data,
  onGenerate,
  onRegenerate,
  generatingKeys,
  canGenerate,
}: {
  data: ParticipantCardData;
  onGenerate: (slot: DocSlot) => void;
  onRegenerate: (slot: DocSlot) => void;
  generatingKeys: Set<string>;
  canGenerate: boolean;
}) {
  const { done, total } = countCompletion(data);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const ratioColor =
    pct >= 90 ? 'emerald' : pct >= 50 ? 'amber' : pct === 0 ? 'slate' : 'red';

  const colorClasses = {
    emerald: 'border-emerald-200 bg-emerald-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    red: 'border-red-200 bg-red-50/20',
    slate: 'border-border bg-white',
  }[ratioColor];

  const pctTextColor = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-800',
    red: 'text-red-700',
    slate: 'text-muted-foreground',
  }[ratioColor];

  const pctBarColor = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    slate: 'bg-slate-300',
  }[ratioColor];

  return (
    <article
      className={cn('rounded-2xl border p-4 transition-shadow hover:shadow-md', colorClasses)}
    >
      {/* Header card */}
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base leading-tight truncate">{data.fullName}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            <Users className="h-3 w-3 shrink-0" />
            <span className="truncate">{data.sponsorOrgLabel}</span>
            {data.funderCode && (
              <Badge variant="muted" className="text-[9px] py-0">
                <Wallet className="h-2.5 w-2.5" />
                {formatFunderCode(data.funderCode)}
              </Badge>
            )}
            {data.isAgefice && (
              <Badge variant="primary" className="text-[9px] py-0">
                TNS
              </Badge>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn('text-2xl font-bold tabular-nums leading-none', pctTextColor)}>
            {done}/{total}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
            {pct}%
          </div>
        </div>
      </header>

      {/* Barre progression */}
      <div className="h-1 rounded-full bg-white border border-border overflow-hidden mb-4">
        <div
          className={cn('h-full transition-[width] duration-500', pctBarColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Pré-formation */}
      <SectionLabel
        icon={<Sparkles className="h-3 w-3" />}
        title="Pré-formation"
      />
      <ul className="grid grid-cols-2 gap-1.5 mb-3">
        {data.preDocs.map((slot) => (
          <DocChip
            key={slot.key}
            slot={slot}
            generating={generatingKeys.has(`${data.participantId}-${slot.key}`)}
            onGenerate={() => onGenerate(slot)}
            onRegenerate={() => onRegenerate(slot)}
            canGenerate={canGenerate}
          />
        ))}
      </ul>

      {/* Pack fin */}
      <SectionLabel
        icon={<AlertCircle className="h-3 w-3" />}
        title="Pack fin de formation"
      />
      <ul className="grid grid-cols-2 gap-1.5">
        {data.postDocs.map((slot) => (
          <DocChip
            key={slot.key}
            slot={slot}
            generating={false}
            onGenerate={() => onGenerate(slot)}
            onRegenerate={() => onRegenerate(slot)}
            canGenerate={canGenerate}
          />
        ))}
      </ul>
    </article>
  );
}

/* ── Sous-composants ──────────────────────────────────────────────────── */

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-md font-medium transition-colors',
        active
          ? 'bg-primary text-white shadow-sm'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
      {icon}
      {title}
    </h4>
  );
}

function DocChip({
  slot,
  generating,
  onGenerate,
  onRegenerate,
  canGenerate,
}: {
  slot: DocSlot;
  generating: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  canGenerate: boolean;
}) {
  if (slot.notApplicable) {
    return (
      <li
        className="px-2 py-1.5 rounded-md bg-muted/30 border border-border/60 text-xs text-muted-foreground/60 inline-flex items-center gap-1.5 cursor-not-allowed select-none"
        title={`${slot.label} — non applicable (sponsor non AGEFICE)`}
      >
        <span className="h-3 w-3 rounded-full bg-muted-foreground/20 shrink-0" />
        <span className="truncate">{slot.label}</span>
      </li>
    );
  }

  // Doc généré → lien direct PDF + petit bouton "↻ régénérer" séparé
  if (slot.pdfId) {
    const href =
      slot.resourceKind === 'asset'
        ? `/api/pedagogical-assets/${slot.pdfId}`
        : `/api/documents/${slot.pdfId}`;
    return (
      <li className="flex items-stretch gap-0.5">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs inline-flex items-center gap-1.5 hover:bg-emerald-100 transition-colors group"
          title={`${slot.label} · ${slot.indic} · clic ouvre PDF`}
        >
          <span className="h-3 w-3 rounded-full bg-emerald-500 inline-flex items-center justify-center shrink-0">
            <Check className="h-2 w-2 text-white" strokeWidth={4} />
          </span>
          <span className="truncate flex-1">{slot.label}</span>
          <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100 shrink-0" />
        </a>
        {canGenerate && slot.dispatchType && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={generating}
            className="shrink-0 h-auto px-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-amber-100 hover:border-amber-300 hover:text-amber-700 transition-colors disabled:opacity-50"
            title={`Régénérer ${slot.label} (efface le PDF actuel)`}
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
        )}
      </li>
    );
  }

  // Doc en cours (analyse besoin IA)
  if (slot.pending || generating) {
    return (
      <li
        className="px-2 py-1.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-xs inline-flex items-center gap-1.5"
        title={`${slot.label} — IA en cours`}
      >
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        <span className="truncate">{slot.label}</span>
      </li>
    );
  }

  // Doc manquant → bouton générer
  return (
    <li>
      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate || !slot.dispatchType}
        className={cn(
          'w-full px-2 py-1.5 rounded-md bg-white border border-border text-xs inline-flex items-center gap-1.5 transition-colors text-left',
          slot.dispatchType && canGenerate
            ? 'hover:bg-amber-50 hover:border-amber-300 cursor-pointer'
            : 'opacity-70 cursor-not-allowed',
        )}
        title={
          slot.dispatchType
            ? `${slot.label} · ${slot.indic} · clic pour générer`
            : `${slot.label} · disponible via le Pack fin de formation`
        }
      >
        <span className="h-3 w-3 rounded-full border-2 border-amber-300 bg-amber-50 shrink-0" />
        <span className="truncate flex-1 text-muted-foreground">{slot.label}</span>
      </button>
    </li>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function countCompletion(p: ParticipantCardData): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const s of [...p.preDocs, ...p.postDocs]) {
    if (s.notApplicable) continue;
    total++;
    if (s.pdfId) done++;
  }
  return { done, total };
}

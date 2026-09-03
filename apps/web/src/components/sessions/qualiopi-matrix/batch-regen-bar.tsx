'use client';

/**
 * Phase 9.1 Plan 03 Task 2 — `<BatchRegenBar>` (Client Component).
 *
 * Sticky bottom apparait quand `selectedParticipantsCount > 0`.
 *
 * Visual : pill desktop `fixed bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-full`,
 * full-width mobile `fixed bottom-0 inset-x-0 z-30`.
 * Slide-in : `animate-in slide-in-from-bottom-4 fade-in-0`.
 *
 * Contenu :
 *   - texte gauche : `{N} apprenant{s} sélectionné{s}`
 *   - bouton `Annuler la sélection` → onClear()
 *   - DropdownMenu `Re-générer les manquants ▼` : multi-select CheckboxItem
 *     filtré sur les CLOSURE_DOC_KINDS (`DOC_TYPE_TO_CLOSURE_KIND[k] != null`).
 *     Dernier item = bouton submit `Re-générer X documents` → server action.
 *
 * Submit appelle `regenerateBatchParticipantDocs({ sessionId, items })` (Plan 02).
 * Sur success → toast.success + onClear + router.refresh().
 * Sur erreur → toast.error.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronUp, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DOC_TYPE_TO_CLOSURE_KIND, DOC_TYPE_LABELS } from '@/lib/doc-scope';
import { regenerateBatchParticipantDocs } from '@/server/actions/qualiopi-matrix';

export interface BatchRegenBarItem {
  participantId: string;
  docKind: string;
}

export interface BatchRegenBarProps {
  sessionId: string;
  /** Items candidats — produit cartésien participants × docKinds compatibles batch. */
  selectedItems: BatchRegenBarItem[];
  selectedParticipantsCount: number;
  onClear: () => void;
}

export function BatchRegenBar({
  sessionId,
  selectedItems,
  selectedParticipantsCount,
  onClear,
}: BatchRegenBarProps) {
  const [pending, startTransition] = useTransition();
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Hook AVANT tout early-return : sinon l'ordre des hooks change entre renders
  // (rules-of-hooks, révélé par le 1er passage ESLint réel, 21-03).
  const batchableKinds = useMemo(
    () => Object.keys(DOC_TYPE_TO_CLOSURE_KIND).filter((k) => DOC_TYPE_TO_CLOSURE_KIND[k] != null),
    [],
  );

  if (selectedParticipantsCount === 0) return null;

  function toggleKind(kind: string, next: boolean) {
    setSelectedKinds((prev) => {
      const out = new Set(prev);
      if (next) out.add(kind);
      else out.delete(kind);
      return out;
    });
  }

  const totalDocsToRegenerate = selectedParticipantsCount * selectedKinds.size;

  function handleSubmit() {
    const filteredItems = selectedItems.filter((it) => selectedKinds.has(it.docKind));
    if (filteredItems.length === 0) {
      toast.error('Sélectionnez au moins un type de document à re-générer.');
      return;
    }
    startTransition(async () => {
      const res = await regenerateBatchParticipantDocs({
        sessionId,
        items: filteredItems,
      });
      if (res.ok) {
        toast.success(
          `Re-génération lancée pour ${res.total ?? filteredItems.length} document${(res.total ?? filteredItems.length) > 1 ? 's' : ''}`,
          { description: 'Résultat dans ~2 min — actualisez la page pour voir l’avancement.' },
        );
        // Lot 0 · 0.2 — un traitement de masse muet sur ce qu'il a ignoré est
        // pire qu'un refus : on nomme les documents engagés qui n'ont PAS été
        // remplacés, et pourquoi.
        if (res.skippedEngaged && res.skippedEngaged.length > 0) {
          const n = res.skippedEngaged.length;
          toast.warning(
            `${n} document${n > 1 ? 's' : ''} engagé${n > 1 ? 's' : ''} conservé${n > 1 ? 's' : ''}`,
            {
              description:
                'Déjà envoyé, déposé ou signé — non remplacé. Un avenant ou un nouveau dossier est nécessaire.',
              duration: 10000,
            },
          );
        }
        setSelectedKinds(new Set());
        onClear();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erreur lors de l'opération. Réessayez ou contactez un administrateur.");
      }
    });
  }

  const wordSelected = selectedParticipantsCount > 1 ? 'sélectionnés' : 'sélectionné';
  const wordApprenant = selectedParticipantsCount > 1 ? 'apprenants' : 'apprenant';

  return (
    <div
      role="region"
      aria-label="Sélection multiple — actions groupées"
      data-state="visible"
      className={cn(
        'data-[state=visible]:animate-in data-[state=visible]:slide-in-from-bottom-4 data-[state=visible]:fade-in-0',
        // Mobile : full-width bottom bar
        'fixed bottom-0 inset-x-0 z-30 border-t border-border bg-foreground text-white shadow-lg',
        // Desktop : pill centered
        'sm:bottom-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:rounded-full sm:border-0 sm:shadow-2xl',
        'flex items-center gap-3 px-6 py-3 flex-wrap',
      )}
    >
      <span className="text-sm font-medium">
        {selectedParticipantsCount} {wordApprenant} {wordSelected}
      </span>

      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        className="inline-flex items-center gap-1 text-xs text-white/80 hover:text-white"
        aria-label="Annuler la sélection"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" /> Annuler la sélection
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-foreground text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Re-générer les manquants
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="bg-white text-foreground border border-border rounded-lg shadow-2xl py-1 min-w-[260px] max-h-[60vh] overflow-y-auto z-50"
          >
            <div className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              Types de documents
            </div>
            {batchableKinds.map((kind) => {
              const lbl = DOC_TYPE_LABELS[kind]?.long ?? kind;
              const checked = selectedKinds.has(kind);
              return (
                <DropdownMenu.CheckboxItem
                  key={kind}
                  checked={checked}
                  onCheckedChange={(c) => toggleKind(kind, c === true)}
                  onSelect={(e) => e.preventDefault()}
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    aria-hidden="true"
                    tabIndex={-1}
                    className="h-3.5 w-3.5 rounded border-border accent-primary pointer-events-none"
                  />
                  {lbl}
                </DropdownMenu.CheckboxItem>
              );
            })}
            <DropdownMenu.Separator className="h-px bg-border my-1" />
            <DropdownMenu.Item
              onSelect={handleSubmit}
              disabled={selectedKinds.size === 0 || pending}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer outline-none data-[highlighted]:bg-primary-50 text-primary',
                (selectedKinds.size === 0 || pending) && 'opacity-50 cursor-not-allowed',
              )}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Re-générer les {totalDocsToRegenerate} document{totalDocsToRegenerate > 1 ? 's' : ''}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

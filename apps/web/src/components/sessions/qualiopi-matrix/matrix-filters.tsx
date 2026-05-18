'use client';

/**
 * Phase 9.1 Plan 03 Task 2 — `<MatrixFilters>` (Client Component).
 *
 * 4 contrôles UI :
 *   - Tri (Radix DropdownMenu) — name-asc | name-desc | opco | status
 *   - Statut OPCO (Radix DropdownMenu) — all | <opcoCode>
 *   - Financement (Radix DropdownMenu) — all | self | sponsor | mixed
 *   - Incomplets uniquement (toggle role="switch")
 *
 * Persistance localStorage : key `qualiof-matrix-filters-${sessionId}` (R5 mitigation —
 * sessionId-scoped pour éviter cross-pollution entre sessions).
 *
 * Copywriting FR EXACTES UI-SPEC §Copywriting Contract.
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useLocalStorageState } from '@/lib/use-local-storage-state';

export interface MatrixFilterState {
  sort: 'name-asc' | 'name-desc' | 'opco' | 'status';
  opcoFilter: 'all' | string;
  financingFilter: 'all' | 'self' | 'sponsor' | 'mixed';
  incompleteOnly: boolean;
}

export const DEFAULT_MATRIX_FILTERS: MatrixFilterState = {
  sort: 'name-asc',
  opcoFilter: 'all',
  financingFilter: 'all',
  incompleteOnly: false,
};

export interface MatrixFiltersProps {
  sessionId: string;
  opcoOptions: string[];
  onChange: (state: MatrixFilterState) => void;
}

const SORT_LABELS: Record<MatrixFilterState['sort'], string> = {
  'name-asc': 'Nom ↑',
  'name-desc': 'Nom ↓',
  opco: 'OPCO',
  status: 'Statut',
};

const FINANCING_LABELS: Record<MatrixFilterState['financingFilter'], string> = {
  all: 'Tous',
  self: 'Auto-financement',
  sponsor: 'Sponsor / OPCO',
  mixed: 'Mixte',
};

const CHIP_BASE =
  'inline-flex items-center gap-2 px-3 h-8 rounded-full border text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none';
const CHIP_INACTIVE = 'bg-white text-foreground border-border hover:bg-muted/40';
const CHIP_ACTIVE = 'bg-primary-50 text-primary-700 border-primary-100';

function isDefault(state: MatrixFilterState): boolean {
  return (
    state.sort === DEFAULT_MATRIX_FILTERS.sort &&
    state.opcoFilter === DEFAULT_MATRIX_FILTERS.opcoFilter &&
    state.financingFilter === DEFAULT_MATRIX_FILTERS.financingFilter &&
    state.incompleteOnly === DEFAULT_MATRIX_FILTERS.incompleteOnly
  );
}

export function MatrixFilters({ sessionId, opcoOptions, onChange }: MatrixFiltersProps) {
  const storageKey = `qualiof-matrix-filters-${sessionId}`;
  const [state, setState] = useLocalStorageState<MatrixFilterState>(
    storageKey,
    DEFAULT_MATRIX_FILTERS,
  );

  // Propage state au parent quand il change (le parent applique le filtrage côté UI).
  useEffect(() => {
    onChange(state);
  }, [state, onChange]);

  function patch(p: Partial<MatrixFilterState>) {
    setState({ ...state, ...p });
  }

  function reset() {
    setState(DEFAULT_MATRIX_FILTERS);
  }

  const sortActive = state.sort !== DEFAULT_MATRIX_FILTERS.sort;
  const opcoActive = state.opcoFilter !== 'all';
  const financingActive = state.financingFilter !== 'all';
  const incompleteActive = state.incompleteOnly;

  return (
    <div className="flex items-center gap-2 flex-wrap" role="toolbar" aria-label="Filtres de la matrice">
      {/* Tri */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(CHIP_BASE, sortActive ? CHIP_ACTIVE : CHIP_INACTIVE)}
            aria-label="Trier"
          >
            Trier : {SORT_LABELS[state.sort]}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className="bg-white border border-border rounded-lg shadow-lg py-1 min-w-[180px] z-50"
          >
            {(['name-asc', 'name-desc', 'opco', 'status'] as const).map((k) => (
              <DropdownMenu.Item
                key={k}
                onSelect={() => patch({ sort: k })}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
              >
                {SORT_LABELS[k]}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Statut OPCO */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(CHIP_BASE, opcoActive ? CHIP_ACTIVE : CHIP_INACTIVE)}
            aria-label="Filtrer par OPCO"
          >
            Statut OPCO : {state.opcoFilter === 'all' ? 'Tous' : state.opcoFilter}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className="bg-white border border-border rounded-lg shadow-lg py-1 min-w-[180px] z-50"
          >
            <DropdownMenu.Item
              onSelect={() => patch({ opcoFilter: 'all' })}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
            >
              Tous
            </DropdownMenu.Item>
            {opcoOptions.map((opco) => (
              <DropdownMenu.Item
                key={opco}
                onSelect={() => patch({ opcoFilter: opco })}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
              >
                {opco}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Financement */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(CHIP_BASE, financingActive ? CHIP_ACTIVE : CHIP_INACTIVE)}
            aria-label="Filtrer par financement"
          >
            Financement : {FINANCING_LABELS[state.financingFilter]}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className="bg-white border border-border rounded-lg shadow-lg py-1 min-w-[180px] z-50"
          >
            {(['all', 'self', 'sponsor', 'mixed'] as const).map((k) => (
              <DropdownMenu.Item
                key={k}
                onSelect={() => patch({ financingFilter: k })}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
              >
                {FINANCING_LABELS[k]}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Incomplets uniquement toggle */}
      <button
        type="button"
        role="switch"
        aria-checked={incompleteActive}
        onClick={() => patch({ incompleteOnly: !state.incompleteOnly })}
        className={cn(CHIP_BASE, incompleteActive ? CHIP_ACTIVE : CHIP_INACTIVE)}
      >
        Incomplets uniquement
      </button>

      {!isDefault(state) && (
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" /> Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}

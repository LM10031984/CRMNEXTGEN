'use client';

/**
 * Phase 9.1 Plan 03 Task 1 — `<MatrixClientShell>` (Client Component).
 *
 * Wrapper client autour du `<table>` matrice :
 *   - tient le `selectedIds` Set + handlers select/clear
 *   - tient l'état filtre via `<MatrixFilters onChange>` (Task 2)
 *   - applique tri + filtres côté client (count modéré ≤ ~30 lignes/session)
 *   - rend MatrixRow (Task 1) pour chaque participant filtré
 *   - rend BatchRegenBar (Task 2) quand selectedIds.size > 0
 *
 * Séparé du Server Component `ParticipantDocMatrix` pour ne pas embarquer
 * `useState` dans le RSC tree.
 */

import { useMemo, useState } from 'react';
import { MatrixRow, type RowParticipant } from './matrix-row';
import { MatrixFilters, DEFAULT_MATRIX_FILTERS, type MatrixFilterState } from './matrix-filters';
import { BatchRegenBar } from './batch-regen-bar';
import { DOC_TYPE_TO_CLOSURE_KIND } from '@/lib/doc-scope';
import type { CellState } from '@/lib/derive-cell-state';

export interface MatrixClientShellRow {
  participant: RowParticipant & {
    sponsorOrgOpcoCode?: string | null;
    financingMode?: string | null;
    isAgefice: boolean;
  };
  cells: Array<{ docType: string; state: CellState }>;
}

export interface MatrixClientShellProps {
  sessionId: string;
  readOnly: boolean;
  rows: MatrixClientShellRow[];
  columns: readonly string[];
  opcoOptions: string[];
  columnLabels: Record<string, { short: string; long: string }>;
}

function isIncomplete(cells: MatrixClientShellRow['cells']): boolean {
  return cells.some(
    (c) => c.state.state === 'MISSING' || (c.state.state === 'MANUAL_OK' && 'warning' in c.state && c.state.warning === 'no_proof'),
  );
}

function applyFilters(
  rows: MatrixClientShellRow[],
  filters: MatrixFilterState,
): MatrixClientShellRow[] {
  const out = rows.filter((r) => {
    if (filters.opcoFilter !== 'all' && r.participant.sponsorOrgOpcoCode !== filters.opcoFilter) {
      return false;
    }
    if (filters.financingFilter !== 'all') {
      const fm = (r.participant.financingMode ?? '').toUpperCase();
      if (filters.financingFilter === 'self' && fm !== 'SELF' && fm !== 'AUTO') return false;
      if (filters.financingFilter === 'sponsor' && fm !== 'SPONSOR' && fm !== 'OPCO' && fm !== 'EMPLOYER') return false;
      if (filters.financingFilter === 'mixed' && fm !== 'MIXED') return false;
    }
    if (filters.incompleteOnly && !isIncomplete(r.cells)) return false;
    return true;
  });

  out.sort((a, b) => {
    if (filters.sort === 'name-asc') return a.participant.fullName.localeCompare(b.participant.fullName);
    if (filters.sort === 'name-desc') return b.participant.fullName.localeCompare(a.participant.fullName);
    if (filters.sort === 'opco') {
      return (a.participant.sponsorOrgOpcoCode ?? '').localeCompare(b.participant.sponsorOrgOpcoCode ?? '');
    }
    if (filters.sort === 'status') {
      const ai = isIncomplete(a.cells) ? 0 : 1;
      const bi = isIncomplete(b.cells) ? 0 : 1;
      return ai - bi;
    }
    return 0;
  });

  return out;
}

export function MatrixClientShell({
  sessionId,
  readOnly,
  rows,
  columns,
  opcoOptions,
  columnLabels,
}: MatrixClientShellProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<MatrixFilterState>(DEFAULT_MATRIX_FILTERS);

  const filteredRows = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  function handleSelectionChange(participantId: string, next: boolean) {
    setSelectedIds((prev) => {
      const out = new Set(prev);
      if (next) out.add(participantId);
      else out.delete(participantId);
      return out;
    });
  }

  function handleToggleAll(next: boolean) {
    setSelectedIds(next ? new Set(filteredRows.map((r) => r.participant.id)) : new Set());
  }

  function handleClear() {
    setSelectedIds(new Set());
  }

  // Items pour BatchRegenBar : produit cartésien (participantId × CLOSURE_DOC_KINDS filtrés).
  // Le menu interne de BatchRegenBar laisse l'admin sélectionner les kinds à re-générer.
  const batchableSelectedItems = useMemo(() => {
    const items: Array<{ participantId: string; docKind: string }> = [];
    for (const pid of selectedIds) {
      // 1 item par docKind compatible — le composant filtre via DOC_TYPE_TO_CLOSURE_KIND
      for (const docKind of Object.keys(DOC_TYPE_TO_CLOSURE_KIND)) {
        if (DOC_TYPE_TO_CLOSURE_KIND[docKind] != null) {
          items.push({ participantId: pid, docKind });
        }
      }
    }
    return items;
  }, [selectedIds]);

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.participant.id));

  return (
    <div className="px-5 pb-5 space-y-3">
      <MatrixFilters
        sessionId={sessionId}
        opcoOptions={opcoOptions}
        onChange={setFilters}
      />

      <div className="overflow-x-auto -mx-5 sm:mx-0">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/30">
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 bg-muted/30 z-10 px-2 py-2 border-b w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => handleToggleAll(e.target.checked)}
                  aria-label="Sélectionner tous les apprenants visibles"
                  disabled={readOnly || filteredRows.length === 0}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
              </th>
              <th
                scope="col"
                className="sticky left-[40px] bg-muted/30 z-10 px-3 py-2 font-semibold border-b min-w-[180px]"
              >
                Apprenant
              </th>
              {columns.map((docType) => {
                const lbl = columnLabels[docType];
                return (
                  <th
                    key={docType}
                    scope="col"
                    className="px-1 py-2 font-semibold text-center border-b min-w-[44px] h-32 align-bottom"
                  >
                    {/* Header vertical pour lisibilité sans hover.
                        Bug remonté Laurent 2026-06-04 : "Pg/Cv/Cn cryptique". */}
                    <div
                      className="inline-flex items-end justify-center h-full"
                      title={lbl?.long ?? docType}
                    >
                      <span
                        className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-medium text-foreground/80 leading-tight tabular-nums whitespace-nowrap"
                      >
                        {lbl?.long ?? docType}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <MatrixRow
                key={r.participant.id}
                participant={r.participant}
                cells={r.cells}
                selected={selectedIds.has(r.participant.id)}
                onSelectionChange={handleSelectionChange}
                readOnly={readOnly}
                columns={columns}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filteredRows.length === 0 && rows.length > 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-4">
          Aucun apprenant ne correspond aux filtres actuels.
        </p>
      )}

      {selectedIds.size > 0 && !readOnly && (
        <BatchRegenBar
          sessionId={sessionId}
          selectedItems={batchableSelectedItems}
          selectedParticipantsCount={selectedIds.size}
          onClear={handleClear}
        />
      )}
    </div>
  );
}

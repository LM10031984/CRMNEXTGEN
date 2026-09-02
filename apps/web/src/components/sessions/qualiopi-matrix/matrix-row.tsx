'use client';

/**
 * Phase 9.1 Plan 03 Task 1 — `<MatrixRow>` (Client Component).
 *
 * Une ligne `<tr>` :
 *   col 1 sticky-left : checkbox de sélection
 *   col 2 sticky-left : nom participant (Link `/app/apprenants/{personId}` — D-05)
 *   col 3+ : N cellules DocStatusButton (pastille + DocCellMenu)
 *
 * Sélection : checkbox bidirectionnelle bind sur parent state via `onSelectionChange`.
 * Selected row : `border-l-4 border-primary bg-primary-50/30` (UI-SPEC).
 * Hover : `bg-muted/30`.
 *
 * Cellule pastille avec pdfRef → wrappée dans `<a target=_blank href=/api/documents/{id}>`
 * (D-14 1-clic — UI-SPEC §Key interactions #1).
 * Cellule sans pdfRef → pastille standalone (pas de wrapper anchor).
 *
 * DocCellMenu pris en charge en plus de la pastille (UI-SPEC §MatrixRow composite).
 */

import { usePathname } from 'next/navigation';
import { withFrom } from '@/lib/nav/from-link';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { DocStatusBadge } from './doc-status-badge';
import { DocCellMenu } from './doc-cell-menu';
import { DOC_TYPE_LABELS } from '@/lib/doc-scope';
import type { CellState } from '@/lib/derive-cell-state';

export interface RowParticipant {
  /** SessionParticipant.id (utilisé pour la sélection + actions). */
  id: string;
  /** Person.id (utilisé pour la cross-nav D-05). */
  personId: string;
  /** "Prénom NOM" — préformaté côté server pour éviter de passer Person en RSC. */
  fullName: string;
  /** Label org sponsor optionnel (brandName ?? legalName). */
  sponsorOrgLabel?: string;
  sponsorOrgId?: string;
}

export interface MatrixRowProps {
  participant: RowParticipant;
  /** Cellules pré-dérivées via deriveCellState (Server Component parent). */
  cells: Array<{ docType: string; state: CellState }>;
  selected: boolean;
  onSelectionChange: (participantId: string, next: boolean) => void;
  readOnly: boolean;
  /** Colonnes ordonnées (MATRIX_DOC_TYPES + éventuellement AGEFICE). */
  columns: readonly string[];
}

export function MatrixRow({
  participant,
  cells,
  selected,
  onSelectionChange,
  readOnly,
  columns,
}: MatrixRowProps) {
  const pathname = usePathname();
  const cellByType = new Map(cells.map((c) => [c.docType, c.state]));

  return (
    <tr
      aria-selected={selected}
      className={cn(
        'transition-colors',
        selected ? 'border-l-4 border-primary bg-primary-50/30' : 'hover:bg-muted/30',
      )}
    >
      <td className="sticky left-0 bg-white z-10 px-2 py-1.5 border-b align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectionChange(participant.id, e.target.checked)}
          aria-label={`Sélectionner ${participant.fullName}`}
          disabled={readOnly}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      </td>
      <th
        scope="row"
        className="sticky left-[40px] bg-white z-10 px-3 py-1.5 text-left text-sm font-medium border-b min-w-[180px] align-middle"
      >
        <Link
          href={withFrom(`/app/apprenants/${participant.personId}`, pathname) as any}
          className="hover:text-primary hover:underline truncate block"
          title={participant.fullName}
        >
          {participant.fullName}
        </Link>
        {participant.sponsorOrgLabel && (
          <span className="text-xs text-muted-foreground truncate block">
            {participant.sponsorOrgLabel}
          </span>
        )}
      </th>
      {columns.map((docType) => {
        const cell = cellByType.get(docType) ?? ({ state: 'MISSING' } as CellState);
        const label = DOC_TYPE_LABELS[docType]?.long ?? docType;
        const pdfRef = 'pdfRef' in cell ? cell.pdfRef : undefined;
        const warning = 'warning' in cell ? cell.warning : undefined;
        const stale = 'stale' in cell ? cell.stale === true : false;
        const stub = 'stub' in cell ? cell.stub === true : false;
        return (
          <td
            key={docType}
            className="px-1 py-1.5 text-center border-b min-w-[48px] align-middle"
          >
            <div className="inline-flex items-center gap-0.5">
              {cell.state === 'GENERATED' && pdfRef ? (
                <a
                  href={
                    pdfRef.kind === 'asset'
                      ? `/api/pedagogical-assets/${pdfRef.id}`
                      : `/api/documents/${pdfRef.id}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ouvrir ${label} de ${participant.fullName}`}
                  className="inline-flex items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <DocStatusBadge state="GENERATED" label={label} stale={stale} stub={stub} />
                </a>
              ) : cell.state === 'MANUAL_OK' && pdfRef ? (
                <a
                  href={
                    pdfRef.kind === 'asset'
                      ? `/api/pedagogical-assets/${pdfRef.id}`
                      : `/api/documents/${pdfRef.id}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ouvrir ${label} de ${participant.fullName}`}
                  className="inline-flex items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <DocStatusBadge state="MANUAL_OK" warning={warning} label={label} hasUploadedPdf stale={stale} />
                </a>
              ) : (
                <DocStatusBadge
                  state={cell.state}
                  warning={warning}
                  label={label}
                />
              )}
              <DocCellMenu
                participantId={participant.id}
                docType={docType}
                state={cell.state}
                pdfRef={pdfRef}
                stale={stale}
                stub={stub}
                readOnly={readOnly}
                participantName={participant.fullName}
                docLabel={label}
              />
            </div>
          </td>
        );
      })}
    </tr>
  );
}

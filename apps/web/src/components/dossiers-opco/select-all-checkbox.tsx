'use client';

import { useEffect, useRef } from 'react';
import { useDossierSelection } from './selection-context';

interface Props {
  /** IDs de toutes les rows actuellement affichées sur la page */
  allIds: string[];
}

/**
 * Checkbox du header — toggle "tout sélectionner" / "tout déselectionner"
 * sur les rows visibles. Affiche l'état "indeterminate" (partiel) si
 * certaines rows sont sélectionnées mais pas toutes.
 */
export function DossierSelectAllCheckbox({ allIds }: Props) {
  const { selected, toggleAll } = useDossierSelection();
  const ref = useRef<HTMLInputElement | null>(null);

  const selectedHere = allIds.filter((id) => selected.has(id)).length;
  const allSelected = allIds.length > 0 && selectedHere === allIds.length;
  const isIndeterminate = selectedHere > 0 && !allSelected;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = isIndeterminate;
  }, [isIndeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={(e) => toggleAll(allIds, e.target.checked)}
      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
      aria-label={allSelected ? 'Tout déselectionner' : 'Tout sélectionner'}
    />
  );
}

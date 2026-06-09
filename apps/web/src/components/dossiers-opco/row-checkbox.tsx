'use client';

import { useDossierSelection } from './selection-context';

export function DossierRowCheckbox({ id }: { id: string }) {
  const { isSelected, toggle } = useDossierSelection();
  return (
    <input
      type="checkbox"
      checked={isSelected(id)}
      onChange={() => toggle(id)}
      onClick={(e) => e.stopPropagation()}
      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
      aria-label="Sélectionner ce dossier"
    />
  );
}

'use client';

/**
 * Context React partagé entre le tableau Dossiers OPCO et la barre d'actions
 * en bas (US-010). Permet de sélectionner N participants via checkbox et
 * d'appliquer une action en lot.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface SelectionContextValue {
  selected: Set<string>;
  toggle: (id: string) => void;
  toggleAll: (ids: string[], select: boolean) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
  count: number;
}

const Ctx = createContext<SelectionContextValue | null>(null);

export function DossierSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (select) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const value = useMemo(
    () => ({ selected, toggle, toggleAll, clear, isSelected, count: selected.size }),
    [selected, toggle, toggleAll, clear, isSelected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDossierSelection(): SelectionContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDossierSelection must be used within DossierSelectionProvider');
  return ctx;
}

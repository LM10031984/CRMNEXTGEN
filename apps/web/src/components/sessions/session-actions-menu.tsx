'use client';

/**
 * Menu kebab "⋮" pour les actions secondaires d'une session — réduit l'encombrement
 * visuel du header (avant : 4 boutons côte-à-côte, maintenant : 1 primaire + 1 kebab).
 *
 * Reçoit les composants d'action en `children` (PrepareTrainingButton,
 * GenerateClosurePackButton, DuplicateSessionButton, DeleteSessionButton…) et
 * les empile dans un popover. Chaque enfant conserve son propre modal/dialog,
 * le menu ne fait que les regrouper visuellement.
 */

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  label?: string;
}

export function SessionActionsMenu({ children, label = 'Plus d’actions' }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermeture sur clic en dehors / touche Escape — pattern accessible standard
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-white hover:bg-muted/40 transition-colors text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-40 w-64 rounded-lg border border-border bg-white shadow-lg p-2 space-y-1"
        >
          <div className="px-2 pb-1.5 mb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/60">
            {label}
          </div>
          {/* Les enfants sont rendus tels quels : chaque bouton conserve son look
              et son dialog. Le wrapper assure juste l'empilement vertical. */}
          <div className="flex flex-col items-stretch gap-1 [&>button]:w-full [&>button]:justify-start [&>div]:w-full">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

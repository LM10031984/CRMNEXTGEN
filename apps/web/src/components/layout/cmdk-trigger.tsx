'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * Bouton de déclenchement de la palette Cmd+K, visible dans la TopBar.
 * Affiche le raccourci clavier détecté (⌘K sur Mac, Ctrl+K sur Windows/Linux).
 *
 * Le composant CommandPalette écoute déjà l'événement clavier global ; ici
 * on synthétise le keypress pour ouvrir la palette via clic souris.
 */
export function CmdkTrigger() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPad|iPhone|iPod/.test(navigator.platform));
  }, []);

  const open = () => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      [isMac ? 'metaKey' : 'ctrlKey']: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  return (
    <button
      type="button"
      onClick={open}
      className="
        w-full flex items-center gap-2 h-10 px-3 rounded-xl
        bg-white ring-1 ring-slate-200/70 shadow-soft
        text-sm text-slate-500
        transition-all duration-200 ease-in-out
        hover:ring-slate-300 hover:shadow-card hover:text-slate-700
        focus:outline-none focus:ring-2 focus:ring-primary-200 focus:ring-offset-1
      "
    >
      <Search className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
      <span className="hidden sm:inline flex-1 text-left">Rechercher…</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-md px-1.5 py-0.5 ring-1 ring-slate-200/60">
        {isMac ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  );
}

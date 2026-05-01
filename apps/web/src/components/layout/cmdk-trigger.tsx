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
      className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/30 hover:bg-muted text-sm text-muted-foreground transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Rechercher…</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] border border-border rounded bg-white px-1 py-0.5 ml-2">
        {isMac ? '⌘' : 'Ctrl'}K
      </kbd>
    </button>
  );
}

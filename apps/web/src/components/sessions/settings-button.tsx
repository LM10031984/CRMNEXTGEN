'use client';

/**
 * Bouton "Paramètres" intégré à la barre actions du SessionHeaderBar +
 * ouverture du <SettingsDrawer> latéral. Trigger + state contenu en un
 * seul client component (pattern DocsButton ui-d).
 *
 * Les sections sont passées en `children` par la page — le drawer ne
 * connaît pas leur contenu, juste le container.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { SettingsDrawer } from './settings-drawer';

interface Props {
  /** Sections du drawer rendues par la page (server) en children. */
  children: ReactNode;
  /** Badge optionnel — ex. nombre de tâches en attente. */
  badge?: ReactNode;
}

export function SettingsButton({ children, badge }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors relative"
        title="Ouvrir les paramètres de la session"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
        Paramètres
        {badge}
      </button>

      <SettingsDrawer open={open} onClose={() => setOpen(false)}>
        {children}
      </SettingsDrawer>
    </>
  );
}

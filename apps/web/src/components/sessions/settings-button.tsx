'use client';

/**
 * Bouton "Paramètres" intégré à la barre actions du SessionHeaderBar +
 * ouverture du <SettingsDrawer> latéral. Trigger + state contenu en un
 * seul client component (pattern DocsButton ui-d).
 *
 * Les sections sont passées en `children` par la page — le drawer ne
 * connaît pas leur contenu, juste le container.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { SettingsDrawer } from './settings-drawer';

/**
 * Hashes du drawer — un click sur un lien `#section-formateurs` (CTA
 * sessionStage "Choisir le formateur") doit ouvrir le drawer + scroller
 * à la section. Sinon le CTA est mort quand le drawer est fermé.
 */
const DRAWER_HASHES = new Set([
  '#section-formateurs',
  '#section-lieu',
  '#section-logistique',
]);

interface Props {
  /** Sections du drawer rendues par la page (server) en children. */
  children: ReactNode;
  /** Badge optionnel — ex. nombre de tâches en attente. */
  badge?: ReactNode;
}

export function SettingsButton({ children, badge }: Props) {
  const [open, setOpen] = useState(false);

  // Hash-detect : si l'URL pointe vers une section du drawer, on l'ouvre.
  // Cas typique : sessionStage CTA "Choisir le formateur" → href="#section-
  // formateurs". Sans cette détection, le clic est mort quand drawer fermé.
  useEffect(() => {
    function maybeOpen() {
      const hash = window.location.hash;
      if (DRAWER_HASHES.has(hash)) {
        setOpen(true);
        // Differ le scroll pour que l'anchor soit dans le DOM après render.
        setTimeout(() => {
          document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
    maybeOpen();
    window.addEventListener('hashchange', maybeOpen);
    return () => window.removeEventListener('hashchange', maybeOpen);
  }, []);

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

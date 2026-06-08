'use client';

/**
 * Bouton "Documents" intégré à la barre actions du SessionHeaderBar +
 * ouverture du <DocDockDrawer> latéral. Trigger + state contenu en
 * un seul client component pour ne pas avoir à hoister le state open/close.
 *
 * Compteur de manquants en badge — lit depuis docCompletion() (source unique
 * partagée avec les compteurs des steps timeline).
 */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { docCompletion } from '@/lib/sessions/doc-completion';
import { DocDockDrawer } from './doc-dock-drawer';
import type { DocDockItem } from '@/lib/sessions/dispatch-doc-types';

interface Props {
  sessionId: string;
  items: DocDockItem[];
  canGenerate: boolean;
}

export function DocsButton({ sessionId, items, canGenerate }: Props) {
  const [open, setOpen] = useState(false);
  const c = docCompletion(items);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors relative"
        title="Ouvrir le hub documents (raccourci : g)"
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        Documents
        {c.missing > 0 && (
          <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold inline-flex items-center justify-center">
            {c.missing}
          </span>
        )}
      </button>

      <DocDockDrawer
        open={open}
        onClose={() => setOpen(false)}
        sessionId={sessionId}
        items={items}
        canGenerate={canGenerate}
        tableViewHref="#section-doc-matrix"
      />
    </>
  );
}

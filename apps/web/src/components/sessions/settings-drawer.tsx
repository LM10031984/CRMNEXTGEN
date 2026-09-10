'use client';

/**
 * ⚙️ SettingsDrawer — drawer paramètres session (commit ui-e3).
 *
 * Remplace le <details> "Paramètres avancés" en bas de la fiche session
 * (Formateurs/Lieu/Satisfaction/Logistique/Notes) par un side panel
 * unifié, accessible via bouton "Paramètres" dans le SessionHeaderBar.
 *
 * Architecture : clone-strict de <DocDockDrawer> (commit ui-d) pour les
 * garde-fous :
 *   - z-[60] au-dessus de TopBar et SessionHeaderBar
 *   - Backdrop semi-opaque cliquable pour fermer
 *   - ESC ferme
 *   - body scroll-lock tant qu'ouvert
 *   - Focus trap minimal Tab/Shift+Tab
 *
 * Contenu : open slot — la page passe ses sections en children via
 * <SettingsDrawerSection>. Le drawer ne connaît pas les sections, juste
 * la container UX.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Settings, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Titre dans le header du drawer. Défaut : "Paramètres session". */
  title?: string;
}

export function SettingsDrawer({
  open,
  onClose,
  children,
  title = 'Paramètres session',
}: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Portal vers <body> : le drawer est déclenché depuis le SessionHeaderBar
  // (sticky). Rendu en place, il hérite de tout containing block créé par un
  // ancêtre (transform/filter/backdrop-filter) et son `fixed` devient relatif
  // au header. `mounted` évite le mismatch SSR (document absent côté serveur).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Focus trap minimal — confine Tab dans le drawer.
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);

    // Auto-focus sur le bouton fermer pour ancrer le trap.
    const t = setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed top-0 right-0 bottom-0 z-[60] w-full sm:w-[520px] max-w-full bg-white shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-200"
      >
        <header className="p-4 border-b border-border bg-gradient-to-r from-slate-50 via-white to-slate-50/40 flex items-center justify-between gap-2">
          <h2 className="font-bold text-base inline-flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {title}
          </h2>
          <button
            type="button"
            data-drawer-close
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground"
            aria-label="Fermer le panneau paramètres"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">{children}</div>

        <footer className="px-4 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground text-right">
          ESC pour fermer
        </footer>
      </aside>
    </>,
    document.body,
  );
}

/* ── Sous-composant : wrapper visuel pour chaque section du drawer ─── */

export function SettingsDrawerSection({
  title,
  icon,
  children,
  anchorId,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  /** id ancre — préserve les liens existants vers #section-formateurs etc. */
  anchorId?: string;
}) {
  return (
    <section
      id={anchorId}
      className="border-b border-border last:border-b-0 p-4 scroll-mt-4"
    >
      <h3 className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

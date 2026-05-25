'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'qualiof-sidebar-collapsed';

/**
 * Wrapper client qui ajuste sa marge gauche selon l'état collapsed de la
 * sidebar (lu depuis le même localStorage). Évite la dépendance entre
 * server layout et state client de la sidebar.
 */
export function MainContent({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
      } catch {
        // ignore
      }
    };
    sync();
    // Même onglet : storage event ne fire pas, on poll en tab focus
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // MutationObserver léger : surveille la classe de la sidebar pour
  // détecter le toggle dans le même onglet (storage event ne fire pas
  // pour le même document)
  useEffect(() => {
    const aside = document.querySelector('aside');
    if (!aside) return;
    const observer = new MutationObserver(() => {
      try {
        setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
      } catch {
        // ignore
      }
    });
    observer.observe(aside, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    // min-h-screen volontairement absent : le wrapper parent `app/app/layout.tsx`
    // l'applique déjà. Le retirer ici libère le contexte de positionnement
    // `sticky` du <header> dans TopBar (audit 2026-05-12 BUG-02).
    // ml-0 md:ml-… : la sidebar est cachée < md (Phase 2 RESP-02 — drawer mobile),
    // donc on neutralise la margin en mobile pour reprendre toute la largeur.
    <div
      className={cn(
        'flex flex-col transition-[margin-left] duration-200',
        collapsed ? 'ml-0 md:ml-[64px]' : 'ml-0 md:ml-64',
      )}
    >
      {children}
    </div>
  );
}

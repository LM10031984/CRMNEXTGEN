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
    <div
      className={cn(
        'flex flex-col min-h-screen transition-[margin-left] duration-200',
        collapsed ? 'ml-[64px]' : 'ml-64',
      )}
    >
      {children}
    </div>
  );
}

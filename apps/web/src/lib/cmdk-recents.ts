/**
 * Helpers partagés entre la CommandPalette (qui affiche les récents) et les
 * pages détail (qui les enregistrent automatiquement à la visite). Pas de
 * 'use client' ici — module pur, importable depuis client components.
 */

export type RecentKind = 'person' | 'org' | 'session' | 'product';

export interface RecentItem {
  kind: RecentKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  visitedAt: number;
}

export const RECENT_KEY = 'qualiof-cmdk-recents';
export const RECENT_MAX = 8;

export function loadRecents(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentItem[];
  } catch {
    return [];
  }
}

export function saveRecent(item: Omit<RecentItem, 'visitedAt'>) {
  if (typeof window === 'undefined') return;
  try {
    const list = loadRecents().filter((r) => !(r.kind === item.kind && r.id === item.id));
    list.unshift({ ...item, visitedAt: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // ignore
  }
}

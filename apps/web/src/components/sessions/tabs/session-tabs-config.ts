/**
 * Phase 15 Lot 1 (15-01) — Config NEUTRE des onglets fiche session.
 *
 * Module SANS `'use client'` : la liste des onglets + `coerceTab` sont utilisés
 * À LA FOIS par la page serveur (`page.tsx`, RSC) pour calculer l'onglet par
 * défaut depuis `searchParams`, ET par le conteneur client `<SessionTabs>`.
 *
 * ⚠️ Ne JAMAIS définir `coerceTab` dans `session-tabs.tsx` (qui est `'use client'`) :
 * une fonction exportée d'un module client, importée par un composant serveur,
 * devient une référence proxy non appelable → erreur runtime
 * « coerceTab is not a function ». Cf. frontière RSC Next.js 14.
 */

export const SESSION_TABS = [
  { id: 'session', label: 'Session' },
  { id: 'avant', label: 'Avant la formation' },
  { id: 'apres', label: 'Après la formation' },
  { id: 'docs', label: 'Tous les documents' },
  { id: 'agenda', label: 'Agenda' },
] as const;

export type SessionTabId = (typeof SESSION_TABS)[number]['id'];

/** Valide `raw` contre les 5 ids connus ; fallback `'session'` (onglet par défaut). */
export function coerceTab(raw: string | undefined): SessionTabId {
  return SESSION_TABS.some((t) => t.id === raw) ? (raw as SessionTabId) : 'session';
}

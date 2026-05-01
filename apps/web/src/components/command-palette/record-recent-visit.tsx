'use client';

import { useEffect } from 'react';
import { saveRecent, type RecentKind } from '@/lib/cmdk-recents';

/**
 * Composant invisible qui enregistre la visite courante dans les récents
 * Cmd+K. À placer dans chaque page détail (apprenant, organisation, session,
 * produit). Tous les "Récents" se peuplent ainsi automatiquement, peu importe
 * d'où vient l'utilisateur (clic ligne, sidebar, raccourci, etc.).
 */
export function RecordRecentVisit({
  kind,
  id,
  title,
  subtitle,
  href,
}: {
  kind: RecentKind;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
}) {
  useEffect(() => {
    saveRecent({ kind, id, title, subtitle: subtitle ?? null, href });
  }, [kind, id, title, subtitle, href]);
  return null;
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { labelForFrom, parseFrom } from '@/lib/nav/from-link';

/**
 * Lien "← Retour" qui essaie de préserver les filtres / la pagination de la
 * liste source. Stratégie : au mount, on lit document.referrer ; s'il vient
 * du même domaine ET commence par `fallbackHref` (= la liste cible), on
 * utilise le referrer entier (avec ses query params) comme href. Sinon on
 * retombe sur fallbackHref nu.
 *
 * Marche bien pour : "Retour à la liste apprenants ?q=albin&filter=ei",
 * "Retour aux sessions ?filter=this_week", etc.
 *
 * `from` (prop, alimentée par `?from=` dans l'URL) court-circuite tout ça :
 * la page d'origine s'est annoncée explicitement, on y retourne avec un
 * libellé adapté ("Retour à la session"). Nécessaire parce que le referrer
 * n'est PAS mis à jour par les navigations client de l'App Router — d'où le
 * retour sur la liste complète des apprenants quand on venait d'une session.
 */
export function BackToListLink({
  fallbackHref,
  label,
  className,
  from,
}: {
  fallbackHref: string;
  label: string;
  className?: string;
  from?: string | null;
}) {
  const origin = parseFrom(from);
  const [href, setHref] = useState<string>(origin ?? fallbackHref);

  useEffect(() => {
    if (origin) return; // origine explicite : rien à deviner
    if (typeof document === 'undefined') return;
    const ref = document.referrer;
    if (!ref) return;
    try {
      const url = new URL(ref);
      if (url.origin !== window.location.origin) return;
      // Match exact path = la liste, ou path + querystring (filtres)
      if (url.pathname === fallbackHref) {
        setHref(`${url.pathname}${url.search}`);
      }
    } catch {
      // ignore
    }
  }, [fallbackHref, origin]);

  return (
    <Link
      href={href as any}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      {origin ? labelForFrom(origin, label) : label}
    </Link>
  );
}

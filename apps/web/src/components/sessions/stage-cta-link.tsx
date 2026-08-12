'use client';

import type { ReactNode } from 'react';

/**
 * CTA de sessionStage() — rend les liens d'ancre HONNÊTES (volet 3, retour
 * Laurent 12/08 : « Valider en 1 clic ↓ ne fait rien »).
 *
 * Problème racine : les CTA `href="#step-N"` étaient des <a> natifs vers un
 * spacer invisible, au-dessus d'une étape le plus souvent REPLIÉE
 * (TimelineStep expanded=false hors étape active) → le scroll aboutissait sur
 * un header fermé : perçu « ne fait rien ».
 *
 * Comportement :
 *  - href ancre (#...) : preventDefault → scroll smooth vers la cible →
 *    CustomEvent `qualiof:goto-step` (TimelineStep correspondant S'OUVRE et
 *    pulse en ambre ~2 s) ; pour les cibles hors timeline (#section-*), flash
 *    générique (Web Animations API) sur l'élément visible.
 *  - href normal (/app/...) : navigation standard.
 */
export function StageCtaLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const isAnchor = href.startsWith('#');

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isAnchor) return; // navigation normale
    e.preventDefault();
    const el = document.querySelector<HTMLElement>(href);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Les TimelineStep écoutent cet événement : ouverture + pulse.
    window.dispatchEvent(new CustomEvent('qualiof:goto-step', { detail: { hash: href } }));
    if (!href.startsWith('#step-')) {
      // Cible hors timeline (#section-participants, #section-formateurs…) :
      // flash sur l'élément visible (le spacer est souvent vide → voisin).
      const visible = el.offsetHeight > 0 ? el : (el.nextElementSibling as HTMLElement | null);
      visible?.animate(
        [
          { boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.65)', offset: 0 },
          { boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.65)', offset: 0.6 },
          { boxShadow: '0 0 0 0 rgba(245, 158, 11, 0)', offset: 1 },
        ],
        { duration: 1800, easing: 'ease-out' },
      );
    }
  };

  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

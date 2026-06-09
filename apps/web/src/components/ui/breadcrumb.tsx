import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  /** Label affiché. Si omis, l'item est ignoré (utile pour cas conditionnels). */
  label: string;
  /** URL cible. Si omis, l'item est rendu comme texte (page actuelle). */
  href?: string;
}

/**
 * Composant fil d'Ariane réutilisable. Audit 2026-05-12 UX-10.
 *
 * Usage typique sur une page détail :
 * ```tsx
 * <Breadcrumb items={[
 *   { label: 'Apprenants', href: '/app/apprenants' },
 *   { label: 'NOM Prénom' },
 * ]} />
 * ```
 *
 * Le dernier item (sans href) est rendu en texte clair comme position courante.
 * Les items intermédiaires sont des liens cliquables.
 */
export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Fil d'Ariane"
      className={cn(
        'flex items-center gap-1 text-xs text-muted-foreground',
        className,
      )}
    >
      <ol className="flex items-center gap-1 flex-wrap">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="inline-flex items-center gap-1">
              {item.href && !isLast ? (
                <Link
                  href={item.href as any}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(isLast && 'text-foreground font-medium')}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

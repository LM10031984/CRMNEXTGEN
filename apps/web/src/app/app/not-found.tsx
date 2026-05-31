import Link from 'next/link';
import { Compass, Home } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';

/**
 * 404 pour toutes les routes /app/* introuvables (mauvais ID, route renommée,
 * etc.). Utilisée notamment par les `notFound()` dans les pages détail
 * (sessions/[id], factures/[id], apprenants/[id], organisations/[id]).
 *
 * Hors `/app/*`, c'est `app/not-found.tsx` (racine) qui prend le relais.
 */
export default function AppNotFound() {
  return (
    <div className="max-w-xl mx-auto mt-12 rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-8 text-center">
      <div className="inline-flex h-14 w-14 mb-4 rounded-2xl bg-blue-50 text-primary items-center justify-center">
        <Compass className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <h2 className="text-lg font-bold text-slate-900">Page introuvable</h2>
      <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
        Cette ressource n&apos;existe pas (ou plus). Vérifie l&apos;URL, ou
        retourne au tableau de bord pour reprendre la main.
      </p>
      <div className="mt-6">
        <Link href="/app" className={buttonStyles({ variant: 'dark' })}>
          <Home className="h-4 w-4" /> Tableau de bord
        </Link>
      </div>
    </div>
  );
}

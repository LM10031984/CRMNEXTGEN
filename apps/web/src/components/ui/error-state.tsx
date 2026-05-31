'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';

/**
 * État d'erreur partagé pour tous les error.tsx — style SaaS Premium.
 *
 * Affiche une icône cercle pastel rouge, un titre, le message d'erreur
 * (et l'optionnel `digest` Next.js pour le support), puis 2 actions :
 *  - Réessayer (`reset()` Next.js → re-render la route)
 *  - Retour (lien configurable, par défaut `/app`)
 *
 * Logge l'erreur côté client via `console.error` au mount pour Sentry-like.
 */

interface ErrorStateProps {
  title?: string;
  message?: string;
  digest?: string;
  onReset?: () => void;
  /** URL du lien de retour. Default `/app`. */
  homeHref?: string;
  /** Libellé du lien de retour. Default "Tableau de bord". */
  homeLabel?: string;
}

export function ErrorState({
  title = 'Une erreur s\'est produite',
  message,
  digest,
  onReset,
  homeHref = '/app',
  homeLabel = 'Tableau de bord',
}: ErrorStateProps) {
  return (
    <div className="max-w-md mx-auto mt-12 rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card-hover p-8">
      <div className="flex flex-col items-center text-center">
        <div className="inline-flex h-14 w-14 mb-4 rounded-2xl bg-gradient-to-br from-red-50 via-red-100/60 to-red-50 text-red-600 items-center justify-center ring-1 ring-red-100 shadow-soft">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.75} />
        </div>

        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1.5 max-w-sm leading-relaxed">
          {message || "Recharge la page ou retourne à l'accueil. Si le problème persiste, contacte le support."}
        </p>

        {digest && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 ring-1 ring-slate-200 px-2.5 py-1.5 text-[11px] font-mono text-slate-500">
            <span className="uppercase tracking-wider font-semibold text-slate-400">ID</span> {digest}
          </p>
        )}

        <div className="mt-6 flex items-center gap-2 flex-wrap justify-center">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-medium bg-slate-900 text-white shadow-card hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(15,23,42,0.35),0_0_20px_rgba(15,23,42,0.18)] hover:shadow-card-hover active:scale-[0.98] transition-all duration-200"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} /> Réessayer
            </button>
          )}
          <Link
            href={homeHref as Route}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-300 ease-out active:scale-[0.97]"
          >
            <Home className="h-3.5 w-3.5" strokeWidth={1.75} /> {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

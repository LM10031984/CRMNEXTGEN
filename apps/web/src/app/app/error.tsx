'use client';

/**
 * Error boundary global pour toutes les pages /app/* — évite le message
 * Next.js "missing required error components, refreshing..." quand une
 * Server Action ou un Server Component lève une exception.
 */

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto mt-12 rounded-2xl border border-red-200 bg-red-50/40 p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-red-900">Une erreur s'est produite</h2>
          <p className="text-sm text-red-700 mt-1">
            {error.message || 'Erreur inconnue. Recharge la page ou retourne à l\'accueil.'}
          </p>
          {error.digest && (
            <p className="text-[11px] text-red-700/70 mt-2 font-mono">code : {error.digest}</p>
          )}
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
            >
              <RefreshCw className="h-4 w-4" /> Réessayer
            </button>
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-red-200 bg-white text-sm font-medium text-red-900 hover:bg-red-100/40"
            >
              <Home className="h-4 w-4" /> Tableau de bord
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

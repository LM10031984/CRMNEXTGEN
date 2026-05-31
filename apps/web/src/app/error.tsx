'use client';

/**
 * Error boundary racine — catch-all pour toutes les routes hors `/app/*`
 * (login, pré-inscription publique, etc.). Sans ce fichier, Next.js
 * affiche la page d'erreur par défaut (peu informative + sans branding).
 */

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/error-state';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[root/error]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <ErrorState
        message={error.message || undefined}
        digest={error.digest}
        onReset={reset}
        homeHref="/login"
        homeLabel="Connexion"
      />
    </div>
  );
}

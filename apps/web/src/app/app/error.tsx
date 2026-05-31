'use client';

/**
 * Error boundary global pour toutes les pages /app/* — évite le message
 * Next.js "missing required error components, refreshing..." quand une
 * Server Action ou un Server Component lève une exception.
 *
 * Le rendu est délégué à `<ErrorState>` (composant partagé style SaaS).
 */

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/error-state';

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
    <ErrorState
      message={error.message || undefined}
      digest={error.digest}
      onReset={reset}
    />
  );
}

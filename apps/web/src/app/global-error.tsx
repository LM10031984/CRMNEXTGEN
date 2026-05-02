'use client';

/**
 * Error boundary RACINE de l'app. Capture les erreurs qui surviennent
 * dans le `RootLayout` lui-même. Dernier filet avant l'écran blanc.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 40, background: '#FEF2F2' }}>
        <div style={{ maxWidth: 560, margin: '40px auto', padding: 24, background: 'white', borderRadius: 12, border: '1px solid #FECACA' }}>
          <h1 style={{ color: '#7F1D1D', margin: 0 }}>Erreur applicative</h1>
          <p style={{ color: '#991B1B', marginTop: 8 }}>{error.message || 'Erreur inconnue.'}</p>
          {error.digest && <p style={{ fontSize: 11, color: '#9F1239', fontFamily: 'monospace', marginTop: 8 }}>code : {error.digest}</p>}
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 16, padding: '8px 14px', background: '#DC2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}

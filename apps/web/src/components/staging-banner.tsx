/**
 * Bandeau STAGING (Phase 21 APP-01, garde D-02) — Server Component (aucune
 * directive client). Rendu dans le layout RACINE : couvre /login ET /app en
 * une seule insertion. Invisible hors NEXT_PUBLIC_APP_ENV=staging.
 */
import { sharedEnv } from '@qualiof/shared/env';

export function StagingBanner() {
  if (sharedEnv.NEXT_PUBLIC_APP_ENV !== 'staging') return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 text-center text-xs font-bold py-1 tracking-wider">
      ENVIRONNEMENT DE TEST — STAGING — les documents portent un filigrane, aucun email n&apos;est
      envoyé
    </div>
  );
}

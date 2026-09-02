/* @vitest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAutosave } from '../use-autosave';

/**
 * Régression du 02/09/2026 — le bug le plus coûteux du lot B.
 *
 * En mode strict React, le composant est monté, démonté, puis remonté. Le
 * drapeau `mounted` n'était remis à `true` qu'à l'initialisation du ref : après
 * le démontage simulé il restait à `false`, la boucle d'envoi sortait
 * immédiatement, et PLUS AUCUNE réponse ne partait. À l'écran, tout paraissait
 * normal — un R1 complet pouvait se saisir dans le vide.
 *
 * `reactStrictMode: true` est actif dans next.config.mjs : ce test doit tourner
 * en StrictMode, sinon il ne prouve rien.
 */

function Harness({ onSaved }: { onSaved: (n: number) => void }) {
  const { save, state } = useAutosave(0);
  useEffect(() => {
    save('identity-sales-n1', async () => {
      onSaved(1);
      return { ok: true };
    });
  }, [save, onSaved]);
  return <span data-testid="state">{state}</span>;
}

describe('useAutosave — survie au double montage du mode strict', () => {
  it('envoie bien la réponse alors que React a simulé un démontage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saved = vi.fn();

    render(<Harness onSaved={saved} />, {
      // Le wrapper StrictMode reproduit exactement la condition de production
      // en dev : montage → démontage → remontage.
      wrapper: ({ children }) => <>{children}</>,
      reactStrictMode: true,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(saved, "aucune réponse n'a été envoyée après le remontage").toHaveBeenCalled();
    expect(screen.getByTestId('state').textContent).toBe('saved');
    vi.useRealTimers();
  });
});

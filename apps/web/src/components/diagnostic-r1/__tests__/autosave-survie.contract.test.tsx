/* @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAutosave } from '../use-autosave';

/**
 * Contrat : ce qui attend d'être enregistré SURVIT au changement de chapitre.
 *
 * C'est la contrepartie de la borne posée le 14/09 sur `flushNow`. Cesser
 * d'attendre n'a de sens que si on ne cesse pas d'écrire — sinon on aurait
 * échangé un blocage visible contre une perte silencieuse, ce qui est pire.
 *
 * `router.push` REMONTE `ChapterWorkspace`. Une file portée par le composant
 * serait donc vidée par le démontage, au moment précis où on vient de la
 * forcer à partir.
 *
 * ⚠ Mutation vérifiée : contre le `use-autosave.ts` d'origine (file et
 * minuteurs dans des `useRef`, nettoyés par le `useEffect` de démontage), ces
 * deux tests rougissent — l'écriture n'est jamais envoyée.
 */

function Harness({ onRun, debounce = 400 }: { onRun: () => void; debounce?: number }) {
  const { save } = useAutosave(debounce);
  useEffect(() => {
    save(
      'seller-meetings-per-month',
      async () => {
        onRun();
        return { ok: true };
      },
      'Combien de RDV vendeur par mois ?',
    );
  }, [save, onRun]);
  return null;
}

describe('Autosave — la file survit à la navigation', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("envoie une réponse dont le débounce n'avait pas encore expiré au démontage", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const run = vi.fn();

    const { unmount } = render(<Harness onRun={run} debounce={400} />);

    // On démonte AVANT l'expiration du débounce — c'est exactement ce que fait
    // `router.push` quand le commercial change de chapitre juste après avoir
    // tapé une valeur.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(run, 'le débounce ne doit pas encore avoir expiré').not.toHaveBeenCalled();

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(
      run,
      'la réponse tapée juste avant le changement de chapitre a été PERDUE',
    ).toHaveBeenCalledTimes(1);
  });

  it('continue de vider la file après le démontage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const run = vi.fn();

    const { unmount } = render(<Harness onRun={run} debounce={0} />);
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(run, "l'écriture en file ne doit pas mourir avec le composant").toHaveBeenCalled();
  });
});

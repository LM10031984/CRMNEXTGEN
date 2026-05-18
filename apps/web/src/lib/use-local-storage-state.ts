'use client';

/**
 * Phase 9.1 Plan 03 Task 1 — SSR-safe localStorage state.
 *
 * Cf. RESEARCH.md §"Finding 2 — useLocalStorageState".
 *
 *  - SSR / premier render : retourne `initial` (évite hydration mismatch RSC).
 *  - Client post-mount (`useEffect`) : lit `window.localStorage.getItem(key)`,
 *    rehydrate state si trouvé + valide JSON.
 *  - Setter : update state + `window.localStorage.setItem(key, JSON.stringify(next))`
 *    encapsulé en try/catch (private mode Safari ITP, quotas, etc.).
 *  - Le 3e tuple `hydrated` permet aux composants d'afficher un skeleton tant
 *    que la valeur localStorage n'est pas hydratée, si pertinent.
 */

import { useState, useEffect, useCallback } from 'react';

export function useLocalStorageState<T>(
  key: string,
  initial: T,
): [T, (next: T) => void, boolean] {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setState(JSON.parse(raw) as T);
      }
    } catch {
      // private mode / quota / JSON parse error → fallback silencieux sur initial
    }
    setHydrated(true);
  }, [key]);

  const set = useCallback(
    (next: T) => {
      setState(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore (private mode, quota exceeded, etc.)
      }
    },
    [key],
  );

  return [hydrated ? state : initial, set, hydrated];
}

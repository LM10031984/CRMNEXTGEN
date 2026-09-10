'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autosave d'une réponse de diagnostic.
 *
 * Contraintes de terrain (spec §6.3) : un R1 se fait dans une agence, au wifi
 * douteux, en face du dirigeant. D'où :
 *   • un débounce court — on enregistre en quittant le champ, pas à chaque frappe ;
 *   • un retry avec backoff sur échec réseau ;
 *   • en cas d'échec persistant, la saisie CONTINUE en mémoire et se rejoue.
 *     Rien n'est perdu, rien n'est écrit dans localStorage (contrat du projet :
 *     pas de stockage local non gaté pour de la donnée client) ;
 *   • un état visible, pour que le commercial sache où il en est sans y penser.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'retrying' | 'error';

interface PendingWrite {
  key: string;
  run: () => Promise<{ ok: boolean; error?: string }>;
}

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 600;

export function useAutosave(debounceMs = 400) {
  const [state, setState] = useState<SaveState>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // File d'attente en mémoire : une écriture par question (la dernière gagne).
  const queue = useRef(new Map<string, PendingWrite>());
  // On garde l'écriture À CÔTÉ de son minuteur : sans ça, changer de chapitre
  // annulerait les minuteurs en cours et perdrait la dernière réponse tapée.
  const timers = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; write: PendingWrite }>(),
  );
  const flushing = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    // Remettre le drapeau à true à CHAQUE montage, pas seulement à l'initialisation.
    // En mode strict React (dev), le composant est monté, démonté puis remonté :
    // sans cette ligne, le démontage simulé laisse `mounted` à false pour de bon
    // et plus aucune réponse ne part — un R1 entier saisi dans le vide.
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const { timer } of timers.current.values()) clearTimeout(timer);
    };
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queue.current.size > 0 && mounted.current) {
        const [key, write] = [...queue.current.entries()][0]!;
        queue.current.delete(key);
        if (mounted.current) setPendingCount(queue.current.size);

        let ok = false;
        let error: string | undefined;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt += 1) {
          if (mounted.current) setState(attempt === 1 ? 'saving' : 'retrying');
          try {
            const r = await write.run();
            ok = r.ok;
            error = r.error;
            // Une erreur métier (réponse invalide) ne se rejoue pas : la
            // réessayer dix fois ne la rendra pas valide.
            if (!ok && r.error) break;
          } catch {
            error = 'Réseau indisponible';
          }
          if (!ok && attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)));
          }
        }

        if (!mounted.current) return;
        if (ok) {
          setState('saved');
          setLastError(null);
        } else {
          setState('error');
          setLastError(error ?? 'Enregistrement impossible');
        }
      }
    } finally {
      flushing.current = false;
    }
  }, []);

  /** Programme l'enregistrement d'une réponse ; la dernière valeur écrase la précédente. */
  const save = useCallback(
    (key: string, run: () => Promise<{ ok: boolean; error?: string }>) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing.timer);
      const write: PendingWrite = { key, run };
      const timer = setTimeout(() => {
        timers.current.delete(key);
        queue.current.set(key, write);
        setPendingCount(queue.current.size);
        void flush();
      }, debounceMs);
      timers.current.set(key, { timer, write });
    },
    [debounceMs, flush],
  );

  /** Force l'écriture immédiate de tout ce qui attend (changement de chapitre). */
  const flushNow = useCallback(async () => {
    for (const [key, { timer, write }] of timers.current.entries()) {
      clearTimeout(timer);
      timers.current.delete(key);
      queue.current.set(key, write); // on ne jette pas ce qui attendait
    }
    setPendingCount(queue.current.size);
    await flush();
  }, [flush]);

  return { state, save, flushNow, pendingCount, lastError };
}

'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Autosave d'une réponse de diagnostic.
 *
 * Contraintes de terrain (spec §6.3) : un R1 se fait dans une agence, au wifi
 * douteux, en face du dirigeant. D'où :
 *   • un débounce court — on enregistre en quittant le champ, pas à chaque frappe ;
 *   • un retry avec backoff sur échec réseau ;
 *   • en cas d'échec persistant, la réponse est NOMMÉE à l'écran et rejouable.
 *     Rien n'est perdu, rien n'est écrit dans localStorage (contrat du projet :
 *     pas de stockage local non gaté pour de la donnée client) ;
 *   • un état visible, pour que le commercial sache où il en est sans y penser.
 *
 * ── Pourquoi la file vit HORS du composant (14/09/2026) ─────────────────────
 *
 * `router.push` remonte `ChapterWorkspace` à chaque changement de chapitre. Une
 * file portée par le composant perdrait donc, en changeant de chapitre,
 * exactement ce qu'on venait de forcer à partir — le pire moment possible.
 *
 * La file, ses minuteurs et son état vivent au niveau du MODULE : ce qui attend
 * continue de partir pendant et après la navigation. C'est ce qui permet de
 * BORNER l'attente sans rien perdre : on cesse d'attendre, on ne cesse pas
 * d'écrire.
 *
 * Effet de bord bienvenu : le drapeau `mounted` disparaît, et avec lui la
 * régression du 02/09 (démontage simulé du mode strict laissant le drapeau à
 * false pour de bon). L'état n'est plus lié au cycle de vie d'un composant.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'retrying' | 'error';

interface PendingWrite {
  key: string;
  /** Nom lisible de la réponse — pour pouvoir DIRE ce qui n'est pas parti. */
  label: string;
  run: () => Promise<{ ok: boolean; error?: string }>;
}

export interface FailedWrite {
  key: string;
  label: string;
  error: string;
  /** Une erreur métier ne se rejoue pas ; une panne réseau, si. */
  retryable: boolean;
}

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 600;

/**
 * Borne d'attente d'un `flushNow`, en millisecondes.
 *
 * Elle peut être COURTE, et c'est le point : dépasser la borne n'abandonne pas
 * l'écriture, la file continue de se vider en fond. La borne ne règle que la
 * durée pendant laquelle la NAVIGATION attend. 2 s laisse passer le cas sain
 * (100–400 ms, l'écran affiche « Enregistré » avant de basculer) et empêche
 * qu'une lenteur ressemble à un bouton mort.
 */
export const FLUSH_TIMEOUT_MS = 2_000;

// ─────────────────────────────────────────────────────────────────────────────
// L'état partagé — un seul par onglet
// ─────────────────────────────────────────────────────────────────────────────

const queue = new Map<string, PendingWrite>();
const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; write: PendingWrite }>();
const failures = new Map<string, FailedWrite & { write: PendingWrite }>();

let draining = false;
let drainDone: Promise<void> | null = null;

const listeners = new Set<() => void>();

export interface AutosaveSnapshot {
  state: SaveState;
  pendingCount: number;
  lastError: string | null;
  /** Les réponses qui ne sont PAS parties, nommées. */
  failed: FailedWrite[];
}

const EMPTY_FAILED: FailedWrite[] = [];
let snapshot: AutosaveSnapshot = {
  state: 'idle',
  pendingCount: 0,
  lastError: null,
  failed: EMPTY_FAILED,
};

function publish(next: Partial<Pick<AutosaveSnapshot, 'state' | 'lastError'>> = {}) {
  // `useSyncExternalStore` compare par référence : on ne republie qu'un objet
  // neuf, et on garde une liste vide STABLE pour ne pas rendre en boucle.
  snapshot = {
    state: next.state ?? snapshot.state,
    lastError: next.lastError !== undefined ? next.lastError : snapshot.lastError,
    pendingCount: queue.size + timers.size,
    failed:
      failures.size === 0
        ? EMPTY_FAILED
        : [...failures.values()].map(({ key, label, error, retryable }) => ({
            key,
            label,
            error,
            retryable,
          })),
  };
  for (const l of listeners) l();
}

/**
 * Vide la file, une écriture à la fois.
 *
 * Rend TOUJOURS la promesse du vidage en cours — jamais `undefined`. C'est la
 * correction du comportement erratique du 14/09 : l'ancien garde
 * `if (flushing.current) return;` faisait rendre la main INSTANTANÉMENT au
 * deuxième appel, si bien que le premier clic restait bloqué pendant que le
 * deuxième naviguait. Un appelant qui attend doit attendre le vrai travail.
 */
function drain(): Promise<void> {
  if (draining && drainDone) return drainDone;
  draining = true;
  drainDone = (async () => {
    try {
      while (queue.size > 0) {
        const [key, write] = [...queue.entries()][0]!;
        queue.delete(key);
        publish();

        let ok = false;
        let error: string | undefined;
        let retryable = true;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt += 1) {
          publish({ state: attempt === 1 ? 'saving' : 'retrying' });
          try {
            const r = await write.run();
            ok = r.ok;
            error = r.error;
            // Une erreur métier (réponse invalide) ne se rejoue pas : la
            // réessayer dix fois ne la rendra pas valide.
            if (!ok && r.error) {
              retryable = false;
              break;
            }
          } catch {
            error = 'Réseau indisponible';
          }
          if (!ok && attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)));
          }
        }

        if (ok) {
          failures.delete(key);
          publish({ state: failures.size > 0 ? 'error' : 'saved', lastError: null });
        } else {
          // On ne JETTE pas ce qui a échoué : on le garde nommé et rejouable.
          // L'ancien code le supprimait de la file sans le réinscrire nulle
          // part — le commentaire promettait un rejeu qui n'existait pas.
          const msg = error ?? 'Enregistrement impossible';
          failures.set(key, { key, label: write.label, error: msg, retryable, write });
          publish({ state: 'error', lastError: msg });
        }
      }
    } finally {
      draining = false;
      drainDone = null;
    }
  })();
  return drainDone;
}

function promoteTimersToQueue() {
  for (const [key, { timer, write }] of timers.entries()) {
    clearTimeout(timer);
    timers.delete(key);
    queue.set(key, write); // on ne jette pas ce qui attendait
  }
}

/**
 * Force l'écriture immédiate de tout ce qui attend — SANS PROMESSE ILLIMITÉE.
 *
 * Rend `true` si tout est parti dans la borne, `false` sinon. Dans les deux cas
 * la file continue de se vider : `false` veut dire « n'attends plus », pas
 * « c'est perdu ». L'appelant navigue, et l'écran dit où en est l'écriture.
 */
export async function flushNowShared(timeoutMs = FLUSH_TIMEOUT_MS): Promise<boolean> {
  promoteTimersToQueue();
  publish();
  if (queue.size === 0 && !draining) return true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      drain().then(() => true as const),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Rejoue ce qui avait échoué pour une raison réseau. */
export function retryFailedShared(): Promise<boolean> {
  for (const f of [...failures.values()]) {
    if (!f.retryable) continue;
    failures.delete(f.key);
    queue.set(f.key, f.write);
  }
  publish({ state: 'saving', lastError: null });
  return flushNowShared();
}

/**
 * Remet la file à zéro. Utilisé par les tests — l'état étant au niveau du
 * module, il survivrait sinon d'un cas à l'autre — et disponible pour une
 * déconnexion, où laisser des écritures d'un autre utilisateur serait un
 * défaut de cloisonnement.
 */
export function resetAutosaveShared() {
  for (const { timer } of timers.values()) clearTimeout(timer);
  timers.clear();
  queue.clear();
  failures.clear();
  draining = false;
  drainDone = null;
  snapshot = { state: 'idle', pendingCount: 0, lastError: null, failed: EMPTY_FAILED };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getSnapshot = () => snapshot;

// ─────────────────────────────────────────────────────────────────────────────

export function useAutosave(debounceMs = 400) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  /** Programme l'enregistrement d'une réponse ; la dernière valeur écrase la précédente. */
  const save = useCallback(
    (key: string, run: () => Promise<{ ok: boolean; error?: string }>, label?: string) => {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing.timer);
      const write: PendingWrite = { key, label: label ?? key, run };
      const timer = setTimeout(() => {
        timers.delete(key);
        queue.set(key, write);
        publish();
        void drain();
      }, debounceMs);
      timers.set(key, { timer, write });
      publish();
    },
    [debounceMs],
  );

  const flushNow = useCallback(
    (timeoutMs?: number) => flushNowShared(timeoutMs),
    [],
  );
  const retryFailed = useCallback(() => retryFailedShared(), []);

  return {
    state: snap.state,
    pendingCount: snap.pendingCount,
    lastError: snap.lastError,
    failed: snap.failed,
    save,
    flushNow,
    retryFailed,
  };
}

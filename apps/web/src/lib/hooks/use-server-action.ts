'use client';

/**
 * Hook partagé `useServerAction` (P3.1).
 *
 * Encapsule le pattern devenu omniprésent dans nos composants :
 *   - `useTransition` pour gérer le pending + ne pas freezer l'UI ;
 *   - `useOptimistic` pour une réponse < 16 ms côté user (rollback auto
 *     si la server action retourne `{ ok: false }`) ;
 *   - `router.refresh()` pour revalider le segment courant ;
 *   - `toast.success` / `toast.error` (Sonner) pour le feedback.
 *
 * Le contrat des server actions reste `{ ok: true } | { ok: false; error: string }`.
 * Le hook NE LANCE JAMAIS — il convertit les erreurs en toast pour rester
 * compatible avec le pattern UI du repo (invariant master prompt §2).
 *
 * Deux modes d'usage :
 *
 * 1. **Mode optimiste** (lead-status-select, quote-recipient-editor…) :
 *    on passe `optimisticInitial` + `optimisticReducer`. Le hook expose
 *    `optimistic` qui est la valeur affichée pendant la transition.
 *    Sur succès, l'invalidation re-render avec la vraie valeur serveur.
 *    Sur erreur, useOptimistic rollback automatiquement (React 18+).
 *
 * 2. **Mode simple** (edit-participant-button, edit-session-details-dialog…) :
 *    pas d'optimisticReducer. On utilise juste le pending + toast + refresh.
 */

import { useTransition, useOptimistic, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

interface UseServerActionOptionsBase<TArgs extends unknown[], TResult> {
  /** Server action — doit retourner le contrat `{ ok, error }`. */
  action: (...args: TArgs) => Promise<ActionResult<TResult>>;
  /**
   * Message toast succès. Si `false`, aucun toast. Si fonction, calculé
   * à partir des args utilisés pour l'appel.
   */
  successMessage?: string | ((args: TArgs) => string) | false;
  /**
   * Appelle `router.refresh()` après succès. Défaut: `true`.
   * Mettre `false` quand le composant gère sa propre revalidation
   * (par ex. après fermeture de modale).
   */
  revalidate?: boolean;
  /** Callback de succès supplémentaire (fermeture de dialog, reset form). */
  onSuccess?: (result: ActionResult<TResult> & { ok: true }, args: TArgs) => void;
}

interface UseServerActionOptionsWithOptimistic<
  TArgs extends unknown[],
  TResult,
  TState,
> extends UseServerActionOptionsBase<TArgs, TResult> {
  /** État optimiste initial (typiquement la valeur courante affichée). */
  optimisticInitial: TState;
  /** Calcul de l'état optimiste à partir des args. */
  optimisticReducer: (current: TState, args: TArgs) => TState;
}

export function useServerAction<TArgs extends unknown[], TResult = void>(
  opts: UseServerActionOptionsBase<TArgs, TResult>,
): {
  execute: (...args: TArgs) => void;
  pending: boolean;
};

export function useServerAction<
  TArgs extends unknown[],
  TResult,
  TState,
>(
  opts: UseServerActionOptionsWithOptimistic<TArgs, TResult, TState>,
): {
  execute: (...args: TArgs) => void;
  pending: boolean;
  optimistic: TState;
};

export function useServerAction<TArgs extends unknown[], TResult, TState>(
  opts:
    | UseServerActionOptionsBase<TArgs, TResult>
    | UseServerActionOptionsWithOptimistic<TArgs, TResult, TState>,
): {
  execute: (...args: TArgs) => void;
  pending: boolean;
  optimistic?: TState;
} {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Le hook useOptimistic doit TOUJOURS être appelé (règle des hooks).
  // Si l'usage ne fournit pas d'optimisticReducer, on utilise un état
  // factice et on ne l'expose pas dans le retour.
  const hasOptimistic = 'optimisticInitial' in opts;
  const initial = hasOptimistic
    ? (opts as UseServerActionOptionsWithOptimistic<TArgs, TResult, TState>)
        .optimisticInitial
    : (null as unknown as TState);
  const reducer = hasOptimistic
    ? (opts as UseServerActionOptionsWithOptimistic<TArgs, TResult, TState>)
        .optimisticReducer
    : null;

  const [optimistic, applyOptimistic] = useOptimistic(
    initial,
    (state: TState, newArgs: TArgs) => (reducer ? reducer(state, newArgs) : state),
  );

  const execute = useCallback(
    (...args: TArgs) => {
      startTransition(async () => {
        if (reducer) applyOptimistic(args);
        const result = await opts.action(...args);
        if (result.ok) {
          if (opts.successMessage !== false) {
            const msg =
              typeof opts.successMessage === 'function'
                ? opts.successMessage(args)
                : opts.successMessage;
            if (msg) toast.success(msg);
          }
          if (opts.revalidate !== false) router.refresh();
          opts.onSuccess?.(result as ActionResult<TResult> & { ok: true }, args);
        } else {
          toast.error(result.error);
          // useOptimistic rollback automatique : on n'a rien à faire,
          // la valeur affichée repassera à l'initial dès que la transition se ferme.
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.action, opts.revalidate, opts.successMessage, opts.onSuccess, router],
  );

  return hasOptimistic
    ? { execute, pending, optimistic }
    : { execute, pending };
}

/**
 * Helper unifié pour les Server Actions (Sprint 3 — Robustesse).
 *
 * Audit Sprint 3 (cf docs/SPRINT-3-ROBUSTESSE.md) : sur 44 server actions,
 *  - 64% n'ont pas de validation Zod runtime
 *  - 50% n'ont pas de RBAC explicite
 *  - 39% n'ont pas de transaction Prisma pour les écritures multiples
 *  - Le boilerplate (validateRequest + requireRole + try/catch + Zod.parse +
 *    log + revalidatePath) est dupliqué partout, souvent partiellement.
 *
 * `createAction` standardise tout ça en un seul wrapper :
 *
 *   export const myAction = createAction({
 *     schema: MyInputSchema,           // Zod obligatoire pour mutations
 *     roles: ['ADMIN', 'MANAGER'],     // omettre = juste auth (déconseillé pour mutations)
 *     revalidate: ['/app/foo'],        // chemins à revalidater en cas de succès
 *     async handler({ user, input, log }) {
 *       // user : Lucia.User (déjà tenant-scopé)
 *       // input : type inféré du schema Zod
 *       // log : childLogger avec scope = nom de l'action (auto)
 *       return { ok: true };
 *     },
 *   });
 *
 * Avantages :
 *   - 1 ligne d'auth/RBAC garantie (impossible d'oublier)
 *   - 1 ligne de validation Zod garantie sur l'input
 *   - Logs structurés automatiques (action.start / action.end avec durée)
 *   - Format de réponse uniforme `{ ok, error?, data? }` — front consume facile
 *   - revalidatePath centralisé
 *   - Erreurs RBAC / Zod retournées proprement sans throw qui casse Next
 */

import { revalidatePath } from 'next/cache';
import type { ZodTypeAny, z } from 'zod';
import type { User as LuciaUser } from 'lucia';
import type { UserRole } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { childLogger } from '@/lib/logger';
import type { Logger } from 'pino';

export type ActionResult<TData = void> =
  | { ok: true; data: TData extends void ? undefined : TData }
  | { ok: false; error: string; code?: ActionErrorCode };

export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

export interface ActionHandlerContext<TInput> {
  user: LuciaUser;
  input: TInput;
  log: Logger;
}

export interface CreateActionOptions<TSchema extends ZodTypeAny, TData> {
  /** Nom de l'action — utilisé comme scope du logger + identifiant log. */
  name: string;
  /** Schéma Zod obligatoire pour les mutations (omettre = action sans input). */
  schema?: TSchema;
  /** Rôles autorisés. Omettre = juste authentifié (à éviter pour les mutations). */
  roles?: UserRole[];
  /** Chemins Next.js à revalidater en cas de succès. */
  revalidate?: string[];
  /** Handler principal. Reçoit `user`, `input` (typé Zod), `log`. */
  handler: (
    ctx: ActionHandlerContext<TSchema extends ZodTypeAny ? z.infer<TSchema> : undefined>,
  ) => Promise<TData> | TData;
}

/**
 * Factory de Server Action. Retourne une fonction qui prend l'input,
 * valide auth + RBAC + Zod, exécute le handler, et renvoie un résultat
 * uniforme.
 *
 * Overloads : sans `schema` → action sans input (`action()`). Avec `schema`
 * → action typée Zod (`action(input)`).
 */
export function createAction<TData = void>(
  opts: Omit<CreateActionOptions<ZodTypeAny, TData>, 'schema'> & { schema?: undefined },
): () => Promise<ActionResult<TData>>;
export function createAction<TSchema extends ZodTypeAny, TData = void>(
  opts: CreateActionOptions<TSchema, TData> & { schema: TSchema },
): (input: z.infer<TSchema>) => Promise<ActionResult<TData>>;
export function createAction<TSchema extends ZodTypeAny, TData = void>(
  opts: CreateActionOptions<TSchema, TData>,
): (input?: z.infer<TSchema>) => Promise<ActionResult<TData>> {
  const log = childLogger(`action:${opts.name}`);

  return (async (rawInput?: unknown) => {
    const start = Date.now();

    // 1. Auth
    const { user } = await validateRequest();
    if (!user) {
      log.warn('action.unauthenticated');
      return { ok: false, error: 'Non authentifié.', code: 'UNAUTHENTICATED' };
    }

    // 2. RBAC (si roles fourni)
    if (opts.roles && !opts.roles.includes(user.role as UserRole)) {
      log.warn(
        { userId: user.id, role: user.role, required: opts.roles },
        'action.forbidden',
      );
      return {
        ok: false,
        error: 'Accès refusé pour ce rôle.',
        code: 'FORBIDDEN',
      };
    }

    // 3. Validation Zod (si schema fourni)
    let input: unknown;
    if (opts.schema) {
      const parsed = opts.schema.safeParse(rawInput);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        const path = firstIssue?.path.join('.') ?? '?';
        const msg = firstIssue?.message ?? 'invalide';
        log.warn(
          { issues: parsed.error.issues.slice(0, 3), userId: user.id },
          'action.validation',
        );
        return {
          ok: false,
          error: `Donnée invalide (${path}) : ${msg}`,
          code: 'VALIDATION',
        };
      }
      input = parsed.data;
    } else {
      input = undefined;
    }

    // 4. Handler avec log start/end + try/catch global
    log.info({ userId: user.id }, 'action.start');
    try {
      const data = await opts.handler({
        user,
        input: input as never,
        log,
      });

      // 5. Revalidation Next.js (best-effort, on logge si ça crashe mais on
      // ne renvoie pas d'erreur — l'action est déjà réussie).
      if (opts.revalidate) {
        for (const path of opts.revalidate) {
          try {
            revalidatePath(path);
          } catch (e) {
            log.warn(
              { path, err: { message: (e as Error).message } },
              'action.revalidate.failed',
            );
          }
        }
      }

      const durationMs = Date.now() - start;
      log.info({ durationMs }, 'action.ok');
      return {
        ok: true,
        data: (data ?? undefined) as TData extends void ? undefined : TData,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);

      // Erreurs métier "attendues" : on les remonte au caller avec un code.
      if (err instanceof ActionError) {
        log.warn(
          { durationMs, code: err.code, userId: user.id, message },
          'action.error.business',
        );
        return { ok: false, error: err.message, code: err.code };
      }

      // Erreurs techniques imprévues : on logge le stack mais on ne le
      // remonte PAS au client (sécurité — éviter de leak des paths internes).
      log.error(
        { durationMs, err: { message, stack: err instanceof Error ? err.stack : undefined } },
        'action.error.internal',
      );
      return {
        ok: false,
        error: 'Une erreur technique est survenue. Réessaie ou contacte le support.',
        code: 'INTERNAL',
      };
    }
  }) as (input?: z.infer<TSchema>) => Promise<ActionResult<TData>>;
}

/**
 * À throw dans un `handler` pour remonter une erreur métier propre
 * (qui sera visible côté client avec le bon `code`).
 *
 * Exemple :
 *   if (existing) throw new ActionError('Email déjà utilisé', 'CONFLICT');
 */
export class ActionError extends Error {
  constructor(
    message: string,
    public readonly code: ActionErrorCode = 'INTERNAL',
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

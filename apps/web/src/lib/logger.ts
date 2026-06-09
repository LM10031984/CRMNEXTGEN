/**
 * Logger structuré (Sprint 2 — Observabilité).
 *
 * Pino choisi pour : JSON natif (parsable par n'importe quel agrégateur),
 * très rapide (~5× plus vite que winston en bench), API simple, support
 * AsyncLocalStorage natif pour corrélation request-id.
 *
 * En dev : `pino-pretty` pour des logs humains lisibles dans le terminal.
 * En prod : JSON pur sur stdout (Vercel, Docker logs, fluent-bit, etc.).
 *
 * Convention :
 *   logger.info({ requestId, userId, ... }, 'message human-readable')
 *
 * Les champs structurés DOIVENT être dans l'objet, jamais interpolés
 * dans la string — sinon on perd la capacité de filtrer/agreger.
 */

import pino, { type LoggerOptions } from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

const IS_PROD = process.env.NODE_ENV === 'production';
const LEVEL = process.env.LOG_LEVEL ?? (IS_PROD ? 'info' : 'debug');

/**
 * Contexte de requête propagé via AsyncLocalStorage. Toutes les
 * fonctions appelées dans la même chaîne async voient le même contexte
 * (request-id, userId, tenantId), sans avoir à le passer en paramètre.
 *
 * Activé par le middleware Next.js (ou par les workers BullMQ qui
 * appellent `runWithContext`).
 */
export interface LogContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  /** Pour les workers BullMQ : identifiant du job. */
  jobId?: string;
  /** Pour les workers BullMQ : nom de la queue. */
  queueName?: string;
}

const contextStorage = new AsyncLocalStorage<LogContext>();

/**
 * Exécute `fn` dans un contexte de log. Tous les appels au logger à
 * l'intérieur de `fn` (même imbriqués async) verront automatiquement
 * `requestId`, `userId`, etc. dans leurs logs.
 */
export function runWithContext<T>(ctx: LogContext, fn: () => T): T {
  return contextStorage.run(ctx, fn);
}

/**
 * Récupère le contexte courant (ou null si on est hors contexte —
 * par ex. un appel direct depuis un Server Component sans middleware).
 */
export function getContext(): LogContext | null {
  return contextStorage.getStore() ?? null;
}

/**
 * Options Pino partagées. En dev on branche un transport `pino-pretty`
 * pour formater joliment. En prod : JSON pur, pas de transport.
 */
const baseOptions: LoggerOptions = {
  level: LEVEL,
  // Le `mixin` est appelé à chaque log et permet d'ajouter automatiquement
  // les champs du contexte AsyncLocalStorage. C'est le pattern recommandé
  // par pino pour la corrélation transverse.
  mixin: () => {
    const ctx = getContext();
    if (!ctx) return {};
    return {
      requestId: ctx.requestId,
      ...(ctx.userId && { userId: ctx.userId }),
      ...(ctx.tenantId && { tenantId: ctx.tenantId }),
      ...(ctx.jobId && { jobId: ctx.jobId }),
      ...(ctx.queueName && { queueName: ctx.queueName }),
    };
  },
  // Champs masqués : on n'écrit JAMAIS de PII en clair, même si le code
  // appelant oublie de filtrer. Le mot-clé `[Redacted]` apparaîtra à la place.
  redact: {
    paths: [
      'password',
      'hashedPwd',
      'AUTH_SECRET',
      'DATA_ENCRYPTION_KEY',
      'MISTRAL_API_KEY',
      'ANTHROPIC_API_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SMTP_PASS',
      'socialSecurityNb',
      // Headers cookies (sessions Lucia)
      'headers.cookie',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[Redacted]',
  },
  // Timestamp ISO (plus lisible que l'epoch ms par défaut de pino)
  timestamp: pino.stdTimeFunctions.isoTime,
};

/**
 * En prod : JSON pur sur stdout (pas de transport).
 * En dev : pino-pretty branché EN STREAM DIRECT (pas en transport worker).
 *
 * Pourquoi pas `pino.transport({ target: 'pino-pretty' })` ? Le transport
 * spawne un worker thread (`thread-stream`). Sur Next.js dev, à chaque
 * recompilation HMR le worker est tué — et le prochain `log.info()`
 * throw `Error: the worker has exited` (uncaughtException qui crash la
 * page). Le stream direct n'a pas ce problème : un peu plus lent mais
 * rock solid en dev.
 */
const prettyStream = IS_PROD
  ? undefined
  : (() => {
      // Require dynamique pour ne pas embarquer pino-pretty en prod bundle.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pretty = require('pino-pretty') as typeof import('pino-pretty').default;
      return pretty({
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: false,
      });
    })();

export const logger = prettyStream ? pino(baseOptions, prettyStream) : pino(baseOptions);

/**
 * Helper : créer un logger enfant avec un préfixe de scope (module name).
 * Utile dans les modules métier : `const log = childLogger('closure-worker')`.
 *
 * Les logs auront automatiquement `scope: 'closure-worker'` en plus du
 * contexte AsyncLocalStorage.
 */
export function childLogger(scope: string): pino.Logger {
  return logger.child({ scope });
}

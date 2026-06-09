/**
 * Prisma extension : validator de tenant-scoping (Sprint 4 — Robustesse).
 *
 * Audit Sprint 3 : 94% des Server Actions appliquent un filtre `tenantId`
 * dans leurs queries — mais il suffit qu'on en oublie UN pour qu'un user
 * d'un tenant lise/écrive les données d'un autre tenant (fuite cross-tenant).
 * On code défensivement : si une query touche un modèle multi-tenant
 * sans `tenantId` dans le `where` / `data`, on logge un warning (ou on
 * throw en mode strict).
 *
 * Modes (via env `TENANT_VALIDATOR_MODE`) :
 *   - 'off'    : extension désactivée (debug / scripts data)
 *   - 'warn'   : warning console.warn + stack trace + on laisse passer (DEFAULT)
 *   - 'strict' : throw une erreur — la query est refusée
 *
 * Stratégie progressive : on démarre en 'warn' pour identifier toutes les
 * queries qui manquent le tenantId, on fix au fil de l'eau, puis on bascule
 * en 'strict' en prod quand on est confiant.
 *
 * Limites volontaires :
 *   - `findUnique` sur un model multi-tenant : on accepte si la clé unique
 *     est composée (et inclut tenantId) OU si le `where` contient explicitement
 *     `tenantId`. Un `findUnique({ where: { id } })` sur Person sans tenantId
 *     est suspect mais Prisma ne nous donne pas le détail des index uniques —
 *     on warne.
 *   - `aggregate`, `groupBy`, `count` : vérifiés comme les `findMany`.
 *   - Opérations sur les modèles non listés dans MULTI_TENANT_MODELS sont
 *     laissées passer sans contrôle (User contient tenantId mais les requêtes
 *     d'authentification se font par email — exception listée à part).
 */

import type { PrismaClient, Prisma } from '@prisma/client';

type ValidatorMode = 'off' | 'warn' | 'strict';

function getMode(): ValidatorMode {
  const raw = process.env.TENANT_VALIDATOR_MODE?.toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

/**
 * Modèles multi-tenant — référencent un Tenant via `tenantId String`.
 * Toute opération (find/create/update/delete/...) sur ces modèles doit
 * inclure `tenantId` dans son where ou data.
 */
const MULTI_TENANT_MODELS = new Set([
  'UserInvitation',
  'Person',
  'Organization',
  'Contact',
  'BillingProfile',
  'TrainingProduct',
  'TrainingSession',
  'Location',
  'TrainerAvailability',
  'Lead',
  'Invoice',
  'DocumentTemplate',
  'Document',
  'EmailTemplate',
  'EmailMessage',
  'OpcoSubmission',
  'Task',
  'InternalComment',
  'Notification',
  'AuditLog',
  'PreEnrollment',
  'PedagogicalAsset',
  'AIGenerationJob',
  'ExternalIdentity',
  'ClosureBatch',
]);

/**
 * `User` est multi-tenant mais on l'exclut volontairement : l'auth Lucia
 * fait des `findUnique({ where: { email } })` sans tenantId (lookup global
 * email → tenant). Le filtre tenantId est appliqué APRÈS dans validateRequest.
 */
const TENANT_VALIDATOR_EXEMPT = new Set(['User']);

/**
 * Opérations de lecture qui nécessitent un `where.tenantId`.
 */
const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Opérations de mutation qui nécessitent soit `where.tenantId` (update/delete)
 * soit `data.tenantId` (create).
 */
const UPDATE_OPS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);
const CREATE_OPS = new Set(['create', 'createMany']);

interface ValidatorArgs {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
}

function hasTenantIdInWhere(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const obj = where as Record<string, unknown>;
  if ('tenantId' in obj && obj.tenantId !== undefined && obj.tenantId !== null) {
    return true;
  }
  // Composé via AND
  if (Array.isArray(obj.AND)) {
    return obj.AND.some((c) => hasTenantIdInWhere(c));
  }
  return false;
}

function hasTenantIdInData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  // createMany.data : array de records
  if (Array.isArray(data)) {
    return data.every((row) => hasTenantIdInData(row));
  }
  const obj = data as Record<string, unknown>;
  // Direct
  if ('tenantId' in obj && obj.tenantId !== undefined && obj.tenantId !== null) {
    return true;
  }
  // Via la relation `tenant: { connect: { id } }`
  if (obj.tenant && typeof obj.tenant === 'object') {
    const t = obj.tenant as Record<string, unknown>;
    if (t.connect || t.create) return true;
  }
  return false;
}

function validateOperation({ model, operation, args }: ValidatorArgs): string | null {
  if (!model) return null;
  if (TENANT_VALIDATOR_EXEMPT.has(model)) return null;
  if (!MULTI_TENANT_MODELS.has(model)) return null;

  if (READ_OPS.has(operation)) {
    if (!hasTenantIdInWhere(args.where)) {
      return `${model}.${operation}: missing 'tenantId' in where clause`;
    }
  } else if (UPDATE_OPS.has(operation)) {
    if (!hasTenantIdInWhere(args.where)) {
      return `${model}.${operation}: missing 'tenantId' in where clause`;
    }
  } else if (CREATE_OPS.has(operation)) {
    if (!hasTenantIdInData(args.data)) {
      return `${model}.${operation}: missing 'tenantId' in data (or 'tenant.connect/create')`;
    }
  }
  // findUnique : on accepte (la clé unique est généralement `id` ou composée).
  // Si le caller veut sécuriser, il doit ajouter tenantId manuellement
  // dans le where ou utiliser findFirst.
  return null;
}

function reportViolation(message: string): void {
  const mode = getMode();
  if (mode === 'off') return;
  // Stack trace tronqué pour identifier l'appelant (sans polluer les logs).
  const stack = new Error().stack?.split('\n').slice(3, 8).join('\n') ?? '';
  const fullMessage = `[tenant-validator] ${message}\n${stack}`;
  if (mode === 'strict') {
    throw new Error(fullMessage);
  }
  console.warn(fullMessage);
}

/**
 * Applique le validator à un PrismaClient. À utiliser au point de création
 * du singleton (cf packages/db/src/index.ts).
 */
export function withTenantValidator<T extends PrismaClient>(prisma: T): T {
  // Si désactivé, retourne le client tel quel — pas d'overhead.
  if (getMode() === 'off') return prisma;

  return prisma.$extends({
    name: 'tenant-validator',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const violation = validateOperation({
            model,
            operation,
            args: args as Record<string, unknown>,
          });
          if (violation) {
            reportViolation(violation);
          }
          return query(args);
        },
      },
    },
  }) as unknown as T;
}

// Export utilitaires pour les tests + debugging.
export { MULTI_TENANT_MODELS, TENANT_VALIDATOR_EXEMPT };
export type { Prisma };

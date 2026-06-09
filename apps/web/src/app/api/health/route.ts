/**
 * Endpoint /api/health (Sprint 2 — Observabilité).
 *
 * Vérifie l'état des dépendances externes pour usage en monitoring :
 *   - Liveness : "le process tourne" (toujours 200 si Next sert la route)
 *   - Readiness : "le process peut servir du trafic" → checks db + redis +
 *     storage + mistral (selon ?check=<liste>).
 *
 * Format :
 *   GET /api/health             → liveness rapide (db ping uniquement)
 *   GET /api/health?full=1      → tous les checks
 *   GET /api/health?check=db,redis → checks sélectifs
 *
 * Réponse :
 *   {
 *     ok: boolean,
 *     status: 'healthy' | 'degraded' | 'unhealthy',
 *     uptime: <seconds>,
 *     checks: { db: {...}, redis: {...}, ... }
 *   }
 *
 * Code HTTP :
 *   200 si ok=true
 *   503 si ok=false (au moins un check critique a échoué)
 *
 * Pas d'auth — c'est volontaire (le check doit être appelable par un
 * load balancer / kubelet / uptime monitor sans cookie). Aucune info
 * sensible n'est exposée (juste up/down + latence ms).
 */

import { NextResponse, type NextRequest } from 'next/server';
import IORedis from 'ioredis';
import { prisma } from '@qualiof/db';
import { childLogger } from '@/lib/logger';
import { withApiLogging } from '@/lib/with-logging';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const log = childLogger('health');

const START_TIME = Date.now();

type CheckResult =
  | { ok: true; latencyMs: number }
  | { ok: false; latencyMs: number; error: string };

async function checkDb(): Promise<CheckResult> {
  const start = Date.now();
  try {
    // Query la plus légère possible : `SELECT 1` court-circuite tout ORM.
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : 'unknown db error',
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  let client: IORedis | null = null;
  try {
    client = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      return { ok: false, latencyMs: Date.now() - start, error: `unexpected ping reply: ${pong}` };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : 'unknown redis error',
    };
  } finally {
    if (client) {
      // Disconnect en fire-and-forget — on a déjà notre résultat.
      void client.quit().catch(() => {});
    }
  }
}

async function checkStorage(): Promise<CheckResult> {
  const start = Date.now();
  // On essaye d'atteindre l'endpoint S3/MinIO. Pas d'opération destructive,
  // juste un HEAD sur le bucket (qui retourne 200 si le bucket existe et
  // qu'on a les droits, 404 sinon — mais le serveur est UP dans les deux cas).
  try {
    const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
    const res = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    // MinIO renvoie 403 sur GET root sans credentials, mais ça prouve qu'il est up.
    if (res.status >= 500) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `storage HTTP ${res.status}`,
      };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : 'unknown storage error',
    };
  }
}

async function checkMistral(): Promise<CheckResult> {
  const start = Date.now();
  // Check non bloquant : si pas de clé configurée, on retourne ok=true avec
  // une mention (le déploiement peut être OK sans Mistral, fallback Anthropic).
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return { ok: true, latencyMs: 0 };
  }
  try {
    const res = await fetch('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `mistral HTTP ${res.status}`,
      };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : 'unknown mistral error',
    };
  }
}

const ALL_CHECKS = ['db', 'redis', 'storage', 'mistral'] as const;
type CheckName = (typeof ALL_CHECKS)[number];

const RUNNERS: Record<CheckName, () => Promise<CheckResult>> = {
  db: checkDb,
  redis: checkRedis,
  storage: checkStorage,
  mistral: checkMistral,
};

// Checks "critiques" : si l'un échoue, le service est considéré indisponible
// (HTTP 503). Storage et Mistral sont "soft" — leur échec rend le service
// dégradé mais pas down.
const CRITICAL: Set<CheckName> = new Set(['db', 'redis']);

export const GET = withApiLogging(async (req: NextRequest) => {
  const url = new URL(req.url);
  const full = url.searchParams.get('full') === '1';
  const requested = url.searchParams.get('check');

  let checks: CheckName[];
  if (requested) {
    checks = requested
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is CheckName => (ALL_CHECKS as readonly string[]).includes(s));
  } else if (full) {
    checks = [...ALL_CHECKS];
  } else {
    checks = ['db']; // liveness minimal
  }

  // Lance tous les checks en parallèle.
  const results = await Promise.all(
    checks.map(async (name) => [name, await RUNNERS[name]()] as const),
  );

  const checksObj = Object.fromEntries(results) as Record<CheckName, CheckResult>;
  const failedCritical = results.filter(
    ([name, r]) => CRITICAL.has(name) && !r.ok,
  );
  const failedSoft = results.filter(([name, r]) => !CRITICAL.has(name) && !r.ok);

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (failedCritical.length > 0) status = 'unhealthy';
  else if (failedSoft.length > 0) status = 'degraded';
  else status = 'healthy';

  const ok = status !== 'unhealthy';
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  if (!ok) {
    log.warn({ failedCritical: failedCritical.map(([n]) => n), failedSoft: failedSoft.map(([n]) => n) }, 'health.unhealthy');
  }

  return NextResponse.json(
    {
      ok,
      status,
      uptime,
      timestamp: new Date().toISOString(),
      checks: checksObj,
    },
    { status: ok ? 200 : 503 },
  );
});

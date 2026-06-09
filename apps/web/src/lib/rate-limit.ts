/**
 * Rate-limit Redis (Sprint 1 — Sécurité).
 *
 * Implémentation INCR + EXPIRE atomique via Lua. Pas de dépendance externe :
 * on réutilise ioredis (déjà installé pour BullMQ) mais avec une connexion
 * dédiée pour ne pas interférer avec les options spécifiques aux Workers.
 *
 * Usage typique (server action / route handler) :
 *
 *   const ip = headers().get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
 *   const rl = await checkRateLimit({
 *     key: `login:${ip}:${email}`,
 *     max: 5,
 *     windowSeconds: 15 * 60,
 *   });
 *   if (!rl.ok) {
 *     return { ok: false, error: `Trop de tentatives. Réessayez dans ${rl.resetIn}s.` };
 *   }
 *
 * Comportement fail-open : si Redis est down, on autorise la requête (et on
 * logge un warn). C'est un trade-off conscient — on préfère continuer à
 * servir l'app plutôt que tout bloquer si Redis flanche. Pour les endpoints
 * vraiment critiques (paiement, etc.) il faudrait du fail-closed explicite.
 */

import IORedis, { type Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let _redis: Redis | null = null;
let _redisFailures = 0;
const FAILURE_CIRCUIT_BREAK = 10; // au-delà de 10 erreurs consécutives, on stop d'essayer pendant le process

function getRedis(): Redis | null {
  if (_redisFailures >= FAILURE_CIRCUIT_BREAK) return null;
  if (_redis) return _redis;
  try {
    _redis = new IORedis(REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 2, // court — on veut savoir vite si Redis est down
      enableReadyCheck: true,
    });
    _redis.on('error', (err) => {
      _redisFailures++;
      if (_redisFailures === 1) {
        console.warn('[rate-limit] Redis error — fail-open enabled:', err.message);
      }
    });
    _redis.on('connect', () => {
      _redisFailures = 0;
    });
    return _redis;
  } catch (err) {
    console.warn('[rate-limit] Redis init failed — fail-open:', err);
    _redisFailures++;
    return null;
  }
}

/**
 * Script Lua atomique : INCR le compteur, set EXPIRE seulement à la 1ère
 * occurrence (sinon on étendrait la fenêtre à chaque hit), renvoie current+TTL.
 */
const SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

export interface RateLimitInput {
  /** Identifiant unique de la fenêtre. Préfixe avec le contexte : `login:`, `preinscription:`, etc. */
  key: string;
  /** Nombre max d'occurrences autorisées dans la fenêtre. */
  max: number;
  /** Largeur de la fenêtre en secondes. */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** true = autorisé, false = bloqué */
  ok: boolean;
  /** Nombre d'occurrences restantes avant blocage */
  remaining: number;
  /** Secondes avant reset de la fenêtre (0 si la clé vient d'être créée et TTL pas encore set, traité par fallback) */
  resetIn: number;
  /** true si Redis est down et on a autorisé par fail-open */
  degraded?: boolean;
}

export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return { ok: true, remaining: input.max, resetIn: 0, degraded: true };
  }
  try {
    const result = (await redis.eval(
      SCRIPT,
      1,
      `ratelimit:${input.key}`,
      input.windowSeconds.toString(),
    )) as [number, number];
    const current = Number(result[0]);
    const ttl = Number(result[1]);
    return {
      ok: current <= input.max,
      remaining: Math.max(0, input.max - current),
      resetIn: ttl > 0 ? ttl : input.windowSeconds,
    };
  } catch (err) {
    _redisFailures++;
    console.warn('[rate-limit] eval failed — fail-open:', err);
    return { ok: true, remaining: input.max, resetIn: 0, degraded: true };
  }
}

/** Profils standard pour cohérence cross-app. */
export const RateLimitProfile = {
  /** Login : 5 tentatives / 15 min / clé. */
  LOGIN: { max: 5, windowSeconds: 15 * 60 },
  /** Endpoint public de pré-inscription : 10 soumissions / heure / IP. */
  PREENROLLMENT_SUBMIT: { max: 10, windowSeconds: 60 * 60 },
  /** Génération de lien public preinscription : 30 / heure / utilisateur. */
  PREENROLLMENT_LINK: { max: 30, windowSeconds: 60 * 60 },
  /** Téléchargement de pièces sensibles : 100 / heure / utilisateur. */
  SENSITIVE_DOWNLOAD: { max: 100, windowSeconds: 60 * 60 },
} as const;

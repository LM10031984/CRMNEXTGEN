/**
 * Connexion Redis singleton pour BullMQ (queue + worker).
 *
 * BullMQ exige `maxRetriesPerRequest: null` pour les Workers (sinon il throw).
 * On expose deux variantes :
 *   - `getQueueRedis()` : pour la Queue, options par défaut
 *   - `getWorkerRedis()` : pour les Workers, avec maxRetriesPerRequest: null
 */

import IORedis, { type Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let _queueRedis: Redis | null = null;
let _workerRedis: Redis | null = null;

export function getQueueRedis(): Redis {
  if (_queueRedis) return _queueRedis;
  _queueRedis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ veut ça même côté Queue dans les versions récentes
    enableReadyCheck: false,
  });
  return _queueRedis;
}

export function getWorkerRedis(): Redis {
  if (_workerRedis) return _workerRedis;
  _workerRedis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return _workerRedis;
}

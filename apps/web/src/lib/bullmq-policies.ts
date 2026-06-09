/**
 * Politiques BullMQ partagées (Sprint 4 — Robustesse).
 *
 * Avant ce sprint, chaque queue définissait son propre retry policy,
 * son propre backoff, et ses propres compteurs de rétention — avec des
 * choix incohérents qui rendaient le tuning difficile :
 *
 *   - closure-generation : attempts=3, backoff=5s, sans âge TTL
 *   - invoice-reminders  : attempts=3, backoff=60s, sans âge TTL
 *   - mailer-outbound    : attempts=5, backoff=30s, age TTL 7j/30j
 *
 * Ce module définit des politiques standardisées, documentées et
 * applicables sans casser le comportement existant des queues critiques.
 * Les TTL d'âge sont ajoutés systématiquement pour éviter l'accumulation
 * infinie de jobs dans Redis.
 *
 * Convention de naming :
 *   - FAST      : actions rapides, retry agressif (mailer, notifications)
 *   - STANDARD  : workflows métier, retry modéré (closure docs)
 *   - SLOW      : crons quotidiens, retry espacé (reminders)
 */

import type { JobsOptions } from 'bullmq';

const ONE_DAY_SEC = 24 * 60 * 60;
const ONE_WEEK_SEC = 7 * ONE_DAY_SEC;
const ONE_MONTH_SEC = 30 * ONE_DAY_SEC;

/**
 * FAST : envoi mail, notifications, hooks IO réseau courts.
 *
 *  - 5 tentatives (backoff exponentiel 30s → 1m → 2m → 4m → 8m)
 *  - Complétés gardés 1000 max OU 7 jours
 *  - Échoués gardés 500 max OU 30 jours (audit RGPD pour traçabilité)
 */
export const FAST_JOB_POLICY: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 1000, age: ONE_WEEK_SEC },
  removeOnFail: { count: 500, age: ONE_MONTH_SEC },
};

/**
 * STANDARD : workflows métier (génération PDF Mistral, batch docs).
 *
 *  - 5 tentatives (avant Sprint 4 : 3 — Mistral peut throttle, on tolère plus)
 *  - Backoff exponentiel 10s → 20s → 40s → 80s → 160s
 *  - Complétés gardés 500 max OU 7 jours
 *  - Échoués gardés 200 max OU 30 jours (debug post-mortem)
 */
export const STANDARD_JOB_POLICY: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { count: 500, age: ONE_WEEK_SEC },
  removeOnFail: { count: 200, age: ONE_MONTH_SEC },
};

/**
 * SLOW : crons quotidiens, jobs résiliants à délai (relances factures).
 *
 *  - 3 tentatives suffisent (rejouera demain de toute façon)
 *  - Backoff exponentiel 60s → 120s → 240s
 *  - Complétés gardés 100 max OU 1 jour (le run quotidien suffit)
 *  - Échoués gardés 50 max OU 7 jours (debug)
 */
export const SLOW_JOB_POLICY: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: { count: 100, age: ONE_DAY_SEC },
  removeOnFail: { count: 50, age: ONE_WEEK_SEC },
};

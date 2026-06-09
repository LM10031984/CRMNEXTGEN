# Sprint 2 — Observabilité

Date : 2026-06-09

Suite directe du [Sprint 1 Sécurité](SPRINT-1-SECURITE.md). Objectif : sortir
de l'aveuglement en production et donner aux opérations la capacité de
diagnostiquer un incident sans se brancher en SSH.

Décisions prises avec Laurent (2026-06-09) :
- **Pas de Sentry / GlitchTip** — pino seul suffit, tu liras les logs avec
  l'outil de ton choix (stdout Docker, fluent-bit, Loki…).
- **Bull Board** remplacé par une page Next.js custom `/admin/queues` avec
  RBAC ADMIN (mieux intégré, style Aurora Navy).

---

## 1. Logger structuré (pino)

**Livré** : [apps/web/src/lib/logger.ts](../apps/web/src/lib/logger.ts)

- pino + pino-pretty (dev) / JSON pur (prod, auto via `NODE_ENV`)
- Niveau via `LOG_LEVEL` env (`debug` en dev, `info` en prod par défaut)
- **Redaction automatique** des secrets dans les logs : `password`,
  `hashedPwd`, `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `MISTRAL_API_KEY`,
  `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`,
  `socialSecurityNb`, `cookie`/`set-cookie`. Le mot-clé `[Redacted]` apparaît
  à la place. Ça protège même si un appelant oublie de filtrer.
- **AsyncLocalStorage** pour propager le contexte (requestId, userId,
  tenantId, jobId, queueName) sans avoir à le passer en paramètre.
- `childLogger(scope)` pour les modules : `const log = childLogger('mailer')`
  → tous les logs ont automatiquement `scope: 'mailer'`.

Usage :

```ts
import { childLogger } from '@/lib/logger';

const log = childLogger('my-module');

log.info({ orderId: '42', userId: 'u1' }, 'order.created');
// → en dev : 15:42:01 INFO  scope=my-module order.created {orderId:"42",userId:"u1"}
// → en prod : {"level":30,"time":"2026-06-09T15:42:01.123Z","scope":"my-module","msg":"order.created","orderId":"42","userId":"u1","requestId":"abc-123"}
```

---

## 2. Middleware request-id

**Livré** : [apps/web/src/middleware.ts](../apps/web/src/middleware.ts)

- Tourne en Edge Runtime (Next.js middleware) — donc pas d'AsyncLocalStorage
  ici (limitation Edge), juste propagation via headers.
- Génère un UUID v4 par requête (ou réutilise le `X-Request-Id` entrant
  si un reverse proxy / load balancer en fournit déjà un).
- Ajoute le header `X-Request-Id` à la requête (lisible dans les Server
  Components / Server Actions via `headers().get('x-request-id')`).
- Ajoute le même header à la réponse (visible côté client DevTools).
- Skip les assets statiques pour ne pas générer un request-id par .js/.css.

---

## 3. Helpers `withApiLogging` / `withWorkerLogging`

**Livré** : [apps/web/src/lib/with-logging.ts](../apps/web/src/lib/with-logging.ts)

Wrappers qui démarrent `AsyncLocalStorage` automatiquement et loggent
le début + la fin + les exceptions :

```ts
// apps/web/src/app/api/foo/route.ts
import { withApiLogging } from '@/lib/with-logging';

export const GET = withApiLogging(async (req) => {
  // Tous les logger.* à l'intérieur auront requestId, durée, etc.
  return NextResponse.json({ ok: true });
});
```

```ts
// Worker BullMQ
const worker = new Worker('closure', withWorkerLogging('closure', async (job) => {
  // jobId / queueName propagés automatiquement
}), { connection });
```

Pour les Server Actions, on reste sur le pattern manuel (`childLogger` +
appel `log.info`) car l'enrobage casse le contrat de signature de Next.

---

## 4. Endpoint `/api/health`

**Livré** : [apps/web/src/app/api/health/route.ts](../apps/web/src/app/api/health/route.ts)

```bash
# Liveness minimal (db ping) — pour load balancer
curl http://localhost:3000/api/health

# Full readiness (db + redis + storage + mistral)
curl http://localhost:3000/api/health?full=1

# Sélectif
curl http://localhost:3000/api/health?check=db,redis
```

Réponse :
```json
{
  "ok": true,
  "status": "healthy" | "degraded" | "unhealthy",
  "uptime": 12345,
  "timestamp": "2026-06-09T15:42:01.123Z",
  "checks": {
    "db":      { "ok": true, "latencyMs": 4 },
    "redis":   { "ok": true, "latencyMs": 1 },
    "storage": { "ok": true, "latencyMs": 18 },
    "mistral": { "ok": true, "latencyMs": 142 }
  }
}
```

Codes HTTP :
- `200` si OK (au pire `degraded` : un check soft a échoué, le service répond)
- `503` si `unhealthy` (db ou redis cassés — checks critiques)

**Pas d'auth** : volontaire, pour que kubelet/load balancer/uptime monitor
puissent l'appeler. Aucune info sensible exposée (juste up/down + latence).

---

## 5. Page `/admin/queues`

**Livré** : [apps/web/src/app/admin/queues/page.tsx](../apps/web/src/app/admin/queues/page.tsx)

Monitoring custom des 2 queues BullMQ (`closure-generation` +
`invoice-reminders-daily`) :
- Compteurs par état : waiting / active / completed / failed / delayed / paused
- 20 derniers jobs avec état, durée, tentatives, raison d'échec
- RBAC ADMIN strict (redirect 404 si autre rôle)

Style aligné Aurora Navy (cards `rounded-2xl ring-1 ring-slate-200/70
shadow-card`).

> Note : pas de boutons retry/clean dans Sprint 2 — uniquement read-only.
> Action manuelle = via Prisma Studio ou redis-cli pour l'instant.

---

## 6. Migration `console.*` → logger (5 fichiers critiques)

| Fichier | Avant | Après |
|---|---|---|
| `lib/closure/worker.ts` | 6 console | `log.info/error` avec `jobId/kind/participantId` structurés |
| `lib/invoice-reminders/worker.ts` | 7 console | `log.info/error` avec `jobId/processed/cron` |
| `lib/mailer.ts` | 2 console | `log.info` (dry-run + sent) + `log.error` (failed) |
| `server/actions/preinscription-public.ts` | 5 console | `log.error` typés par contexte (`upload.failed`, `extraction.failed`, etc.) |
| `lib/closure/mistral-generators.ts` | 3 console | `log.info` (ok), `log.warn` (retry), métadonnées `taskName/model/promptVersion` |

Reste **24 occurrences sur 16 fichiers** non critiques à migrer plus tard
(routes API documents, server actions divers). Pas bloquant car ils ne sont
pas dans le chemin chaud des workers / endpoints publics.

---

## 7. Tests

[apps/web/src/lib/__tests__/logger.test.ts](../apps/web/src/lib/__tests__/logger.test.ts)

5 tests :
- `runWithContext` propage sync + async
- Isolation entre 2 runs concurrents (sanity check AsyncLocalStorage)
- `getContext()` retourne `null` hors contexte
- `childLogger(scope)` ajoute bien `scope` dans les bindings

---

## Récap fichiers créés / modifiés

| Type | Chemin |
|---|---|
| Nouveau | `apps/web/src/lib/logger.ts` |
| Nouveau | `apps/web/src/lib/with-logging.ts` |
| Nouveau | `apps/web/src/middleware.ts` |
| Nouveau | `apps/web/src/app/api/health/route.ts` |
| Nouveau | `apps/web/src/app/admin/queues/page.tsx` |
| Nouveau | `apps/web/src/lib/__tests__/logger.test.ts` |
| Nouveau | `docs/SPRINT-2-OBSERVABILITE.md` |
| Modifié | `apps/web/src/lib/closure/worker.ts` |
| Modifié | `apps/web/src/lib/closure/mistral-generators.ts` |
| Modifié | `apps/web/src/lib/invoice-reminders/worker.ts` |
| Modifié | `apps/web/src/lib/mailer.ts` |
| Modifié | `apps/web/src/server/actions/preinscription-public.ts` |
| Modifié | `apps/web/package.json` (deps : pino, pino-pretty) |

## Variables d'env (rien de nouveau)

- `LOG_LEVEL` (déjà présente, défaut `debug` en dev, `info` en prod)
- `NODE_ENV` (pour décider du transport pino-pretty vs JSON)

## Reste à faire (Sprint 3)

- Migrer les 24 `console.*` restants (routes API divers, server actions
  non-critiques)
- Boutons retry / clean failed sur `/admin/queues` (write actions avec
  audit log)
- Sentry / GlitchTip si on veut un agrégateur visuel (skip pour l'instant
  par décision Laurent)
- Tracing OpenTelemetry si on veut corréler avec des services externes
  (Mistral, Supabase)

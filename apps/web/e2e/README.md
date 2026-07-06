# Tests E2E Playwright — staging Vercel (Phase 21)

Filet **à la demande** contre le déploiement distant (décision D-10) : ces tests ne
tournent **PAS** dans le gate PR (qui reste lint + tsc + vitest). Ils se lancent
depuis le poste local, `.env` racine chargé via `dotenv -e ../../.env`.

## Prérequis

- `.env` racine (gitignoré) avec :
  - `E2E_LOGIN_EMAIL` / `E2E_LOGIN_PASSWORD` — user e2e dédié `e2e@start-academy.fr`
    (ADMIN, créé par `scripts/create-e2e-user.ts` — **jamais** le compte de Laurent)
  - `STAGING_BASE_URL` — passée inline dans les commandes ci-dessous
    (actuellement `https://qualiof.vercel.app` ; domaine final `app.start-academy.fr`
    quand le DNS sera posé — zéro changement de code)
  - Optionnels : `VERCEL_AUTOMATION_BYPASS_SECRET` (si Deployment Protection),
    `E2E_DOCENGINE_HEALTH_URL` (préflight closure — `/health` public du proxy Caddy
    Gotenberg, ex. `https://gotenberg-proxy-production-a4cf.up.railway.app/health`)
- **Worker Railway UP** (service `worker` — vérifier `railway status` : c'est LUI qui
  consomme la file `ClosureJob` Postgres, aucun cron Vercel)
- **Budget OpenRouter** : le test closure fait de la VRAIE génération IA
  (~quelques centimes par run, D-11)

## Commandes

### Smoke routes (TEST-02, ~1 min)

```bash
STAGING_BASE_URL=https://qualiof.vercel.app pnpm --filter @qualiof/web exec dotenv -e ../../.env -- playwright test e2e/auth.setup.ts e2e/smoke-routes.spec.ts
```

### Upload 10 Mo direct-to-storage (anti-413)

```bash
STAGING_BASE_URL=https://qualiof.vercel.app pnpm --filter @qualiof/web exec dotenv -e ../../.env -- playwright test e2e/auth.setup.ts e2e/upload-preenrollment.spec.ts
```

### Closure E2E (TEST-01 — long, ~5-15 min, coût ~centimes OpenRouter)

Session jetable `E2E-` créée via l'UI → pack closure RÉEL (worker Railway +
OpenRouter) → 0 stub → PDF `%PDF-` → teardown automatique en `afterAll`.

```bash
STAGING_BASE_URL=https://qualiof.vercel.app pnpm --filter @qualiof/web exec dotenv -e ../../.env -- playwright test e2e/auth.setup.ts e2e/closure-flow.spec.ts
```

### Teardown standalone (relance après crash / run interrompu)

Purge EXCLUSIVE des données préfixées `E2E-`/`e2e-` (base + storage) — idempotent,
re-run sur base propre = tous compteurs 0 :

```bash
pnpm --filter @qualiof/web exec dotenv -e ../../.env -- tsx e2e/teardown-e2e-data.ts
```

## Quand lancer

- **Avant la bascule Phase 22** (domaine final + équipe) — suite complète.
- **Après tout déploiement important** (migration Prisma, changement doc-engines,
  bump Next/Prisma, modification auth/storage).

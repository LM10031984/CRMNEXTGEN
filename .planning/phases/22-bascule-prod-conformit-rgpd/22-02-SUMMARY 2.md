---
phase: 22-bascule-prod-conformit-rgpd
plan: 02
subsystem: infra
tags: [google-calendar, oauth, t3-env, vercel, rgpd, pii, logs, tdd, vitest]

# Dependency graph
requires:
  - phase: 21-app-vercel-filet-ci-tests
    provides: "Staging Vercel LIVE (qualiof.vercel.app), gardes NEXT_PUBLIC_APP_ENV/MAIL_DRY_RUN, pattern env vars par API"
  - phase: 14-google-calendar
    provides: "google-client.ts (OAuth refresh token files/secrets/), sync-session idempotent 19 events"
provides:
  - "loadOAuthConfig() env-first : 3 vars GOOGLE_OAUTH_* (Vercel sensitive) avec fallback files/secrets/ en dev local, all-or-nothing (D-07)"
  - "3 vars serveur optionnelles GOOGLE_OAUTH_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN dans env.ts + turbo.json globalEnv + .env.example"
  - "Audit D-17 : 51 console.* scannés dans le périmètre worker/generators, 0 PII brut restant (22-PII-LOGS-AUDIT.md)"
  - "Logs corrigés : mailer dry-run email masqué, closure-worker notif par user id, label 'Erreur IA' (D-18 ③)"
affects: [22-04-runbook-bascule, 22-06-pr-cloud-migration-main, 22-07-remediation-reminders, rgpd-registre]

# Tech tracking
tech-stack:
  added: []
  patterns: ["env-first avec fallback fichier all-or-nothing (jamais de mélange env/fichier)", "masquage email dans logs : /^(.)[^@]*(@.+)$/ → $1***$2", "logs PII : toujours un id, jamais la valeur"]

key-files:
  created:
    - apps/web/src/lib/calendar/__tests__/google-client.test.ts
    - .planning/phases/22-bascule-prod-conformit-rgpd/22-PII-LOGS-AUDIT.md
  modified:
    - apps/web/src/lib/calendar/google-client.ts
    - packages/shared/src/env.ts
    - turbo.json
    - .env.example
    - apps/web/src/lib/mailer.ts
    - apps/web/src/lib/closure/worker.ts
    - apps/web/src/server/actions/ai-fill-product.ts

key-decisions:
  - "loadOAuthConfig all-or-nothing : env partiel (1 ou 2 vars sur 3) → fallback fichiers COMPLET, jamais de mélange env/fichier"
  - "closure/worker.ts:409 : le select user ne remonte pas id → log de batch.createdByUserId (même valeur, déjà chargée), pas de modif du select"
  - "test-veille-worker.ts JUSTIFIÉ : tenant.name = raison sociale d'organisation dans un script de test manuel, pas une PII personne physique"

patterns-established:
  - "Env-first credentials : sharedEnv d'abord, fallback fichier local ensuite, contrat prouvé par tests hermétiques (mock sharedEnv getter vi.hoisted + node:fs)"
  - "Grep gate RGPD-01 : console.* du périmètre worker | grep -iE '\\$\\{[a-z]*\\.(email|firstName|lastName)' = 0"

requirements-completed: [CUT-01, RGPD-01]

# Metrics
duration: 7min
completed: 2026-07-06
---

# Phase 22 Plan 02: Portage Google Calendar env-first + audit logs PII Summary

**Credentials Google Calendar portés en 3 vars d'env (env-first, fallback files/secrets/ en dev, TDD 4 tests hermétiques) + audit D-17 des 51 console.* du périmètre worker : 2 logs PII corrigés (mailer dry-run, notif closure), 0 PII restant, label « Erreur Ollama » → « Erreur IA »**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-06T20:23:21Z
- **Completed:** 2026-07-06T20:30:14Z
- **Tasks:** 3 (2 TDD + 1 audit)
- **Files modified:** 9

## Accomplishments

- **D-07 déployable** : `loadOAuthConfig()` lit `GOOGLE_OAUTH_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN` depuis `sharedEnv` (Vercel, sensitive) avec fallback historique `files/secrets/` intact — le premier sync calendar post-bascule ne crashera plus en `ENOENT` sur Vercel. Contrat prouvé par 4 tests hermétiques (env complet / env vide / env partiel all-or-nothing / format `web`).
- **RGPD-01 (partie logs)** : audit exhaustif de 51 `console.*` (lib/closure, lib/veille, lib/invoice-reminders, lib/calendar, preinscription-extractor, mailer, scripts *worker*) documenté dans `22-PII-LOGS-AUDIT.md` ; les 2 fuites réelles corrigées — l'email apprenant/payeur des relances dry-run Railway est désormais masqué (`l***@domaine`), la notif closure loggue `user=<id>`.
- Règle worker-safe préservée : `google-client.ts` n'importe que node:fs, node:path, googleapis, `@qualiof/shared/env` (déjà importé au boot du worker).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): tests hermétiques loadOAuthConfig** - `dde3881` (test) — 4 tests rouges (`loadOAuthConfig is not a function`)
2. **Task 2 (GREEN): loadOAuthConfig + env.ts + turbo.json + .env.example** - `6df4375` (feat) — 4/4 verts, calendar 70/70, tsc web+shared exit 0
3. **Task 3: audit D-17 + corrections PII + label IA** - `6871aac` (fix) — suite 1180/1180, gate RGPD grep = 0

_Pas de commit REFACTOR : l'implémentation GREEN était déjà propre._

## Files Created/Modified

- `apps/web/src/lib/calendar/__tests__/google-client.test.ts` - 4 tests hermétiques du contrat env-first/fallback/all-or-nothing (mock sharedEnv getter vi.hoisted, node:fs, googleapis)
- `apps/web/src/lib/calendar/google-client.ts` - `loadOAuthConfig()` exporté, `getCalendarClient()` refactoré (plus de readFileSync direct), header worker-safe mis à jour
- `packages/shared/src/env.ts` - 3 vars serveur optionnelles + mappings runtimeEnv
- `turbo.json` - 3 clés GOOGLE_OAUTH_* dans globalEnv
- `.env.example` - bloc commenté (aucune valeur réelle)
- `apps/web/src/lib/mailer.ts` - email destinataire masqué en dry-run
- `apps/web/src/lib/closure/worker.ts` - notif logguée par `batch.createdByUserId`
- `apps/web/src/server/actions/ai-fill-product.ts` - « Erreur Ollama » → « Erreur IA »
- `.planning/phases/22-bascule-prod-conformit-rgpd/22-PII-LOGS-AUDIT.md` - rapport d'audit D-17 (tableau 51 occurrences, scan reproductible, 0 PII restante)

## Decisions Made

- **All-or-nothing strict** : env partiel (ex. seul REFRESH_TOKEN posé) → fallback fichiers complet, jamais de mélange env/fichier (Test 3 le fige).
- **`user.id` non sélectionné en amont** de `notifyBatchCompletion` → log de `batch.createdByUserId` (même valeur, déjà en mémoire) plutôt que d'élargir le select Prisma.
- **`test-veille-worker.ts` verdict JUSTIFIÉ** : `tenant.name` = raison sociale (« Start Academy »), donnée d'organisation, pas une PII de personne physique — script de test manuel de surcroît.

## Deviations from Plan

None - plan executed exactly as written. (Aucun test existant n'assertait les formats de logs corrigés — le point ⑤ conditionnel de la Task 3 n'a pas été déclenché.)

## Issues Encountered

- **Faux positif grep en Task 1** : le doc-comment du fichier de test contenait la chaîne littérale `files/secrets` (critère d'acceptance grep négatif) — reformulé avant commit, même leçon que la déviation 21-01.
- **Invocation vitest directe ≠ script projet** : `pnpm vitest run src/lib/calendar/` fait échouer `sync-session.test.ts` au collect (`Invalid environment variables` — le vrai `sharedEnv` est chargé sans `.env`). Ce n'est PAS une régression : le script projet est `pnpm test` = `dotenv -e ../../.env -- vitest run`. Vérifié par stash : l'échec existe sans mes changements. Avec le pattern projet : 70/70 verts.

## User Setup Required

**Avant la bascule (plan 22-04/22-05)** : poser les 3 vars `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REFRESH_TOKEN` (sensitive) sur Vercel — valeurs dans `files/secrets/oauth-client.json` (client_id/client_secret) et `files/secrets/google-token.json` (refresh_token). ⚠ Sanity check D-18 : aucune valeur avec espace/`#`/non-ASCII (pose par API = strip des commentaires inline). Aucune action requise pour le dev local (fallback fichiers automatique).

## Next Phase Readiness

- Code mergeable pour la PR cloud-migration→main du plan 22-06 (MERGE COMMIT, jamais squash) : suite turbo 3/3 verte (web 1180 + shared 113 + db), tsc exit 0 web+shared.
- Le runbook de bascule (22-04) doit inclure la pose des 3 vars Google sur Vercel (cf. User Setup ci-dessus).
- Gate RGPD-01 logs : reproductible via la commande de scan du rapport d'audit.

---
*Phase: 22-bascule-prod-conformit-rgpd*
*Completed: 2026-07-06*

## Self-Check: PASSED

- Fichiers créés vérifiés sur disque (test, audit, summary)
- Commits dde3881 / 6df4375 / 6871aac présents dans l'historique

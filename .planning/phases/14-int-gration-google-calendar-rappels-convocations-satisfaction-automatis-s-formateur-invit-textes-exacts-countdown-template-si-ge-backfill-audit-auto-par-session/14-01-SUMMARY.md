---
phase: 14-google-calendar
plan: 01
subsystem: calendar
tags: [google-calendar, worker-safe, idempotency, oauth, foundation]
dependency_graph:
  requires: []
  provides:
    - "getCalendarClient() — client Google Calendar v3 authentifié worker-safe"
    - "CALENDAR_ID — id figé agenda Rappel Formations"
    - "CALENDAR_COLORS — map colorId (formation=7, rappel=6, froid=3)"
    - "buildEventKey(sessionCode, type, dayIndex?) — clé d'idempotence déterministe"
    - "QUALIOF_KEY_PROP — nom de la propriété extendedProperties.private"
    - "type CalendarEventType = formation | rappel | froid"
  affects:
    - "Plan 14-04 (orchestrateur) consommera getCalendarClient + buildEventKey + QUALIOF_KEY_PROP"
    - "Builders d'événements (rappel/froid/formation) consommeront CALENDAR_COLORS"
tech_stack:
  added: []
  patterns:
    - "Module lib pur worker-safe (aucun import auth-gated/react — règle BullMQ)"
    - "Singleton mémoïsé (clone du pattern closure/redis.ts)"
    - "Clé d'idempotence déterministe sans timestamp (clone esprit closure/queue.ts jobId)"
key_files:
  created:
    - apps/web/src/lib/calendar/google-client.ts
    - apps/web/src/lib/calendar/colors.ts
    - apps/web/src/lib/calendar/idempotency.ts
    - apps/web/src/lib/calendar/__tests__/idempotency.test.ts
  modified: []
decisions:
  - "google-token.json (refresh_token OAuth interne) reste la source d'auth — compte de service abandonné (règle org bloque les clés JSON)"
  - "Pas de date/horodatage dans la clé d'idempotence (sinon re-run = doublons)"
  - "Commentaire worker-safe reformulé sans citer littéralement les tokens interdits (sinon le grep d'acceptance se déclenchait sur le commentaire lui-même)"
metrics:
  duration_min: 2
  tasks: 2
  files: 4
  tests_added: 6
  completed: 2026-06-25
---

# Phase 14 Plan 01: Fondation worker-safe Google Calendar — Summary

Socle worker-safe d'accès Google Calendar pour la Phase 14 : client OAuth authentifié réutilisable lu depuis `files/secrets/`, helper d'idempotence (clé déterministe par session/type/jour) et constantes de couleur — 3 modules `lib/calendar/*` purs (zéro import auth/react) + 6 tests Vitest verts sur la clé d'idempotence.

## What Was Built

- **`google-client.ts`** — `getCalendarClient()` reproduit le pattern d'auth prouvé de `scripts/_google-test.ts` : lit `oauth-client.json` + `google-token.json` depuis `../../secrets`, construit `google.auth.OAuth2` + `setCredentials({ refresh_token })`, retourne un `calendar_v3.Calendar` mémoïsé (singleton léger comme `closure/redis.ts`). Exporte aussi `CALENDAR_ID` figé (agenda « Rappel Formations »).
- **`colors.ts`** — `CALENDAR_COLORS = { formation: '7', rappel: '6', froid: '3' }` (colorId Google = strings ; 7=Paon/bleu, 6=Mandarine/orange, 3=Raisin/violet) + type `CalendarColorKey`.
- **`idempotency.ts`** — `buildEventKey(sessionCode, type, dayIndex?)` → clé `qualiof_<code-lowercase>_<type>[_<dayIndex>]`, déterministe, sans timestamp, charset `[a-z0-9_-]` (compatible `extendedProperties.private`). Exporte `QUALIOF_KEY_PROP = 'qualiof_key'` et le type `CalendarEventType`.
- **`__tests__/idempotency.test.ts`** — 6 cas Vitest (formation sans dayIndex, rappel+3, froid+1, déterminisme lowercase, charset, valeur de `QUALIOF_KEY_PROP`).

## Verification

- `pnpm vitest run src/lib/calendar` → 6/6 verts.
- `grep -rE "(server/actions|/rbac|validateRequest|requireRole|from ['\"]react)" src/lib/calendar/*.ts` → 0 ligne (worker-safe sur tout le dossier).
- `tsc --noEmit` → 0 erreur sur `lib/calendar`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reformulation du commentaire worker-safe pour passer la vérif grep**
- **Found during:** Task 1 (vérification automatisée)
- **Issue:** La vérif d'acceptance `! grep -E "(server/actions|/rbac|validateRequest|requireRole|from ['\"]react)" google-client.ts` échouait car le commentaire d'en-tête citait littéralement les tokens interdits (`@/server/actions`, `requireRole`, `from 'react'`…) pour documenter la règle. Le grep ne distingue pas commentaire et import.
- **Fix:** Comment reformulé en langage naturel (« server actions, helpers RBAC/auth, gardes de session/rôle, runtime React ») sans citer les patterns exacts. La règle reste documentée, le grep retourne 0 ligne.
- **Files modified:** apps/web/src/lib/calendar/google-client.ts
- **Commit:** 1a396a7

## Decisions Made

- **Auth via refresh_token OAuth interne** (`google-token.json`), pas de compte de service (règle org Start Academy bloque les clés JSON — cf. mémoire `google_calendar_oauth`).
- **Clé d'idempotence sans date** : `qualiof_<code>_<type>[_<day>]` ; un re-run de l'orchestrateur produit la même clé → insert/update/skip via `events.list({ privateExtendedProperty })`.
- **Singleton mémoïsé** : un client par process, cohérent avec le pattern `closure/redis.ts`.

## Known Stubs

Aucun. Tous les exports sont fonctionnels ; l'absence d'appel API métier est intentionnelle (socle consommé par Plan 14-04).

## Commits

- `1a396a7` — feat(14-01): client Google Calendar worker-safe + constantes couleur
- `78a7d3a` — test(14-01): add failing test for buildEventKey idempotence (TDD RED)
- `3d71c91` — feat(14-01): implement buildEventKey deterministe + QUALIOF_KEY_PROP (TDD GREEN)

## Self-Check: PASSED

---
phase: 14-google-calendar
plan: 06
subsystem: calendar-sync
tags: [google-calendar, server-action, rbac, auditlog, ui, idempotence]
requires:
  - "14-04: syncSessionCalendar (cœur worker-safe idempotent)"
  - "14-05: loadSessionEventCtx (contexte session tenant-scopé)"
provides:
  - "syncSessionCalendarAction (server action auth-gatée, mode auto UI)"
  - "SessionCalendarSyncToggle (toggle + bouton fiche session)"
  - "AuditLog convention sessions.calendarSynced"
affects:
  - "apps/web/src/app/app/sessions/[id]/page.tsx (section Agenda / Rappels)"
tech-stack:
  added: []
  patterns:
    - "Server action = wrapper mince auth-gate + AuditLog + revalidatePath au-dessus d'un cœur worker-safe"
    - "AuditLog [entity].[verb] : entity='TrainingSession', action='sessions.calendarSynced'"
    - "Toggle UI useState + useTransition + sonner (clone session-logistics-editor)"
key-files:
  created:
    - apps/web/src/server/actions/calendar-sync.ts
    - apps/web/src/server/actions/__tests__/calendar-sync.test.ts
    - apps/web/src/components/sessions/session-calendar-sync-toggle.tsx
  modified:
    - apps/web/src/app/app/sessions/[id]/page.tsx
decisions:
  - "Frontière auth/core stricte : la server action importe le cœur, jamais l'inverse (règle worker BullMQ)"
  - "ctx null OU formateur sans e-mail → { ok:false } SANS appel API ET SANS AuditLog (pas de mutation réussie à tracer)"
  - "isPastSession calculé côté action ET côté page (endDate < now) — pas de smart-calc, comparaison directe"
metrics:
  duration: "~1 run (Bash refusé en cours → commits/tests délégués à l'orchestrateur)"
  completed: 2026-06-25
---

# Phase 14 Plan 06 : Mode auto UI — server action + toggle synchro Google Calendar Summary

Server action auth-gatée `syncSessionCalendarAction` (wrapper mince ADMIN/MANAGER au-dessus du cœur worker-safe `syncSessionCalendar`) + composant client `SessionCalendarSyncToggle` (toggle « envoyer réellement aux apprenants » + bouton « Synchroniser l'agenda Google ») branché sur la fiche session dans une section « Agenda / Rappels », avec AuditLog `sessions.calendarSynced` à chaque synchro réussie.

## What was built

### Task 1 — Server action wrapper `calendar-sync.ts` (TDD)
- `syncSessionCalendarAction({ sessionId, notifyLearners })` :
  1. `requireRole(['ADMIN','MANAGER'])` (try/catch → `{ ok:false }` sur Unauthorized/Forbidden) ;
  2. `loadSessionEventCtx(user.tenantId, sessionId)` → si `null` OU `missingTrainerEmail` OU `trainerEmail` vide → `{ ok:false }` SANS appel cœur ni AuditLog ;
  3. `isPastSession = (ctx.endDate ?? ctx.startDate) < new Date()` ;
  4. appelle le cœur `syncSessionCalendar({ tenantId, sessionId, ctx, syncMode:'auto', isPastSession, notifyLearners })` ;
  5. `prisma.auditLog.create` action `'sessions.calendarSynced'` (entity `TrainingSession`, entityId = sessionId, diff = { recap, syncMode, notifyLearners, isPastSession }) ;
  6. `revalidatePath('/app/sessions/{id}')` ; retour `{ ok:true, recap }` ; erreur cœur → `{ ok:false, error }`.
- Wrapper MINCE : aucune logique métier dupliquée — auth + AuditLog + revalidate seulement.
- Test `calendar-sync.test.ts` (9 assertions, tout mocké, ZÉRO appel Google réel) : auth-gate `['ADMIN','MANAGER']`, ctx null → no-core/no-audit, missingTrainerEmail → no-core/no-audit, succès → cœur syncMode 'auto' + notifyLearners propagé (ON et OFF), tenantId propagé au cœur + `loadSessionEventCtx('tenant-1','s1')`, AuditLog `sessions.calendarSynced` + entityId, erreur cœur → `{ ok:false }` sans AuditLog.

### Task 2 — UI `session-calendar-sync-toggle.tsx` + insertion fiche session
- Composant client : `useState(notifyLearners=false)` + `useTransition` + `toast` sonner.
- Toggle « Envoyer réellement les invitations aux apprenants » — remplacé, si `isPastSession`, par un encart ambre « Session passée — invitations en trace uniquement » (pas de checkbox notif).
- Bouton « Synchroniser l'agenda Google » (Loader2 pending), toast succès `X créés, Y mis à jour` ou toast erreur.
- Inséré dans `apps/web/src/app/app/sessions/[id]/page.tsx` dans une `SettingsDrawerSection` « Agenda / Rappels » (icône Calendar), gardée par `canEdit` (ADMIN/MANAGER), `isPastSession={new Date(session.endDate) < new Date()}`.

### Task 3 — Checkpoint idempotence E2E
HORS SCOPE de cet exécuteur (HARD_SCOPE_LIMIT) : aucune synchro réelle déclenchée. Le run double-clic contre l'agenda live « Rappel Formations » reste gaté par Laurent (orchestrateur). Cf. `14-SMOKE.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Signature réelle de loadSessionEventCtx différente du pseudocode**
- **Found during:** Task 1
- **Issue:** Le plan écrit `const ctx = await loadSessionEventCtx(...); if (!ctx || !ctx.trainerEmail)`. Or 14-05 a livré `loadSessionEventCtx` qui renvoie `{ ctx, missingTrainerEmail } | null` (pas un ctx à plat).
- **Fix:** Déstructure `loaded.ctx` ; garde `if (!loaded || loaded.missingTrainerEmail || !loaded.ctx.trainerEmail)`.
- **Files modified:** apps/web/src/server/actions/calendar-sync.ts
- **Impact:** aucun — sémantique identique au plan (ctx absent/sans formateur → { ok:false } sans mutation).

**2. [Rule 3 - Blocking] syncSessionCalendar prend un seul objet SyncSessionInput**
- **Found during:** Task 1
- **Issue:** Le pseudocode passe les champs en vrac ; le cœur 14-04 attend l'objet `SyncSessionInput` (notifyLearners INCLUS dans l'objet).
- **Fix:** Appel `syncSessionCalendar({ tenantId, sessionId, ctx, syncMode:'auto', isPastSession, notifyLearners })`.
- **Files modified:** apps/web/src/server/actions/calendar-sync.ts
- **Impact:** aucun — tous les champs requis passés.

**3. [Rule 2 - Missing critical] requireRole entouré d'un try/catch dédié**
- **Found during:** Task 1
- **Issue:** `requireRole` THROW (Unauthorized/Forbidden) — sans catch, un non-autorisé renverrait une 500 au lieu d'un toast propre.
- **Fix:** try/catch autour de requireRole renvoyant `{ ok:false, error }` (pattern rbac.ts documenté), re-throw des erreurs inattendues.
- **Files modified:** apps/web/src/server/actions/calendar-sync.ts

## Known Stubs
Aucun. `programmeDriveId: undefined` provient de 14-05 (hors périmètre 14-06) ; les builders gèrent l'absence (3 pièces jointes statiques).

## Self-Check
(Bash refusé en cours d'exécution — la vérification d'existence fichiers/commits + le run vitest sont délégués à l'orchestrateur. Voir bloc « Remaining commands » dans le rapport.)

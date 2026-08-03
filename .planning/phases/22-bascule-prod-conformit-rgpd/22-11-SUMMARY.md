---
phase: 22-bascule-prod-conformit-rgpd
plan: 11
subsystem: email
tags: [prisma, zod, nodemailer, tdd, vitest, rbac, audit-log, railway, vercel]

# Dependency graph
requires:
  - phase: 22-bascule-prod-conformit-rgpd (22-06)
    provides: "Bascule prod exécutée, circuit PR cloud-migration→main gate CI test + merge commit, MAIL_DRY_RUN=true prouvé Vercel+Railway"
provides:
  - "Modèle TenantEmailSettings (migration additive 20260803134935 appliquée migrate deploy sur le cloud) — tout à default(false), fail-closed"
  - "resolveEmailPolicy pure (email-policy.ts) : matrice env × interrupteur × catégorie × session test, 21 tests TDD"
  - "Chokepoint mailer.ts à 2 couches : env MAIL_DRY_RUN (plomberie, prioritaire) puis réglages tenant (métier) — context {tenantId, category, sessionId?} REQUIS par le type"
  - "12 call-sites sendMail contextualisés (6 catégories) + compteurs de relance conditionnels au départ réel (Pitfall 1 fermé)"
  - "UI Paramètres organisme section « Envois d'emails » (ADMIN, upsert scopé tenant, AuditLog)"
  - "Mergé sur main (PR #9, merge commit 7e59abe), Vercel prod Ready, worker Railway redéployé (deployment 76defe0a)"
affects: [22-07 flip emails, 22-09, futurs envois emails]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Garde d'envoi 2 couches : env = plomberie (prioritaire, zéro lecture BDD), TenantEmailSettings = métier (fail-closed)"
    - "Contexte métier requis par le type au chokepoint → tsc = filet d'exhaustivité (impossible d'ajouter un envoi non catégorisé)"
    - "Compteur de relance consommé UNIQUEMENT sur départ réel (ok && !dryRun) — jamais en dry-run/suppression/échec SMTP"

key-files:
  created:
    - apps/web/src/lib/email-policy.ts
    - apps/web/src/lib/__tests__/email-policy.test.ts
    - apps/web/src/lib/invoice-reminders/__tests__/invoice-reminder-core.test.ts
    - apps/web/src/server/actions/email-settings.ts
    - apps/web/src/components/parametres/email-settings-form.tsx
    - packages/db/prisma/migrations/20260803134935_tenant_email_settings/migration.sql
  modified:
    - packages/db/prisma/schema.prisma
    - packages/shared/src/schemas/tenant.ts
    - apps/web/src/lib/mailer.ts
    - apps/web/src/lib/invoice-reminders/invoice-reminder-core.ts
    - apps/web/src/lib/closure/worker.ts
    - apps/web/src/lib/lead-notifications.ts
    - apps/web/src/server/actions/invoices.ts
    - apps/web/src/server/actions/preinscription-reminders.ts
    - apps/web/src/server/actions/dossier-reminder.ts
    - apps/web/src/server/actions/opco-submission.ts
    - apps/web/src/server/actions/tenant-users.ts
    - apps/web/src/app/api/cron/preinscription-reminders/route.ts
    - apps/web/src/app/api/cron/opco-submission-reminders/route.ts
    - apps/web/src/app/app/parametres/page.tsx

key-decisions:
  - "Migration générée par prisma migrate diff --from-url (pas de shadow DB nécessaire contre le cloud) puis migrate deploy — 100 % additive, re-deploy = No pending"
  - "email-policy.ts = interface structurelle locale EmailPolicySettings (compatible modèle Prisma par typage structurel) → module neutre 100 % pur, testable sans client Prisma"
  - "Redeploy worker Railway via railway up (build frais du code) et PAS railway redeploy (qui aurait rejoué l'ANCIENNE image sans le garde)"
  - "Suppression réglages retournée { ok:true, dryRun:true, suppressed:true } — les call-sites la traitent comme un dry-run, jamais d'erreur"

patterns-established:
  - "Toute évolution future d'envoi email DOIT choisir une EmailCategory existante ou en ajouter une (type + map + label + boolean Prisma) — tsc casse sinon"

requirements-completed: [CUT-02]

# Metrics
duration: 71min
completed: 2026-08-03
---

# Phase 22 Plan 11: Garde-fou applicatif envois emails Summary

**TenantEmailSettings fail-closed (tout OFF par défaut) + garde 2 couches au chokepoint mailer.ts avec contexte requis par le type, 12 call-sites contextualisés, compteurs de relance conditionnels au départ réel, UI Paramètres « Envois d'emails », mergé sur main et déployé (Vercel + worker Railway).**

## Performance

- **Duration:** 71 min
- **Started:** 2026-08-03T13:24:18Z
- **Completed:** 2026-08-03T14:35:19Z
- **Tasks:** 3 (Task 1 en TDD RED→GREEN)
- **Files modified:** 20 code + 3 tests

## Accomplishments

- **Fail-closed prouvé par la matrice TDD (21 tests)** : sans ligne `TenantEmailSettings` (état du déploiement), `resolveEmailPolicy` supprime TOUT — le flip `MAIL_DRY_RUN=false` du 22-07 ne peut provoquer aucun envoi applicatif tant que Laurent n'a rien coché.
- **Mode session test prouvé** : master OFF + catégorie cochée + `sessionId ∈ testSessionIds` = SEUL chemin d'envoi master-off. Catégorie décochée = suppress même en mode test.
- **Pitfall 1 fermé à la racine** : `Invoice.reminderCount`, `PreEnrollment.reminderCount`, `OpcoSubmission.reminderCount` ne sont incrémentés QUE sur départ réel (`ok && !dryRun`) — ni dry-run env, ni suppression réglages, ni échec SMTP ne brûlent de niveau (5 tests dédiés sur le core relances factures).
- **tsc = filet d'exhaustivité** : `SendMailInput.context` requis → `pnpm exec tsc --noEmit` exit 0 prouve les 12 call-sites couverts ; grep négatif `sendMail({ to:` hors tests = 0.
- **UI Paramètres organisme** : section « Envois d'emails » après Facturation — badge « Coupés — mode test »/« Actifs », interrupteur général, 6 catégories avec hints (⚠ règle payeur sur Relances factures), sélecteur sessions test (30 récentes ∪ sélection existante, chips, cap 20).
- **Même circuit CI que 22-06** : PR #9 gate `test` VERT → merge commit `7e59abe` (jamais squash), diff post-merge 0, Deploy migrations « No pending migrations to apply. », Vercel Production Ready (2 min), worker Railway rebuilt+redéployé (`76defe0a` RUNNING, 4 apps pm2 online, crons enregistrés).

## Task Commits

1. **Task 1 RED: matrice de garde** - `0951337` (test)
2. **Task 1 GREEN: modèle + garde central** - `20a6d87` (feat) — migration `20260803134935_tenant_email_settings` appliquée `migrate deploy` (cloud), re-deploy = « No pending », `migrate status` clean
3. **Task 2: 12 call-sites + compteurs conditionnels** - `eb6af1d` (feat)
4. **Task 3: UI Paramètres + schéma Zod + action** - `7d2e88d` (feat)
5. **Merge main:** PR #9 → `7e59abe` (merge commit)

## Documentation demandée par le checker

### ① Retentatives quotidiennes en mode suppressed (sémantiquement voulu)

Le compteur n'étant plus consommé et `lastReminderAt` n'étant plus touché en suppression, **le cron Railway quotidien (8h Paris) re-tente chaque facture éligible tous les jours tant que les réglages tenant sont fermés**. Chaque tentative écrit 1 AuditLog `invoices.reminder_sent` avec `diff: { dryRun:true, suppressedBySettings:true, counterConsumed:false }` — soit ~1 entrée/jour/facture éligible (aujourd'hui : FAC-000006/007/008). C'est le comportement voulu : la trace prouve que le garde-fou travaille, le rapport `pending-reminders-report.ts` (22-04) reste lisible, et **le tableau B du rapport 22-07 (relances brûlées) est structurellement vide à l'avenir** — plus aucun brûlage possible, quelle que soit la config env.

### ② Signature du `context` pour le script de preuve d'envoi du 22-07 (Task 4)

```ts
import { sendMail } from '@/lib/mailer';

const result = await sendMail({
  to, subject, html, text,
  context: {
    tenantId: '<tenantId Start Academy>',
    category: 'internal_notification',      // catégorie RECOMMANDÉE pour la preuve
    sessionId: '<id d'une session cochée en mode test>', // REQUIS tant que master OFF
  },
});
// Départ réel ⇔ result.ok && !result.dryRun (messageId présent).
// result.suppressed === true ⇒ bloqué par les réglages (pas une erreur).
```

**Catégorie recommandée : `internal_notification`** (« Notifications internes (équipe) ») — le destinataire est un membre de l'équipe (Laurent), jamais un apprenant/payeur. **Ce que Laurent doit cocher AU PRÉALABLE dans Paramètres organisme → Envois d'emails** :
1. Cocher la catégorie **« Notifications internes (équipe) »** ;
2. Laisser l'interrupteur général **OFF** (mode test) et cocher **une session dans « Sessions autorisées en mode test »** — le script passe alors le `sessionId` de cette session ;
   - Alternative (déconseillée pour un premier test) : interrupteur général ON → le `sessionId` devient inutile (`null` accepté).

⚠ Piège : master OFF + `sessionId: null` = suppress `master-off` — un script de preuve SANS sessionId ne partira jamais en mode test. Les 6 valeurs `EmailCategory` : `invoice_reminder`, `preinscription_reminder`, `opco_reminder`, `opco_submission`, `internal_notification`, `user_invitation`.

### Pour l'orchestrateur — 22-07 Task 4 DÉBLOQUÉE

Le flip `MAIL_DRY_RUN=false` est désormais sans danger : la couche applicative reste fermée par défaut (aucune ligne `TenantEmailSettings` en base → tout supprimé). La condition « déploiement effectif de ce plan » est **satisfaite** : Vercel Production Ready post-merge #9 ET worker Railway `76defe0a` RUNNING avec le garde embarqué. MAIL_DRY_RUN est resté `true` partout — ce plan n'a rendu AUCUN envoi possible ; la levée env reste l'affaire exclusive du 22-07.

## Files Created/Modified

- `packages/db/prisma/schema.prisma` + migration `20260803134935_tenant_email_settings` — modèle FK-less (pattern RevenueTarget), 100 % additif
- `apps/web/src/lib/email-policy.ts` — décision pure + `EmailCategory` + `EMAIL_CATEGORY_FIELD/LABELS`
- `apps/web/src/lib/mailer.ts` — context requis, ordre ①env ②findUnique settings ③policy ④suppressed tracé masqué (D-17) ⑤SMTP intact
- 10 fichiers call-sites (voir key-files) — contexte + compteurs conditionnels ; transitions de statut (`sendOpcoSubmission` DRAFT→SENT) et toggles legacy lead NON touchés
- `packages/shared/src/schemas/tenant.ts` — `EmailSettingsSchema`/`EmailSettingsInput`
- `apps/web/src/server/actions/email-settings.ts` — `updateEmailSettings` clone `invoice-settings.ts`
- `apps/web/src/components/parametres/email-settings-form.tsx` + `parametres/page.tsx` — section UI

## Decisions Made

- Migration générée par `prisma migrate diff --from-url` (pas de shadow DB contre le cloud) — la voie `--create-only` du plan supposait un shadow DB dispo ; le fallback prévu au plan a été utilisé.
- `packages/shared/src/schemas/index.ts` non modifié : `export * from './tenant'` couvrait déjà le nouveau schéma.
- Redeploy Railway = `railway up` (build frais) et non `railway redeploy` (aurait rejoué l'ancienne image sans le garde).
- Suppression = retour dry-run (`{ ok:true, dryRun:true, suppressed:true }`) : aucun call-site ne peut la confondre avec une erreur.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `p.session.id` non chargé dans dossier-reminder.ts**
- **Found during:** Task 2
- **Issue:** le recensement disait « déjà chargé » mais le `select` session ne remontait pas `id`
- **Fix:** ajout `id: true` au select session
- **Files modified:** apps/web/src/server/actions/dossier-reminder.ts
- **Verification:** tsc exit 0
- **Committed in:** eb6af1d

**2. [Rule 3 - Blocking] `batch.tenantId` absent du select closure worker**
- **Found during:** Task 2
- **Issue:** le select `closureBatch` ne remontait pas `tenantId`, requis par le contexte
- **Fix:** ajout `tenantId: true` au select
- **Files modified:** apps/web/src/lib/closure/worker.ts
- **Verification:** tsc exit 0, suite verte
- **Committed in:** eb6af1d

---

**Total deviations:** 2 auto-fixed (1 bug de recensement, 1 blocking select).
**Impact on plan:** Corrections minimales de selects — aucun scope creep.

## Issues Encountered

- URLs `.env` racine entre guillemets → P1013 sur le premier `migrate status` ; strip des quotes avant export shell (dotenv-cli absent, leçon Phase 19 réappliquée).
- Check Vercel « Preview » de la PR #9 en échec : attendu et documenté (déviation ④ 21-04 — previews sans env Production, le gate protégé est le check `test` seul).

## Known Stubs

Aucun — pas de valeur codée en dur ni de placeholder ; les défauts « tout OFF » sont l'état métier voulu (fail-closed), modifiables depuis l'UI livrée.

## User Setup Required

None côté code. **Action Laurent (quand il voudra ouvrir les envois, après le flip 22-07)** : Paramètres organisme → « Envois d'emails » → cocher les catégories voulues + sessions test (voir ② ci-dessus).

## Next Phase Readiness

- **22-07 Task 4 (flip MAIL_DRY_RUN=false) débloquée** — condition de déploiement satisfaite (Vercel + Railway), séquence D-06 inchangée : rapport pending-sends re-joué le jour J → validation Laurent → flip Vercel ET Railway.
- 22-08/22-09/22-10 indépendants, non impactés.

---
*Phase: 22-bascule-prod-conformit-rgpd*
*Completed: 2026-08-03*

## Self-Check: PASSED

7/7 fichiers clés présents sur disque, 5/5 commits vérifiés dans l'historique (0951337, 20a6d87, eb6af1d, 7d2e88d, merge 7e59abe).

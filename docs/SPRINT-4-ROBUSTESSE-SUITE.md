# Sprint 4 — Robustesse (suite)

Date : 2026-06-09

Suite directe du [Sprint 3](SPRINT-3-ROBUSTESSE.md). Objectif : finir la
robustesse niveau MVP→Pro en posant un filet de sécurité systémique
(validator multi-tenant), en terminant la migration des mails vers la
queue, et en standardisant les politiques BullMQ.

---

## 1. Prisma extension validator multi-tenant

**Problème** : 94% des Server Actions appliquent un filtre `tenantId`,
mais il suffit qu'on en oublie UN pour qu'un user d'un tenant lise/écrive
les données d'un autre tenant (fuite cross-tenant). Aucun garde-fou
systémique avant ce sprint.

**Livré** : [packages/db/src/tenant-validator.ts](../packages/db/src/tenant-validator.ts)

Prisma extension `$extends({ query })` qui :
- Liste **26 modèles multi-tenant** (Person, Organization, TrainingSession,
  Invoice, Lead, AuditLog…). User exempté (auth Lucia fait des lookup par
  email global).
- Vérifie pour CHAQUE opération que :
  - **Read** (findFirst/findMany/count/aggregate/groupBy) → `where.tenantId` présent
  - **Update / Delete** (update/updateMany/delete/deleteMany/upsert) → `where.tenantId` présent
  - **Create** (create/createMany) → `data.tenantId` présent (ou `data.tenant.connect`)
- Mode pilotable via `TENANT_VALIDATOR_MODE` env :
  - `off` : extension désactivée (scripts data, seed)
  - `warn` (défaut) : warning console.warn + stack trace + on laisse passer
  - `strict` : throw, la query est refusée

**Stratégie de déploiement** :
1. Garder `warn` au démarrage → laisser tourner quelques jours → repérer
   toutes les violations dans les logs.
2. Fixer les call sites manquants au fil de l'eau.
3. Passer en `strict` en prod quand on est confiant.

**Client `prismaUnsafe`** également exposé pour les scripts data /
migrations / seed qui doivent traverser les tenants intentionnellement.

```ts
// Code métier — utilise le client validé
import { prisma } from '@qualiof/db';
await prisma.person.findFirst({ where: { id, tenantId: user.tenantId } });

// Script data global — bypass le validator
import { prismaUnsafe } from '@qualiof/db';
await prismaUnsafe.person.findMany(); // OK, pas de warn
```

**Tests** : [tenant-validator.test.ts](../apps/web/src/lib/__tests__/tenant-validator.test.ts)
— 5 cas (export modèles, exemption User, modes off/warn/strict).

---

## 2. Migration sendMail → enqueueMail (8 callsites)

**Sprint 3** avait migré 2 callsites (preinscriptions + lead-notifications)
pour démontrer le pattern. Sprint 4 termine la migration des 8 callsites
restants :

| Fichier | Action | Idempotency key |
|---|---|---|
| `server/actions/dossier-reminder.ts` | sendDossierReminderEmail | `dossier-reminder:{participantId}:{reminderType}:{today}` |
| `server/actions/preinscription-reminders.ts` | sendPreEnrollmentReminder | `preinscription-reminder:{preEnrollmentId}:{N}` |
| `app/api/cron/preinscription-reminders/route.ts` | cron daily | `preinscription-reminder-cron:{id}:{N}` |
| `server/actions/invoices.ts` | sendInvoiceReminder | `invoice-reminder:{invoiceId}:{level}` |
| `lib/closure/worker.ts` | notif batch closure | `closure-notif:{batchId}:{userId}:{status}` |
| `server/actions/tenant-users.ts` | invitation | `user-invitation:{invitationId}` |
| `server/actions/tenant-users.ts` | password reset | `user-password-reset:{invitationId}` |
| `server/actions/tenant-users.ts` | invitation resend | `user-invitation-resend:{invitationId}` |

Toutes les actions retournent maintenant en ~50ms (au lieu de 500-2000ms
SMTP) — le worker mailer envoie en async.

**Note** : `r.dryRun` (ancienne API) remplacé par `r.mode === 'dry-run'`
dans les 4 sites qui consommaient cette info.

---

## 3. Standardisation politiques BullMQ

**Avant Sprint 4** :

| Queue | Attempts | Backoff | TTL âge |
|---|---|---|---|
| closure-generation | 3 | 5s exp | **absent** |
| invoice-reminders | 3 | 60s exp | **absent** |
| mailer-outbound | 5 | 30s exp | 7j / 30j |

Sans TTL d'âge, les jobs s'accumulent indéfiniment dans Redis (juste cap
par count). Problématique pour un user qui lance 1000+ packs closure
sur une semaine — la mémoire Redis dérive.

**Livré** : [lib/bullmq-policies.ts](../apps/web/src/lib/bullmq-policies.ts)

3 politiques nommées documentées et appliquées :

| Politique | Attempts | Backoff | Complétés | Échoués | Usage |
|---|---|---|---|---|---|
| `FAST_JOB_POLICY` | 5 | 30s exp | 1000 / 7j | 500 / 30j | Mail, notifs, IO court |
| `STANDARD_JOB_POLICY` | 5 | 10s exp | 500 / 7j | 200 / 30j | Workflows métier (closure Mistral) |
| `SLOW_JOB_POLICY` | 3 | 60s exp | 100 / 1j | 50 / 7j | Crons quotidiens (reminders) |

**Application** :
- `closure-generation` → STANDARD (attempts 3→5, Mistral peut throttle)
- `invoice-reminders-daily` → SLOW (cron quotidien, retry espacé)
- `mailer-outbound` → FAST (identique au Sprint 3 mais centralisé)

---

## 4. Migration createAction — reportée

L'audit identifiait 24 actions sans Zod à migrer vers `createAction`.

**Décision** : la migration aurait cassé les signatures (paramètre string
→ objet `{ … }`) et donc les call sites + tests existants (250+ lignes
de tests autour de `notification-mark-read` par ex.). Trop invasif pour
ce sprint.

Plan Sprint 5 : migration progressive, par groupes fonctionnels (notifications,
puis générateurs PDF, puis dossiers OPCO), avec adaptation simultanée des
tests et call sites.

Le helper `createAction` reste en place et utilisable pour toute nouvelle
action écrite à partir de maintenant.

---

## Tests

Total Sprint 1+2+3+4 : **28 tests verts**, 0 erreur TypeScript.

| Fichier | Tests | Sprint |
|---|---|---|
| `file-validation.test.ts` | 11 | S1 |
| `logger.test.ts` | 5 | S2 |
| `create-action.test.ts` | 7 | S3 |
| **`tenant-validator.test.ts`** | **5** | **S4** |

---

## Récap fichiers créés / modifiés

| Type | Chemin |
|---|---|
| Nouveau | `packages/db/src/tenant-validator.ts` |
| Nouveau | `apps/web/src/lib/bullmq-policies.ts` |
| Nouveau | `apps/web/src/lib/__tests__/tenant-validator.test.ts` |
| Nouveau | `docs/SPRINT-4-ROBUSTESSE-SUITE.md` |
| Modifié | `packages/db/src/index.ts` (wrap prisma + export `prismaUnsafe`) |
| Modifié | `apps/web/src/lib/closure/queue.ts` (STANDARD policy) |
| Modifié | `apps/web/src/lib/invoice-reminders/queue.ts` (SLOW policy) |
| Modifié | `apps/web/src/lib/mailer-queue/queue.ts` (FAST policy centralisée) |
| Modifié | `apps/web/src/lib/closure/worker.ts` (sendMail → enqueueMail) |
| Modifié | `apps/web/src/server/actions/dossier-reminder.ts` (sendMail → enqueueMail) |
| Modifié | `apps/web/src/server/actions/preinscription-reminders.ts` (sendMail → enqueueMail) |
| Modifié | `apps/web/src/server/actions/invoices.ts` (sendMail → enqueueMail) |
| Modifié | `apps/web/src/server/actions/tenant-users.ts` (3 sendMail → enqueueMail) |
| Modifié | `apps/web/src/app/api/cron/preinscription-reminders/route.ts` (sendMail → enqueueMail) |

## Variables d'env

- `TENANT_VALIDATOR_MODE` (nouveau, optionnel) : `off` | `warn` (défaut) | `strict`

## Reste à faire (Sprint 5 et au-delà)

- Migration progressive des 24 actions sans Zod vers `createAction`
  (notifications puis dossiers-opco puis générateurs PDF)
- Backup push vers stockage distant (MinIO/S3 externe, ou Supabase backups)
- Sentry / GlitchTip pour agrégation visuelle des erreurs (skip Sprint 2
  par décision Laurent — à reconsidérer si volume d'erreurs justifie un outil)
- Tracing OpenTelemetry si on veut corréler avec services externes
  (Mistral, Supabase, OPCO API)
- Audit complet des index Postgres + EXPLAIN ANALYZE sur les listings
  (apprenants, factures, sessions) — il y a probablement des N+1 et
  des full scans dans les pages de bilan

# 22-DATA-GAP-AUDIT — Audit d'écart local↔cloud (D-01)

- **Date d'exécution :** 2026-07-06T20:25:35Z
- **Commande exacte :** `LOCAL_DATABASE_URL=postgresql://qualiof:***@localhost:5432/qualiof CLOUD_DATABASE_URL=postgresql://postgres.gntlqyscahbgjrmsbzil:***@aws-0-eu-west-1.pooler.supabase.com:5432/postgres pnpm tsx scripts/audit-data-gap.ts` (depuis `apps/web/`)
- **Script :** `apps/web/scripts/audit-data-gap.ts` — LECTURE SEULE STRICTE (SELECT uniquement, comptages exacts `count(*)`, jamais reltuples)
- **DUMP_DATE de référence :** 2026-07-03T23:59:59Z (dump du 2026-07-03)
- **Tables locales :** 48 — **tables cloud :** 48

## Tableau complet (48 tables)

| Table | count_local | count_cloud | delta (cloud−local) | max_local_createdAt | max_local_updatedAt | verdict_table |
| --- | ---: | ---: | ---: | --- | --- | --- |
| AIGenerationJob | 2808 | 825 | -1983 | 2026-07-04T06:54:11.986Z | 2026-07-04T06:54:23.478Z | FAIL — donnée locale postérieure au dump |
| AgeficePointAccueil | 151 | 151 | 0 | 2026-04-28T12:22:38.321Z | 2026-04-28T12:22:38.322Z | PASS |
| AgeficeProfile | 143 | 143 | 0 | 2026-06-16T10:04:21.703Z | 2026-06-16T10:04:21.703Z | PASS |
| Attendance | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| AuditLog | 358 | 386 | 28 | 2026-07-03T09:13:14.419Z | — | PASS |
| AuthSession | 4 | 12 | 8 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| BillingProfile | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| ClosureBatch | 250 | 80 | -170 | 2026-07-04T06:53:25.904Z | 2026-07-04T06:54:11.973Z | FAIL — donnée locale postérieure au dump |
| ClosureJob | 4215 | 851 | -3364 | 2026-07-04T06:53:25.904Z | 2026-07-04T06:54:11.971Z | FAIL — donnée locale postérieure au dump |
| Contact | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| Document | 1112 | 539 | -573 | 2026-07-04T06:54:24.586Z | — | FAIL — donnée locale postérieure au dump |
| DocumentTemplate | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| EmailMessage | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| EmailTemplate | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| ExternalIdentity | 804 | 804 | 0 | 2026-06-10T16:13:39.587Z | — | PASS |
| InternalComment | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| Invoice | 8 | 10 | 2 | 2026-05-21T15:54:55.729Z | 2026-05-23T07:17:39.627Z | PASS |
| InvoicePayment | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| Lead | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| LeadAction | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| LegalLink | 512 | 489 | -23 | 2026-07-01T17:12:24.895Z | — | PASS |
| Location | 52 | 50 | -2 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| Notification | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| OpcoCatalog | 6 | 6 | 0 | 2026-04-28T13:03:03.709Z | 2026-06-10T16:16:31.769Z | PASS |
| OpcoSubmission | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| Organization | 275 | 263 | -12 | 2026-07-01T17:12:24.893Z | 2026-07-02T17:12:41.014Z | PASS |
| PedagogicalAsset | 1981 | 346 | -1635 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| Person | 327 | 316 | -11 | 2026-07-01T16:06:58.092Z | 2026-07-01T16:06:58.092Z | PASS |
| PreEnrollment | 6 | 9 | 3 | 2026-05-21T12:56:44.396Z | 2026-07-04T19:16:22.346Z | FAIL — donnée locale postérieure au dump |
| QualiopiDocCatalog | 14 | 14 | 0 | 2026-04-27T14:17:06.077Z | 2026-06-10T16:16:31.788Z | PASS |
| Quote | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| QuoteLine | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| RegulatoryWatch | 140 | 166 | 26 | 2026-05-25T12:45:31.307Z | 2026-06-08T09:04:23.764Z | PASS |
| RevenueTarget | 1 | 0 | -1 | 2026-06-22T16:23:55.634Z | 2026-06-22T16:23:55.634Z | PASS |
| SensitiveData | 185 | 183 | -2 | 2026-06-24T15:16:27.477Z | 2026-06-24T15:16:27.477Z | PASS |
| SessionCalendarSync | 1349 | 0 | -1349 | 2026-07-03T09:55:36.655Z | 2026-07-03T12:15:49.870Z | PASS |
| SessionParticipant | 301 | 291 | -10 | 2026-07-01T16:06:58.096Z | 2026-07-01T16:07:36.957Z | PASS |
| SessionSlot | 18 | 18 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| SessionTrainer | 80 | 80 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| Task | 4 | 4 | 0 | 2026-05-23T08:32:01.339Z | 2026-07-03T09:12:46.938Z | PASS |
| Tenant | 1 | 1 | 0 | 2026-04-27T14:17:06.012Z | 2026-05-21T11:34:37.685Z | PASS |
| TrainerAvailability | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| TrainingModule | 0 | 0 | 0 | — | — | PASS (aucune colonne createdAt/updatedAt ou table vide) |
| TrainingProduct | 32 | 33 | 1 | 2026-06-13T10:13:53.252Z | 2026-07-01T16:09:03.483Z | PASS |
| TrainingSession | 75 | 75 | 0 | 2026-07-01T16:06:57.967Z | 2026-07-01T16:07:36.902Z | PASS |
| User | 2 | 3 | 1 | 2026-05-25T14:23:04.486Z | 2026-06-09T07:28:36.112Z | PASS |
| UserInvitation | 1 | 1 | 0 | 2026-05-25T14:23:04.493Z | — | PASS |
| _prisma_migrations | 29 | 1 | -28 | — | — | informatif (hors verdict — écart migrations attendu : local = 29 migrations archivées, cloud = baseline 0_init) |

## VERDICT : FAIL — le cloud ne peut PAS être déclaré unique source de vérité en l'état

**La déclaration « cloud = unique source de vérité (D-01) » N'EST PAS émise.** Décision utilisateur requise (voir §Lignes fautives et §Découverte majeure).

---

## Lignes fautives (critère du plan : données locales postérieures au 2026-07-03)

5 tables locales contiennent des lignes postérieures à DUMP_DATE. Investigation lecture seule (psql local) :

### 1. Pack témoin SES-0093 du 2026-07-04 06:53–06:54 UTC (validation Phase 16)

Run de validation Phase 16 (témoin SES-0093, 16/16, ~3 min) exécuté sur la base LOCALE le matin du 4 juillet — AVANT la mise en service de la base cloud (Phase 19, 5 juillet) :

| Table | Lignes post-dump | Détail |
| --- | ---: | --- |
| ClosureBatch | 1 | batch `1f2a94f9…` COMPLETED, session **SES-0093** |
| ClosureJob | 14 | tous rattachés au batch SES-0093 |
| AIGenerationJob | 7 | openrouter (6× cloud:fast, 1× cloud:quality), refTable=PedagogicalAsset |
| Document | ~24 | documents du pack SES-0093 (createdAt 06:53–06:54) |

**Nature : artefacts de génération 100 % regénérables** (le pack SES-0093 peut être re-produit côté cloud en 1 clic ; le pack témoin SES-0094 de la Phase 22 suit d'ailleurs le même protocole).

### 2. PreEnrollment — 1 ligne touchée le 2026-07-04 19:16 UTC

Ligne `992edea0…` (**Laurent MARX**, statut EXTRACTED, créée le 21/05) : seul `updatedAt` est postérieur au dump — effet de bord de la migration storage Phase 18 (re-clé des objets CNI/RIB) sur une ligne de TEST. La ligne elle-même existe côté cloud (créée avant le snapshot). **Aucune donnée métier nouvelle.**

---

## ⚠ DÉCOUVERTE MAJEURE — la base cloud est un snapshot du 2026-06-16, PAS du dump du 2026-07-03

L'audit révèle que **le dump frais du 2026-07-03 (48 tables / 15 118 lignes) n'a jamais été restauré dans Supabase**. La base cloud vivante est issue de la restauration staging du **2026-06-16 ~10h04 UTC** (E1-E4), sur laquelle la Phase 19 a posé la baseline de migrations `0_init` + un drift forward db push.

### Preuves (toutes lecture seule)

- `max(Person.createdAt)` cloud = **2026-06-16T10:04:21Z** (local : 2026-07-01T16:06:58Z) ; idem Organization/LegalLink/SessionParticipant/SensitiveData — toutes bornées au 16/06 10h04-10h06.
- Dernière TrainingSession cloud = **SES-0097 créée le 2026-06-16** ; **SES-0101 est ABSENTE du cloud**.
- `SessionCalendarSync` : **0 ligne côté cloud** vs 1 349 en local — cohérent avec 19-02-SUMMARY : « la base cloud restaurée manquait TrainingProduct.derouleJson, RevenueTarget, SessionCalendarSync (ajoutés localement via db push après le dump) » — objets créés localement APRÈS mi-juin.
- Volumétrie : la base cloud totalise ~6 200 lignes (hors ajouts cloud) — incompatible avec le dump du 03/07 (15 118 lignes).

### Inventaire de l'écart local (16/06 → 03/07) ABSENT du cloud

**Données MÉTIER réelles (non regénérables) :**

| Donnée | Volume | Détail |
| --- | ---: | --- |
| **TrainingSession SES-0101** | 1 | « L'IA au service des conseillers immobiliers (8h) — **27/07/2026** » créée le 01/07 — **session réelle FUTURE** |
| **SessionParticipant** | 12 | dont 11 inscrits SES-0101 |
| **Person** | 11 | Jérémy TOUATI, Karine COMMISSAIRE (24/06) + Gavina FORLANI, Nicolas TOURNIAIRE, Caroline LECRUBIER, Julien LAUGIER, Corentin PASTORINO, Don DUMLAO, Stéphane FERRARI, Vincent BROSSARD, Jihane BENSOURI (01/07) |
| **Organization** | 12 | EI/enseignes des personnes ci-dessus |
| **LegalLink** | 23 | multi-casquette EI + Enseigne |
| **SensitiveData** | 2 | rattachées aux 2 personnes du 24/06 |
| **RevenueTarget** | 1 | objectif CA (22/06) |
| **SessionCalendarSync** | 1349 | **état d'idempotence Google Calendar** (Phase 14 : 1 330 events réels dans l'agenda « Rappel Formations ») — sans ces lignes de mapping, tout re-backfill cloud DUPLIQUERAIT les events dans l'agenda |
| AuditLog | 16 | traçabilité locale de la période |

**Artefacts regénérables (générations 18-19/06 masse 2025, Tracfin SES-0086 23/06, figeage produits, corrections templates, SES-0093 04/07) :**

- ~171 ClosureBatch / ~3 397 ClosureJob / ~2 159 AIGenerationJob / ~1 005 Document / ~1 635 PedagogicalAsset, répartis sur **68 sessions** (SES-0006 → SES-0101). Regénérables côté cloud (coût OpenRouter à prévoir si regénération de masse).

**Notes complémentaires :**

- Les déltas cloud POSITIFS (AuditLog +28, RegulatoryWatch +26, AuthSession +8, PreEnrollment +3, Invoice +2, TrainingProduct +1, User +1) = activité cloud légitime depuis le 16/06 (staging, E2E, worker RSS, user e2e) — attendus, hors verdict.
- TrainingSession 75/75 : égalité de comptage TROMPEUSE — le cloud a 1 session que le local n'a plus, le local a SES-0101 que le cloud n'a pas.
- `_prisma_migrations` : 29 (archives locales) vs 1 (baseline `0_init` cloud) — écart ATTENDU, informatif, hors verdict.

### Conséquence

Déclarer aujourd'hui « cloud = unique source de vérité » abandonnerait silencieusement **SES-0101 (session réelle du 27/07/2026 avec 11 inscrits), 11 personnes, 12 organisations, 23 LegalLink, 2 SensitiveData, 1 RevenueTarget et l'état d'idempotence Google Calendar (1 349 mappings)**. Le pg_dump d'archive prévu au plan 22-10 protégerait ces données de la destruction, mais elles resteraient invisibles de la prod.

**Décision Laurent requise** (options détaillées dans la déviation remontée par l'exécuteur du plan 22-03) : report sélectif des données métier vers le cloud, ou re-restore complet (écraserait le travail cloud depuis le 05/07 — exclu par D-01 sauf révision), ou abandon assumé ligne à ligne.

---

*Rapport généré par `apps/web/scripts/audit-data-gap.ts` (exit 1 = FAIL) — Phase 22, plan 22-03, Task 1.*
*Aucune écriture effectuée sur aucune des deux bases. Aucun re-dump.*

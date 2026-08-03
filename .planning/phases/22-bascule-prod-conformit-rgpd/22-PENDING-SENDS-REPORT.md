# 22-PENDING-SENDS-REPORT — Relances factures : envois en attente + relances brûlées (D-06 / Pitfall 1)

> Rapport vivant du plan 22-07 : la version Wave 1 (2026-07-06) et le relevé intermédiaire
> (2026-07-27) sont conservés en historique ; la section « Rafraîchi le 2026-08-03 » est
> l'état du jour J, base de la décision de Laurent (checkpoint 22-07 Task 2).

---

## Historique ① — Version Wave 1 (générée le 2026-07-06T20:32:31Z, plan 22-04)

**Tableau A (envois qui partiraient)** : **AUCUN** — aucune facture ne passait les filtres worker + core.

**Horizon (Wave 1)** :

| Facture | Payeur | Statut | Échéance | Éligible au cron à partir du | Restant dû |
| --- | --- | --- | --- | --- | --- |
| FAC-000006 | AKORIMMO | ISSUED | 2026-06-20 | 2026-07-20 | 1 440,00 € |
| FAC-000007 | Imagimmo | ISSUED | 2026-06-20 | 2026-07-20 | 1 008,00 € |
| FAC-000008 | KING Kristin | ISSUED | 2026-06-20 | 2026-07-20 | 1 008,00 € |

**Tableau B (relances brûlées dry-run)** : 0 brûlée, 0 AuditLog `invoices.reminder_sent` au total, 0 facture avec `reminderCount > 0`. Le cron dry-run n'avait alors JAMAIS consommé de niveau.

## Historique ② — Relevé intermédiaire (généré le 2026-07-27T09:17:22Z, pre-flight 22-06)

**Tableau A** : 1 relance — FAC-000007 (Imagimmo), niveau 1, destinataire `aucune` → ⚠ AUCUN EMAIL (échec loggé, pas d'envoi). Horizon vide.

**Tableau B** : 0 relance brûlée (`dryRun=true`) — MAIS 11 AuditLog `invoices.reminder_sent` au total, dont **4 avec `dryRun=false`**, et 2 factures à `reminderCount > 0`. ⚠ Ce relevé n'avait pas élucidé ces 4 logs `dryRun=false` — voir la découverte ci-dessous.

---

## Rafraîchi le 2026-08-03 (post-bascule, pré-flip) — RAPPORT DU JOUR J

**Généré le :** 2026-08-03T11:18:58.192Z (ré-exécution de `apps/web/scripts/pending-reminders-report.ts`, lecture seule, base = `.env` → cloud Supabase production).

**Parité de sélection :** filtres du cron Railway répliqués à l'identique — `REMINDER_START_DATE` importée du worker (2026-05-19T00:00:00.000Z), status IN (ISSUED, PARTIAL, OVERDUE), échéance dépassée du 1er seuil (`reminderDays[0]`, défaut [30, 45]), puis filtres du core : `reminderCount < maxLevel`, dedup 24 h sur `lastReminderAt`.

### Tableau A — Envois qui partiraient au premier run réel (flip MAIL_DRY_RUN=false)

| Facture | Payeur | Email destinataire | Source cascade | Niveau qui partirait | reminderCount actuel | maxLevel | Dernière relance | Restant dû | Flag |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FAC-000007 | Imagimmo | — | `aucune` | 1 | 0 | 2 | — | 1 008,00 € | ⚠ AUCUN EMAIL (échec loggé, pas d'envoi) |

**Total : 1 « relance » partirait, soit 0 email réel** (le destinataire est introuvable — l'organisation Imagimmo n'a ni `emailBilling` ni `email`, et la facture n'a pas de participant), dont **0 directement vers un APPRENANT** (règle payeur).

**Horizon** : aucune autre facture ISSUED/PARTIAL/OVERDUE en attente de franchir le seuil.

### Tableau B — Relances « brûlées » (Pitfall 1) — VERDICT CORRIGÉ PAR LA DÉCOUVERTE CI-DESSOUS

Au sens strict du script (AuditLog `diff.dryRun = true`) : **0 relance brûlée**. Contre-vérification : 18 AuditLog `invoices.reminder_sent` au total, 4 avec `dryRun=false`, 2 factures avec `reminderCount > 0`.

⚠ **MAIS ce « 0 » est trompeur** : une variante du Pitfall 1, invisible au filtre `dryRun=true`, a bien brûlé des compteurs — voir ci-dessous.

### 🔴 DÉCOUVERTE (2026-08-03) — 4 niveaux brûlés en « mode réel raté » (`dryRun=false`, aucun email parti)

**Chronologie établie depuis l'AuditLog (18 entrées `invoices.reminder_sent`) :**

| Date (UTC) | Facture | Niveau | diff.dryRun | Résultat réel |
| --- | --- | --- | --- | --- |
| 2026-07-21 06:02 | FAC-000006 | 1 | **false** | échec SMTP silencieux — compteur incrémenté |
| 2026-07-21 06:02 | FAC-000007 | 1 | — | `no_email_recipient` (pas d'incrément) |
| 2026-07-21 06:04 | FAC-000008 | 1 | **false** | échec SMTP silencieux — compteur incrémenté |
| 2026-07-23 06:02 | FAC-000006 | 2 | **false** | échec SMTP silencieux — compteur incrémenté (niveau MAX atteint) |
| 2026-07-23 06:04 | FAC-000008 | 2 | **false** | échec SMTP silencieux — compteur incrémenté (niveau MAX atteint) |
| 21/07 → 03/08 (quotidien) | FAC-000007 | 1 | — | 15× `no_email_recipient` (aucun incrément) |

**Pourquoi `dryRun=false`** : entre le 20/07 (éligibilité du trio) et le 31/07, le worker Railway avait `SMTP_HOST=ssl0.ovh.net` posé mais **PAS `MAIL_DRY_RUN`** (posée `true` seulement le 31/07, déviation Rule 2 du 22-06) → `isDryRun()` = false → le cron a tourné en **mode réel**.

**Pourquoi AUCUN email n'est parti (faisceau de preuves) :**
1. **`SMTP_USER`/`SMTP_PASS` n'ont JAMAIS été posés sur Railway** (vérifié CLI le 2026-08-03 : host/port/secure/from présents, user/pass ABSENTS ; conforme à 20-SMOKE P5 : « Ne PAS poser d'identifiants SMTP ») → transporteur nodemailer sans `auth`, le relais OVH refuse tout envoi non authentifié. ⚠ La mention du runbook §4 « valeurs… déjà posées et prouvées au 20-05 côté Railway » est **ERRONÉE** (P5 = dette différée, jamais prouvée).
2. **L'egress SMTP (:465/:587) est BLOQUÉ par Railway en plan Hobby** — prouvé au 20-SMOKE P5a/P5b (TIMEOUT vers tout hôte le 2026-07-05, décision Laurent : rester Hobby) : la connexion SMTP n'aboutit même pas.
3. **`sendMail()` catch l'erreur et retourne `{ ok:false }` sans throw** (mailer.ts:95-98) — aucun `messageId` n'a pu être produit.

**Le bug de conception qui a brûlé les compteurs** : `invoice-reminder-core.ts:149-166` n'utilise `mailResult` QUE pour lire `dryRun` — **il incrémente `reminderCount` et pose `lastReminderAt` même quand `mailResult.ok === false`**, et l'AuditLog ne trace ni `ok` ni `error` dans ce chemin. Résultat : FAC-000006 et FAC-000008 sont à `reminderCount = 2/2` (niveau MAX) **alors que leurs payeurs n'ont JAMAIS reçu un seul email** → sans remédiation, silence définitif sur 2 448 € d'impayés.

### État exact des compteurs au 2026-08-03

| Facture | Payeur | Destinataire (cascade actuelle) | reminderCount | lastReminderAt | Emails réellement reçus | Restant dû |
| --- | --- | --- | --- | --- | --- | --- |
| FAC-000006 | AKORIMMO | n.albin@akorimmo.com (`payerOrg.email`) | **2/2 (MAX — plus jamais relancée)** | 2026-07-23 | **0** | 1 440,00 € |
| FAC-000007 | Imagimmo | **AUCUN** (ni emailBilling, ni email, ni participant) | 0/2 | — | 0 | 1 008,00 € |
| FAC-000008 | KING Kristin | kristin@riviera-king.com (`payerOrg.email`) | **2/2 (MAX — plus jamais relancée)** | 2026-07-23 | **0** | 1 008,00 € |

Aucun des 3 destinataires n'est un APPRENANT (cascade `payerOrg` dans les 3 cas ; Imagimmo sans email du tout).

### Chiffrage par option de remédiation (impact sur le 1er run réel du cron)

| Option | Data migration | Emails au 1er run réel | Dont apprenants | Conséquence |
| --- | --- | --- | --- | --- |
| **① Reset complet** — FAC-000006 et FAC-000008 remises à `reminderCount=0`, `lastReminderAt=null` (état pré-brûlage : 0 email réel jamais parti) | 2 factures (snapshot avant, AuditLog `invoices.reminder_reset`) | **2 emails** : niveau 1 → n.albin@akorimmo.com + niveau 1 → kristin@riviera-king.com (+1 échec loggé FAC-000007, 0 email) | **0** | Cycle 30/45 j repart fidèlement ; risque de doublon UNIQUEMENT si Laurent a déjà relancé ces payeurs manuellement hors outil |
| **② Reset sélectif** — Laurent coche facture par facture (FAC-000006 et/ou FAC-000008) | 0 à 2 factures | **0 à 2 emails** selon cochage | 0 | Contrôle nominal total |
| **③ Acceptation en l'état** | aucune | **0 email** (1 tentative FAC-000007 → échec `no_email_recipient`) | 0 | AKORIMMO et KING Kristin ne seront **JAMAIS** relancées (2 448 € en silence définitif) alors qu'elles n'ont rien reçu |

**Action data complémentaire (hors options, recommandée quel que soit le choix)** : renseigner l'email de facturation d'**Imagimmo** dans QualiOF (fiche organisation) — sinon FAC-000007 échouera chaque matin en boucle (`no_email_recipient` quotidien depuis le 21/07).

### ⚠ Pré-requis SMTP découverts (bloquants pour le flip, indépendants de la décision compteurs)

1. **Les credentials SMTP n'existent NULLE PART** : `.env` racine et `.env.bak-22-06` → `SMTP_HOST=""`, `SMTP_USER=""`, `SMTP_PASS=""` (vides) ; Vercel Production → **aucune** variable `SMTP_*` ; Railway → host/port/secure/from sans user/pass. **Laurent doit fournir le couple SMTP_USER/SMTP_PASS** (et confirmer le fournisseur : le runbook et la 7ᵉ fiche DPA disent OVH `ssl0.ovh.net:465`, mais 20-SMOKE note que la boîte est Google Workspace, pas OVH).
2. **Egress SMTP Railway** : bloqué en plan Hobby (preuve P5 du 05/07). Si le workspace est toujours Hobby, le flip Railway produirait de nouveaux échecs silencieux qui re-brûleraient des compteurs. À vérifier/upgrader avant tout flip côté worker.
3. **Coquilles config** : `SMTP_FROM` Railway = `noreply@startacademy.fr` (tiret manquant) ET le mailer lit `MAIL_FROM`, pas `SMTP_FROM` (mailer.ts:40) — la variable posée est morte ; le from réel retombe sur la cascade of-config (`formation@start-academy.fr`).
4. **Bug core à corriger avant le flip** (candidat plan 22-11) : ne plus incrémenter `reminderCount` quand `mailResult.ok === false` (et tracer `ok`/`error` dans l'AuditLog) — sinon tout échec SMTP futur re-brûle des niveaux en silence.

### 🚦 FLIP SUSPENDU — décision Laurent du 2026-08-03

**Le flip `MAIL_DRY_RUN=false` N'EST PAS exécuté dans ce plan**, même après validation de la liste ci-dessus : Laurent exige d'abord un **garde-fou applicatif granulaire** (interrupteur général d'envois OFF par défaut + cases par type d'email + mode test par session) — plan dédié **22-11** à créer et exécuter AVANT toute sortie du dry-run. État au 2026-08-03 : `MAIL_DRY_RUN=true` sur Railway, aucune var SMTP sur Vercel (dry-run structurel) — **aucun email réel ne peut partir**.

## Décision requise (checkpoint plan 22-07 — Task 2)

Avant toute sortie du dry-run, Laurent tranche :

1. **① / ② / ③** — le sort des compteurs brûlés (voir chiffrage ci-dessus). ⚠ Croiser avec la connaissance terrain : AKORIMMO ou KING Kristin ont-ils déjà été relancés manuellement (téléphone, email direct) depuis le 20/06 ?
2. **Validation (ou amendement) de la liste nominative** des relances qui partiront au premier run réel.
3. **Fourniture des credentials SMTP** + confirmation du fournisseur (OVH vs Google Workspace) + statut du plan Railway (Hobby/Pro — egress SMTP).

---
*Phase 22 — créé au plan 22-04 (Task 2), rafraîchi au plan 22-07 (Task 1) le 2026-08-03. Script lecture seule — aucune écriture DB, aucun email envoyé.*

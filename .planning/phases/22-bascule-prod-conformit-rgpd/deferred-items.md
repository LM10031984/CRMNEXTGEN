# Deferred items — Phase 22

Découvertes hors scope du plan courant, à router (22-11 ou backlog).

## Consignés au 22-07 (2026-08-03, Task 1 — rapport pré-flip)

1. **[BUG — candidat prioritaire 22-11] Le core relances incrémente `reminderCount` même quand l'envoi ÉCHOUE.**
   `apps/web/src/lib/invoice-reminders/invoice-reminder-core.ts:149-166` : `mailResult` n'est lu que pour `dryRun` ; `ok:false` (échec SMTP) → incrément + `lastReminderAt` posés quand même, et l'AuditLog ne trace ni `ok` ni `error`. C'est ce qui a brûlé FAC-000006/008 (2 niveaux chacune, 0 email reçu) les 21-23/07. À corriger AVANT tout flip `MAIL_DRY_RUN=false` : ne pas incrémenter sur échec + tracer `ok`/`error`/`messageId` dans le diff. Vérifier aussi la server action UI `sendInvoiceReminder` (même pattern probable).

2. **[CONFIG] `SMTP_FROM` est une variable morte** : le mailer lit `MAIL_FROM` (mailer.ts:40), pas `SMTP_FROM`. La var `SMTP_FROM` posée sur Railway (`QualiOF <noreply@startacademy.fr>` — domaine SANS tiret, coquille 20-SMOKE) est ignorée ; le from réel retombe sur la cascade of-config (`formation@start-academy.fr`). À assainir lors de la pose SMTP : poser `MAIL_FROM` propre, supprimer/corriger `SMTP_FROM`.

3. **[INFRA] Egress SMTP Railway bloqué en plan Hobby** (20-SMOKE P5a/P5b : :465/:587 TIMEOUT vers tout hôte, 05/07). Le runbook §4 supposait à tort Pro. À trancher avant flip côté worker : upgrade Pro OU bascule mailer sur API HTTPS (Brevo/Gmail API — options documentées 20-SMOKE).

4. **[DATA — action Laurent, 1 édition UI] Imagimmo sans email** : ni `emailBilling` ni `email` sur l'organisation → FAC-000007 échoue en boucle (`no_email_recipient` quotidien depuis le 21/07). Renseigner l'email de facturation dans QualiOF.

5. **[OUTILLAGE — déjà noté au 22-06] `sanity-check-env.ts` ne détecte pas les guillemets littéraux** de tête/queue (classe PROD-0674 variante guillemets, incident OF_*). Ajouter la détection.

6. **[OUTILLAGE] `pending-reminders-report.ts` définit « brûlé » = `diff.dryRun=true` uniquement** : la classe « mode réel raté » (`dryRun=false` + envoi échoué) est invisible au Tableau B — détectée manuellement au 22-07. Si le script est re-joué après le fix n°1, élargir la définition (ou s'appuyer sur `ok:false` tracé).

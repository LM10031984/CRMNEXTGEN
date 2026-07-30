# 22-PENDING-SENDS-REPORT — Relances factures : envois en attente + relances brûlées (D-06 / Pitfall 1)

**Généré le :** 2026-07-06T20:32:31.364Z (script lecture seule `apps/web/scripts/pending-reminders-report.ts`, base = `.env` → cloud Supabase)

**Parité de sélection :** filtres du cron Railway répliqués à l'identique — `REMINDER_START_DATE` importée du worker (2026-05-19T00:00:00.000Z), status IN (ISSUED, PARTIAL, OVERDUE), échéance dépassée du 1er seuil (`reminderDays[0]`, défaut [30, 45]), puis filtres du core : `reminderCount < maxLevel`, dedup 24 h sur `lastReminderAt`.

## Tableau A — Envois qui partiraient au premier run réel (flip MAIL_DRY_RUN=false)

**Aucune relance ne partirait au prochain run du cron** (aucune facture ne passe les filtres worker + core à la date de génération).

⚠ Attention Pitfall 1 : ce « zéro » peut être un SILENCE ARTIFICIEL — des factures éligibles ont pu atteindre leur niveau max (`reminderCount >= maxLevel`) uniquement à cause des relances brûlées en dry-run (voir Tableau B).

### Horizon — prochaines factures qui deviendront éligibles

| Facture | Payeur | Statut | Échéance | Éligible au cron à partir du | Restant dû |
| --- | --- | --- | --- | --- | --- |
| FAC-000006 | AKORIMMO | ISSUED | 2026-06-20 | 2026-07-20 | 1 440,00 € |
| FAC-000007 | Imagimmo | ISSUED | 2026-06-20 | 2026-07-20 | 1 008,00 € |
| FAC-000008 | KING Kristin | ISSUED | 2026-06-20 | 2026-07-20 | 1 008,00 € |

_Date d'éligibilité = référence d'échéance (dueDate, sinon issueDate) + premier seuil `reminderDays[0]` (défaut 30 j). Si `MAIL_DRY_RUN=false` est actif à cette date, la relance niveau 1 PART réellement au run de 8 h._

## Tableau B — Relances « brûlées » en dry-run (Pitfall 1 — cron Railway depuis la Phase 20)

Traces `AuditLog` action `invoices.reminder_sent` avec `diff.dryRun = true` : le compteur `reminderCount` a été incrémenté SANS qu'aucun email ne parte. Total : **0 relance(s) brûlée(s)** sur 0 facture(s). Relances réellement parties (dryRun=false) toutes factures confondues : **0**.

**Aucune relance brûlée détectée** — aucun AuditLog `invoices.reminder_sent` avec `dryRun=true`.

**Contre-vérification (le zéro n'est pas un artefact du filtre Json) :** 0 AuditLog `invoices.reminder_sent` au TOTAL (tous dryRun confondus) et 0 facture(s) avec `reminderCount > 0` dans toute la base. Le cron dry-run Railway n'a donc encore consommé AUCUN niveau de relance (aucune facture n'a franchi le 1er seuil d'échéance depuis son démarrage).

## Décision requise (checkpoint plan 22-07)

Avant le flip `MAIL_DRY_RUN=false`, Laurent tranche le sort des compteurs brûlés :

1. **① Reset des compteurs brûlés** — remise à l'état pré-dry-run (`reminderCount` décrémenté du nombre de relances brûlées, `lastReminderAt` recalé) : le cycle de relance repart comme si le dry-run n'avait jamais tourné.
2. **② Reset sélectif** — facture par facture, sur la base des deux tableaux ci-dessus (ex. : ne réarmer que les factures encore impayées dont le payeur n'a jamais été relancé par ailleurs).
3. **③ Acceptation en l'état** — les niveaux brûlés restent consommés : aucune relance rétroactive, seules les factures encore sous le niveau max seront relancées.

**ATTENTION : un reset aveugle re-enverrait un niveau 1 à des payeurs peut-être déjà relancés manuellement hors outil** (téléphone, email direct) — croiser avec la connaissance terrain avant de choisir ①.

---
*Phase 22 — Plan 22-04, Task 2 (D-06 / Pitfall 1). Script lecture seule — aucune écriture DB, aucun email envoyé.*

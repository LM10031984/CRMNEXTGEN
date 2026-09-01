# Deferred Items — Phase 20

## Pre-existing test-isolation flakiness (OUT OF SCOPE, plan 20-02)

- **File:** `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts`
- **Symptom:** Passes in isolation (9/9), but fails (8 failed) when run in the
  full parallel suite alongside `closure/__tests__` files.
- **Root cause:** cross-file mock pollution of `bullmq`/`ioredis` module mocks
  (shared `queueAddMock`) — NOT related to the OCR worker change of 20-02.
- **Proof it is pre-existing:** reproduced on the clean tree (git stash) and
  when run with `closure/__tests__` only; the OCR queue driver does not import
  bullmq/ioredis/invoice-reminders.
- **Scope decision:** SCOPE BOUNDARY — only auto-fix issues directly caused by
  the current task's changes. Logged, not fixed here.

## Fiche AGEFICE (demande de prise en charge) — 3 corrections cosmétiques (Laurent, validation 2026-07-06)

- **Champ « Nom commercial » vide** — à remplir (source : Organization de l'apprenant / LegalLink enseigne).
- **Champ « Code APE / Activité principale exercée » vide** — à remplir (dispo via SIRET/Pappers ou saisie fiche Organization).
- **Adresse du lieu de formation mal composée** : rendu actuel « Nice - 16 rue Pastorelli16 rue Pastorelli06000 Nice » (concaténation label+rue+CP+ville sans séparateurs). Attendu : ligne adresse = **nom de la structure** (ex. « Agence Signature ») + « 16 rue Pastorelli », champ CP = « 06000 », champ Ville = « Nice ». Voir `lib/agefice-form-fill.ts` (92 champs pdf-lib) + `Location`.
- **Décision Laurent : différé** — pas bloquant pour le gate Phase 20.

## ✅ RÉSOLU 2026-07-06 — Migration Storage Ph.18 incomplète (objets MinIO jamais copiés vers Supabase)

**Résolution : plan 21-02** — audit DRY + backfill WRITE 871 objets (733 manquants + upsert),
rapport `.planning/audit/STORAGE-BACKFILL-REPORT-2026-07-06.md`. Cause racine : la migration
du 07-04 avait couru contre la base LOCALE ; la base CLOUD (dump antérieur Phase 19)
référençait des clés jamais copiées.

**Re-vérifié indépendamment le 2026-07-06** (session plan-phase 22) : audit lecture seule
(`createSignedUrl` sur chaque clé collectée par `collectAllKeys`) contre la base cloud =
**902/902 présentes côté Supabase, 0 manquante, 0 invalide**.

- MinIO **NON purgé** (destructif = étape séparée, Phase 22+).
- ⚠ Reste pour la bascule (Phase 22) : **re-jouer audit DRY→WRITE→re-audit contre le dump
  FINAL** (les clés référencées changeront ; baseline locale = 3109 clés vs cloud = 902).

<details><summary>Constat d'origine (historique)</summary>

- Constat SES-0094 : AGEFICE/assiduité/convocations/analyses besoin (docs ~juin 2026) présents dans MinIO local, **absents** de Supabase Storage (`Object not found`), malgré le « 3109 objets, 0 lien mort » de la Phase 18.
- Ampleur inconnue → **audit complet** (diff clés référencées en BDD vs objets Supabase) + **backfill idempotent** MinIO→Supabase.
- ⚠ NE PAS purger/éteindre le MinIO local avant le backfill.
- Gate Phase 22 concerné : « aucun 404 sur les preuves ».

</details>

# Migrations historiques archivées — collapse baseline Phase 19

**29 migrations historiques archivées le 2026-07-05 lors du collapse baseline Phase 19.**

## Pourquoi

La base cloud Supabase restaurée (dump 2026-07-03) avait divergé de l'historique linéaire
Prisma via `db push` : plusieurs objets ont été poussés directement dans le schéma sans
migration correspondante. Constaté au `migrate diff` du 2026-07-05 (live cloud vs `schema.prisma`) :

- `TrainingProduct.derouleJson` (JSONB) — colonne poussée hors migration (dette connue projet)
- `RevenueTarget` (table) — poussée hors migration
- `SessionCalendarSync` (table) — poussée hors migration (Phase 14 Google Calendar)

L'historique linéaire des 29 migrations ne correspondait donc plus à l'état réel du schéma.
`_prisma_migrations` contenait bien les 29 lignes « applied » (héritées du dump), mais le schéma
réel manquait les 3 objets db-push ci-dessus → drift.

## Décision (RESEARCH Option A — collapse recommandé)

Baseline unique = `0_init` (généré via `prisma migrate diff --from-empty --to-schema-datamodel`,
soit l'intégralité du schéma courant : 47 tables, 28 enums, extensions incluses).

Le drift db-push (les 3 objets ci-dessus) a été appliqué à la base cloud AVANT de résoudre la
baseline, de sorte que la base réelle = `schema.prisma` = `0_init`. Snapshot de `_prisma_migrations`
pris avant toute manipulation :
`.planning/phases/19-base-postgres-supabase-pooler-migrations-baselin-es/artifacts/prisma-migrations-before-baseline.json`.

## Ne PAS ré-injecter ces migrations

Ces 29 dossiers sont conservés pour l'audit uniquement. Ne PAS les remettre à la racine
`migrations/` : ils casseraient le collapse. La seule migration active est `0_init`.

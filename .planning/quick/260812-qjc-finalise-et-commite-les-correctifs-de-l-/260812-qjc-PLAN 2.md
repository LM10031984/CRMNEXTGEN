---
id: 260812-qjc
title: Finalise et commite les correctifs de l'audit Cowork du 12/08
date: 2026-08-12
mode: quick
status: in_progress
---

# Quick 260812-qjc — Finalisation des correctifs de l'audit Cowork du 12/08

## Contexte

Une boucle d'audit automatisée (sandbox cloud isolée, snapshot du repo à ~15h20 le
12/08) a écrit **24 fichiers corrigés directement dans l'arbre de travail**, plus un
dossier `AUDIT-2026-08-12/` (rapport + patch). Rien n'était commité. 7 bugs corrigés,
dont 1 bloquant build et 2 bloquants métier. Référence complète :
`AUDIT-2026-08-12/RAPPORT-AUDIT-QUALIOF.md`.

Le branchement du dialog « Éditer l'inscription » touche
`apps/web/src/app/app/sessions/[id]/page.tsx`, fichier également modifié par le commit
local `a61a8e4` (18h04, boutons Facturer) → livré en patch séparé, non écrit
directement par l'auditeur.

**Cette tâche ne modifie aucune logique des correctifs.** Elle applique le patch,
installe les 3 nouvelles deps, passe les portes de qualité, et commite un périmètre
exact.

## Périmètre du commit (exact)

À commiter — les 24 fichiers M de l'audit + la page patchée + lockfile + rapport :

- `apps/web/e2e/closure-flow.spec.ts`
- `apps/web/e2e/smoke-routes.spec.ts`
- `apps/web/e2e/upload-preenrollment.spec.ts`
- `apps/web/package.json`
- `apps/web/playwright.config.ts`
- `apps/web/scripts/__tests__/dedupe.merge.test.ts`
- `apps/web/src/app/app/sessions/[id]/page.tsx` *(patché ici)*
- `apps/web/src/components/preinscriptions/public-form.tsx`
- `apps/web/src/components/sessions/edit-participant-button.tsx`
- `apps/web/src/components/sessions/session-participants-list.tsx`
- `apps/web/src/lib/__tests__/storage.test.ts`
- `apps/web/src/lib/closure/queue-postgres.ts`
- `apps/web/src/lib/storage.ts`
- `apps/web/src/server/actions/dossiers-opco.ts`
- `apps/web/src/server/actions/invoices.ts`
- `apps/web/src/server/actions/sessions.ts`
- `packages/db/package.json`
- `packages/db/prisma/seed.ts`
- `packages/db/scripts/__tests__/import-veille.mapping.test.ts`
- `packages/db/src/index.ts`
- `packages/shared/package.json`
- `packages/shared/src/constants/legal-form.ts`
- `packages/shared/src/constants/modalities.ts`
- `packages/shared/src/constants/permissions.ts`
- `packages/shared/src/schemas/organization.ts`
- `pnpm-lock.yaml`
- `AUDIT-2026-08-12/` (rapport + patch)

**Exclus explicitement** : `.planning/`, `.gitignore`, `apps/web/tsconfig.tsbuildinfo`,
`apps/web/scripts/_backfill-ape-agefice.ts`, `apps/web/scripts/_dump-pack-ses0094.ts`,
`apps/web/src/app/app/factures/Facture-*.pdf`.

## Tâches

### T1 — Appliquer le patch sessions page
- **files**: `apps/web/src/app/app/sessions/[id]/page.tsx`
- **action**: `git apply -p0 AUDIT-2026-08-12/patch-sessions-page.diff`
  (`--3way` inopérant : le diff n'a pas de ligne `index` ; `-p1` échoue car les
  chemins du diff sont déjà relatifs à la racine du repo). Vérification à blanc
  `--check` obligatoire avant écriture.
- **verify**: `git diff --stat` = 16 insertions / 8 suppressions, hunk unique
- **done**: `SessionParticipantsList` reçoit `priceHT`, `enrollmentStatus`,
  `financingMode`, `financingRequestDate` ; reste de la page inchangé
- **statut**: ✅ appliqué proprement (offset 35 lignes, zéro conflit avec `a61a8e4`)

### T2 — Installer les nouvelles dépendances
- **files**: `pnpm-lock.yaml`
- **action**: `pnpm install` (`@prisma/adapter-pg`, `pg` dans `packages/db` ;
  `@aws-sdk/s3-request-presigner` dans `apps/web` ; `@qualiof/db` → `@prisma/client`
  dans `packages/shared` pour casser le cycle)
- **verify**: exit 0, `prisma generate` postinstall OK
- **done**: lockfile à jour
- **statut**: ✅ +28 / -49 paquets, Prisma Client régénéré, 4,8 s

### T3 — Portes de qualité
- **action**: `pnpm build`, `pnpm lint`, `pnpm test`
- **note TEST_DATABASE_URL**: déjà présent (`.env` L157 →
  `postgresql://qualiof:***@localhost:5432/qualiof_test`), base `qualiof_test`
  existante avec 45 tables → **aucune modification `.env` requise**.
  ⚠️ `DATABASE_URL` pointe le cloud Supabase ; le test dedupe instancie son propre
  client sur `TEST_DATABASE_URL` (garde dure `*_test`) → aucune écriture cloud.
- **verify**: 3 portes vertes
- **done**: aucun échec

### T4 — Commit unique du périmètre exact
- **action**: `git add` de la liste ci-dessus uniquement, puis commit
- **verify**: `git status` montre encore `.planning/`, `.gitignore`,
  `tsconfig.tsbuildinfo`, les `_*.ts` et le PDF errant comme non commités
- **done**: 1 commit, message imposé par Laurent

## must_haves

**truths**
- Aucune logique de correctif n'est modifiée par cette tâche
- Le patch est appliqué sur la version post-`a61a8e4` sans écraser les boutons Facturer
- Les 3 portes passent avant commit
- Le commit ne contient que le périmètre listé

**artifacts**
- `apps/web/src/app/app/sessions/[id]/page.tsx` patché
- `pnpm-lock.yaml` mis à jour
- 1 commit `fix(audit): …` sur la branche `cloud-migration`

## Arbitrage laissé à Laurent (hors périmètre code)

Règle métier introduite par le correctif #6 : cocher « Paiement client » ou
« Remboursement OPCO » dans un dossier **solde désormais la facture liée**
(`InvoicePayment` tracé « synchro dossier OPCO » + statut `PAID`). Le dé-toggle ne
reverse rien. Localisé dans `settleInvoiceForParticipant`
(`apps/web/src/server/actions/dossiers-opco.ts`) — ajustable en une passe si le
comportement souhaité diffère.

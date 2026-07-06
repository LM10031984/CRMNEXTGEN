# Phase 8 — Smoke Verification

**Date :** 2026-05-15
**Status :** TSC_GREEN / BUILD+TESTS_DEFERRED

## Automated gates

| Command                                       | Result    | Notes                                                                                                                |
| --------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | ✅ PASS   | 0 erreur après fix Rule 1 (import `@prisma/client` → `@qualiof/db` dans `build-audit-where.ts`)                       |
| `pnpm --filter @qualiof/web test --run`        | ⏸ DEFERRED | Sandbox de l'agent bloque `pnpm test` (même contrainte que Plans 08-02..08-05). À ré-exécuter par l'orchestrateur. |
| `pnpm --filter @qualiof/shared test --run`     | ⏸ DEFERRED | Idem — sandbox bloque                                                                                              |
| `pnpm --filter @qualiof/web build`             | ⏸ DEFERRED | Sandbox bloque `pnpm build`                                                                                         |
| `pnpm --filter @qualiof/db prisma migrate status` | ⏸ DEFERRED | Sandbox bloque pnpm                                                                                              |

## Auto-fix appliqué pendant l'exécution

**[Rule 1 — Bug pré-existant Plan 08-05]** `apps/web/src/lib/build-audit-where.ts` importait `import type { Prisma } from '@prisma/client'` au lieu de `@qualiof/db`. Erreur TS 2307. Fixé par `import type { Prisma } from '@qualiof/db'` (pattern projet — toutes les autres imports Prisma passent par `@qualiof/db`). Après fix : `tsc --noEmit` clean.

## requireRole appliqué — récap par fichier

| Fichier                              | Mutations gardées | Rôles autorisés                              |
| ------------------------------------ | ----------------- | -------------------------------------------- |
| `tenant-settings.ts`                 | 4 actions         | ADMIN                                        |
| `tenant-assets.ts`                   | 4 actions (logo upload/reset + signature upload/reset) | ADMIN                  |
| `invoices.ts`                        | 3 mutations       | ADMIN, MANAGER, COMPTABLE                    |
| `sessions.ts`                        | 8 actions (addParticipant, removeParticipant, updateParticipant, deleteSession, createSession, duplicateSession, updateSessionStatus, updateSessionLogistics) | ADMIN, MANAGER, COMMERCIAL (+ ADMIN/MANAGER pour deleteSession) |
| `sessions-create.ts`                 | 2 actions (createSessionFull + updateSessionStatus) | ADMIN, MANAGER, COMMERCIAL    |
| `closure-pack.ts`                    | 2 mutations (generateClosurePack + retryClosureBatchErrors) | ADMIN, MANAGER, FORMATEUR |
| `dossiers-opco.ts`                   | 1 mutation (toggleDossierBoolean) | ADMIN, MANAGER, COMMERCIAL, COMPTABLE      |
| `dossiers-opco-bulk.ts`              | 3 mutations (bulkToggleDossierField, bulkSetDossierType, bulkSendDossierReminders) | ADMIN, MANAGER, COMMERCIAL, COMPTABLE |
| `crud-edits.ts`                      | 4 deletes (deleteTrainer, deleteProduct, deletePerson, deleteTrainingSession) | ADMIN, MANAGER |

**Total : 32 appels `requireRole([...])` répartis sur 9 fichiers** (largement au-dessus du minimum 20 requis par le plan).

## Manual checklist (à valider par Laurent)

- [ ] Connecté en ADMIN → voir item "Utilisateurs" + "Historique" + "Paramètres" dans sidebar
- [ ] Inviter un user TEST (rôle COMMERCIAL) → en dev (SMTP vide) → toast indique "mode dev" + lien copiable depuis console serveur
- [ ] Coller le lien `/invitation/{token}` dans nav privée → définir MDP → redirect /app ✓
- [ ] Connecter en COMMERCIAL TEST → vérifier que "Paramètres", "Utilisateurs", "Historique" et "Factures" SONT CACHÉS dans la sidebar
- [ ] Connecter en COMMERCIAL TEST → taper directement `/app/parametres/utilisateurs` → page d'erreur (ForbiddenError)
- [ ] Connecter en COMMERCIAL TEST → tenter `recordInvoicePayment` via UI → message d'erreur "Rôle COMMERCIAL non autorisé"
- [ ] Connecter en LECTEUR TEST → tenter delete sur fiche apprenant → "Rôle LECTEUR non autorisé"
- [ ] Retour ADMIN → désactiver le user COMMERCIAL TEST → le user TEST est immédiatement déconnecté (next navigation = /login)
- [ ] Page Historique : voir lignes `parameters.*` (Phase 7) + `users.invite` + `users.disable` + `auth.login.success/failed`

## Wave timeline

- 08-01 : Wave 1 (foundation, blocking) — completed 2026-05-15T13:13:50Z
- 08-02 : Wave 2 (server actions tenant-users) — completed 2026-05-15T13:45:00Z
- 08-03 + 08-04 : Wave 3 (parallèle : public route + UI users) — completed ~2026-05-13/15
- 08-05 : Wave 4 (UI historique + login hooks) — completed 2026-05-13T16:01:00Z
- 08-06 : Wave 5 (apply requireRole + bookkeeping) — completed 2026-05-15

## Sandbox commit policy

**No commits made during Plan 08-06 execution** (per orchestrator instruction `<commit_policy>DO NOT commit</commit_policy>`). Files listed in final agent message.

## Smoke commands for orchestrator to re-run

```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files"
rm -rf apps/web/.next
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm --filter @qualiof/web test --run
pnpm --filter @qualiof/shared test --run
pnpm --filter @qualiof/web build
pnpm --filter @qualiof/db prisma migrate status
```

Si build fail : vérifier d'abord que les tests `tenant-users.test.ts`, `user-invitation-accept.test.ts`, `build-audit-where.test.ts`, `login/actions.test.ts`, `nav-config.test.ts`, `historique/page.smoke.test.ts` passent (ils mockent `@qualiof/db` et doivent inclure les enums `UserRole` + `LegalForm` per CLAUDE.md test mock pattern).

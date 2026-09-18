# Planning lot 2 — validation du 18 septembre 2026

## Livré

Créer/modifier/supprimer une TrainerAvailability busy ou tentative depuis la grille ou la fiche formateur. Case vide préremplie ; bouton par formateur pour déclarer une plage même sur un jour occupé ; clic sur les hachures pour éditer.
Heures Europe/Paris, validation Zod partagée startsAt < endsAt, note facultative (2 000 caractères), confirmation de suppression, erreurs conservant le formulaire et feedback de sauvegarde.

D-7 : ADMIN/MANAGER sur les formateurs actifs du tenant ; FORMATEUR seulement sur sa fiche résolue par email unique du tenant (décision Laurent de cette conversation, ajoutée à la spec) ; autres rôles refusés côté serveur. Sans correspondance ou avec doublon, FORMATEUR conserve la lecture.
Toutes les mutations et leur audit before/after sont transactionnels ; aucune écriture/audit sur update sans changement. Requêtes scopées tenant. Conflit de transaction rendu comme erreur rejouable. Revalidation planning, formateurs, fiche et arborescence sessions.

## Preuves

- TDD : suite initiale rouge avant les actions ; test FORMATEUR propre rouge avant activation de la correspondance email (1 échec / 10). Test minuit Paris rouge avant correction de l'affichage UTC.
- `pnpm test` : code 0 ; 402 fichiers, 4 469 tests réussis, 2 skipped préexistants.
- `pnpm --filter @qualiof/web exec tsc --noEmit` : code 0. Le premier contrôle parallèle au redémarrage Next a rencontré des fichiers .next/types disparus ; relance après arrêt du serveur de test réussie.
- `pnpm lint` : code 0 ; seul avertissement préexistant alt dans Paramètres.
- `TEST_DATABASE_URL=…/qualiof_dev_files-planning_test pnpm --filter @qualiof/web exec vitest run --config vitest.integration.config.ts src/server/actions/__tests__/trainer-availability.integration.test.ts` : 10/10 sur PostgreSQL réel. CRUD, audit/rollback, absence de changement, dates invalides, tenant, rôles, identité unique/ambiguë, refus de réaffectation, moteur existant du wizard.
- `DATABASE_URL=…/qualiof_dev_files-planning_test pnpm --filter @qualiof/web exec playwright test --config playwright.planning.config.ts` : 4/4. Mois/Semaine/URL/nav ; CRUD via grille et fiche ; UI FORMATEUR/LECTEUR ; création réelle puis badge « 1 conflit » visible et formateur sélectionnable dans le wizard inchangé. Navigateur fr-FR, Europe/Paris.
- Captures : apps/web/test-results/planning-indisponibilite-dialog.png et planning-wizard-conflit.png (données fictives).
- `git diff 4349c9a -- packages/db/prisma apps/web/src/components/wizards apps/web/src/lib/schedule/trainer-availability.ts apps/web/src/server/actions/schedule-wizard.ts` : vide.

Base dev : qualiof_dev_files-planning, port 3018. Tests sur base séparée *_test. Aucune migration, aucune modification du wizard ni de sa logique de disponibilités. Aucun envoi externe, push ou déploiement.

## Différé inchangé

Export ICS/synchronisation Calendar, filtre mes sessions, glisser-déposer et édition SessionSlot restent hors périmètre.

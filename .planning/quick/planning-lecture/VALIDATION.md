# Validation — 18 septembre 2026

Source : GitHub LM10031984/CRMNEXTGEN, main 87b13d9. Spécification lue intégralement depuis la copie locale puis ajoutée au dépôt (absente du main GitHub).
Branche : feat/260918-planning-lecture. Checkout isolé files-planning.
Base de développement : qualiof_dev_files-planning ; port 3018.
Smoke : base distincte qualiof_dev_files-planning_test ; port 3018 pendant le test.
Population : tenant E2E-Planning et données fictives, aucun import métier.

## Gates

- `pnpm lint` : code 0, avertissement préexistant alt dans Paramètres.
- `pnpm --filter @qualiof/web exec tsc --noEmit` : code 0.
- `pnpm test` : 401 fichiers verts, 4466 tests verts, 2 skipped préexistants.
- `pnpm --filter @qualiof/web exec playwright test --config playwright.planning.config.ts` (DATABASE_URL sur la base locale dédiée *_test) : 1 smoke vert. Login UI réel, route HTTP 200, régime sur la bonne ligne, absence de conflit pour deux régimes différents, conflit busy, Mois/Semaine, filtre URL, rechargement, retour navigateur, navigation et liens Formateurs.
- `pnpm --filter @qualiof/db run check:schema` (DRIFT_DATABASE_URL sur qualiof_planning_drift) : aucune dérive.
- Capture : apps/web/test-results/planning-mois.png, données fictives de septembre 2026.

## Périmètre vérifié

Huit cas métier §6 écrits avant le moteur et les composants ; rouge initial module absent puis 8/8 verts. Deux tests complémentaires pour les paramètres URL.
Extraction listTrainers sans changer le critère ni l'ordre de la liste.
Accès serveur limité à ADMIN / MANAGER / FORMATEUR / LECTEUR ; requêtes filtrées tenantId.
Aucune modification du schéma, des migrations, du wizard, de SessionTrainer ni de checkTrainerAvailability.
Les migrations déjà présentes ont seulement été rejouées pour initialiser les nouvelles bases locales.
Tokens primary/info/muted/danger, aucune bibliothèque de calendrier et aucune couleur littérale ajoutée.
Le correctif sticky de l'autre branche n'étant pas sur main, grille isolée avec fonds opaques et niveaux de superposition propres.

## Arrêt

Lot 1 terminé ; lot 2 non commencé. Code non poussé et non déployé.

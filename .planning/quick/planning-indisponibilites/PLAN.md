# /quick — planning lot 2

Périmètre : create/update/delete TrainerAvailability (busy/tentative), dialog depuis planning et fiche formateur, RBAC, audit transactionnel et invalidations.
Critère observable : une indisponibilité créée depuis une case apparaît dans la grille et la fiche ; l'action existante utilisée par le wizard détecte busy, puis ne le détecte plus après suppression.
Base locale et port conservés : qualiof_dev_files-planning, 3018. Tests sur qualiof_dev_files-planning_test uniquement.
Aucune migration, aucun changement du wizard ni de checkTrainerAvailability.
Étapes : tests RED ; actions et schémas ; dialog et intégration ; validations Vitest/tsc/lint/PostgreSQL/E2E.
Décision Laurent (18/09/2026) : User n'a pas personId ; correspondance par email insensible à la casse, uniquement si une seule Person active du même tenant correspond et est un formateur. Sinon lecture seule.

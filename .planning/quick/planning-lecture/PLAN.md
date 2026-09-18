# /quick — planning lecture, lot 1 uniquement

Base GitHub : origin/main 87b13d9. Branche : feat/260918-planning-lecture.
Environnement isolé : files-planning, base locale qualiof_dev_files-planning, port 3018.
Critère observable : /app/planning affiche les sessions du seed sur les lignes de leurs formateurs, dans le bon régime, en Mois et Semaine ; filtres persistés dans l'URL.

Étapes / commits : extraction list-trainers ; grille pure + huit tests ; page/UI + smoke ; navigation.
Aucune migration nouvelle, aucun changement du wizard ni de checkTrainerAvailability.

TDD : les huit tests §6 ont été écrits avant le moteur et tout composant. Premier run : suite rouge (module absent, code 1). Après implémentation : 8/8 verts.
Gates finales : lint, tsc, vitest, E2E local ; capture Mois puis arrêt.

D-3 s'applique au jour ; le régime null est comparé comme undeclared.
Les dates de créneaux restent des jours civils ISO, arithmétique UTC pour éviter la dérive DST.

# Résultat local

Les lots sont implémentés dans l'ordre demandé : isolation des tests ; édition et historisation des rattachements ; migration additive nullable ; prix et lecteurs des régimes ; garde d'inscription par payeur.

Relevé détaillé : `docs/prix-statuts-2026-09-17.md`.

Validation : 4 367 tests unitaires réussis, 2 ignorés ; TypeScript ; lint sans erreur avec un avertissement préexistant ; Prisma validate ; diff de schéma hors base strictement additif. La sonde de désactivation du garde est archivée dans `verification/` (code rétabli).

Non exécutés : tests qui écrivent sur une base, migration, E2E navigateur, publication GitHub et déploiement. Le contexte utilisateur exige validation humaine avant écriture. Aucun secret réel ni environnement de production chargé dans le clone de travail.

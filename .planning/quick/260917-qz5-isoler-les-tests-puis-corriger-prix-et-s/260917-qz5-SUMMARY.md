# Résultat local

Les lots sont implémentés dans l'ordre demandé : isolation des tests ; édition et historisation des rattachements ; migration additive nullable ; prix et lecteurs des régimes ; garde d'inscription par payeur.

Relevé détaillé : `docs/prix-statuts-2026-09-17.md`.

Validation : 4 367 tests unitaires réussis, 2 ignorés ; TypeScript ; lint sans erreur avec un avertissement préexistant ; Prisma validate ; diff de schéma hors base strictement additif. La sonde de désactivation du garde est archivée dans `verification/` (code rétabli).

Complément du 18/09 après autorisation explicite de tester et pousser : PostgreSQL jetable identifié vide par son contenu ; 33 migrations appliquées ; contrôle de dérive vert ; rejeu sans migration en attente ; 13 tests d'intégration réussis deux fois, dont 7 nouveaux cas transactionnels pour les prix et les statuts. Les fixtures sont entièrement nettoyées. Unités (4 367 réussis, 2 ignorés), lint et TypeScript relancés sans cache et validés avant publication de la branche.

Non exécutés : E2E navigateur et déploiement. Aucune migration ni correction de données réelles. Aucun secret réel ni environnement de production chargé dans le clone de travail. Preuves : `verification/prix-statuts-2026-09-18.md`.

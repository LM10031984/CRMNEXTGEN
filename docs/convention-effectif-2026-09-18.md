# Convention : effectif total et génération à la demande

Décision de Laurent du 18/09/2026 dans cette conversation : « la convention est liée au nombre de participants donc on la génère quand on en a besoin pas de manière auto pour pas faire péter les crédits IA », puis « Mais on nomme pas les autres que l'effectif total ».

Cette décision remplace la première correction du même jour (« Effectif couvert par la présente convention » et « L’effectif total de la session peut évoluer »), rejetée par Laurent.

## Comportement

L'article 4 affiche le nombre total d'inscriptions non annulées de la session, tous commanditaires confondus, lu au moment de chaque génération demandée. Une convention individuelle conserve uniquement le nom de son titulaire et son tarif. Les autres inscrits contribuent au compteur, sans être nommés sur ce document. La convention commune d'une entreprise conserve les noms de son propre groupe et son forfait.

Exemple : la session compte deux inscrits. La convention individuelle indique :

> Elle est organisée pour un effectif de **2 stagiaires**.
>
> La présente convention concerne la personne suivante :
>
> Gavina FORLANI

Une nouvelle inscription ne modifie pas le PDF existant et ne lance aucune génération. Le contrôle de fraîcheur existant tient compte du nombre d'inscrits et peut signaler le document à actualiser. La prochaine génération explicitement demandée lit le nouveau total. Le prix individuel reste indépendant de cet effectif.

Hypothèse de comptage : toute inscription autre que `CANCELLED` compte dans l'effectif. Il ne s'agit ni de la capacité maximale ni d'un nombre de présences constatées.

## Déclenchement et coût

La création d'une session, l'ajout d'un participant, la validation d'une inscription publique et le passage au statut « Terminée » enregistrent désormais les données sans lancer de préparation documentaire ou de pack. Cela retire aussi les générations de convocations et de pièces AGEFICE à l'ajout d'un inscrit. Les boutons explicites de génération, de préparation et de pack restent disponibles.

Le rendu d'une convention est un modèle HTML/PDF sans appel IA. Les préparations globales, elles, peuvent lancer des travaux IA : elles ne partent plus automatiquement avec ces modifications de session. Les travaux déjà demandés ne sont pas annulés par ce correctif.

## Validation et périmètre

Les tests couvrent les compteurs 1, 2, 3 et 5, une génération à 2 puis à 3 inscrits, les noms limités au dossier, le tarif individuel et le forfait entreprise, l'exclusion des annulations, l'alerte de fraîcheur et l'absence de déclenchement automatique sur les quatre actions ci-dessus. Les tests de régression ont été observés rouges avant correction puis verts.

Aucune modification de schéma dans ce complément. Aucun document réel régénéré et aucune donnée de production consultée ou modifiée. Les PDF existants devront être régénérés à la demande après déploiement pour afficher le nouveau total.

Résultat final : **4 380 tests unitaires réussis, 2 ignorés**, TypeScript et lint validés (avertissement alt préexistant). Preuves détaillées dans `verification/prix-statuts-2026-09-18.md`.

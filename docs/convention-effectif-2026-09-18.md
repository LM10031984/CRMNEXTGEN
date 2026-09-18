# Convention : effectif total et génération à la demande

Décision de Laurent du 18/09/2026 : « la convention est liée au nombre de participants donc on la génère quand on en a besoin pas de manière auto pour pas faire péter les crédits IA ». Précision après contrôle de Taylor : « je ne voulais pas le nom des stagiaires […] ça devrait juste dire effectif de 2 stagiaires […] pour une convention entreprise […] une seule convention et le nom de tous les salariés ».

## Comportement attendu

L’article 4 affiche le nombre total d’inscriptions non annulées de la session, tous commanditaires confondus, lu à chaque génération demandée.

- **Individuel** : effectif total uniquement dans l’article 4, aucun nom ni email d’apprenant. Le bénéficiaire et le représentant restent identifiés dans les autres parties du contrat. Le tarif propre au dossier ne change pas avec l’effectif.
- **Entreprise** : effectif total, liste des salariés couverts par ce document et forfait de l’entreprise. Une entreprise avec un seul salarié conserve sa liste nominative.

Exemple individuel pour deux inscrits :

> Elle est organisée pour un effectif de **2 stagiaires**.

La phrase qui introduisait la liste nominative est supprimée dans ce cas. Le type de convention est explicite dans le modèle ; il ne se déduit pas du nombre de personnes couvertes.

Une nouvelle inscription ne modifie pas le PDF existant et ne lance aucune génération. Le contrôle de fraîcheur peut signaler le document à actualiser ; la prochaine génération demandée lit le nouveau total. Toute inscription autre que `CANCELLED` compte, indépendamment de la capacité ou des présences.

## Cause du document inchangé après « Régénérer »

Sur `qualiof.vercel.app`, SES-0117 affiche deux apprenants. Le lien de convention de Taylor pointe vers un ancien fichier `entreprise-…pdf`. Le cœur individuel retournait systématiquement le document groupe existant, sans rendre de PDF, avant même de vérifier le régime et le payeur actuels. Le bouton pouvait donc annoncer un succès sans changement.

La garde réutilise maintenant la règle contractuelle commune avant ce retour anticipé. Pour un dossier individuel identifié, un ancien document groupe non signé ne bloque plus la génération. L’ancien groupe reste conservé ; le nouveau document individuel prend priorité dans l’affichage. Les conventions entreprise restent protégées contre la création d’une individuelle concurrente. Sans régime ni forme juridique, la couverture existante reste conservée. Une ancienne convention signée ou en cours de signature renvoie une erreur explicite.

Le correctif couvre les appels avec ou sans `force` et ceux qui préparent les ancres de signature : un autre appelant ne doit pas réintroduire l’ancien PDF.

## Déclenchement et coût

La création d’une session, l’ajout d’un participant, la validation d’une inscription publique et le passage au statut « Terminée » enregistrent les données sans préparation documentaire automatique. Les boutons explicites restent disponibles. Ce complément ne change aucun déclencheur.

Le rendu d’une convention est un modèle HTML/PDF sans appel IA. Les préparations globales peuvent lancer des travaux IA ; elles restent à la demande.

## Validation

Tests du rendu individuel pour 1, 2 et 3 inscrits, du groupe pour 1 et plusieurs salariés, des prix et du forfait ; tests de régénération avec ancien groupe, de protection des employeurs et des documents engagés. Les régressions ont été observées rouges avant correction puis vertes.

Aucun changement de schéma. La production a été consultée en lecture dans le navigateur pour identifier le document concerné. Aucun PDF réel régénéré ni demande de signature envoyée pendant cette vérification. Après déploiement, les anciens PDF s’actualisent au prochain clic explicite sur « Régénérer ».

Preuves de ce complément dans `verification/convention-regeneration-2026-09-18.md`.

# Diagnostic et ateliers Faros — 18 septembre 2026

Une proposition est composée à partir de réponses confirmées. Chaque douleur est
identifiée à l’échelle de la question, y compris lorsque la moyenne du chapitre
reste bonne. L’audit et la proposition partagent ces besoins et leur priorité
(gravité du résultat × poids de la règle). Un chapitre faible seul ne justifie
pas un atelier.

Le moteur de production suit un registre explicite `ruleId → sourceRef`.
Le titre, les signaux et la présence du mot « IA » ne décident plus de l’admission.
Les ateliers Faros sont prioritaires ; les modules Drive dont le contenu répond
à la même compétence restent des alternatives. Un seul atelier est retenu par
besoin ; un atelier répondant à plusieurs besoins documentés n’est animé qu’une fois.

## Adaptations Faros

Sources : Formation Faros / TOURNAGE-PAR-MODULE et LIVRAISON_PARCOURS, consultées
le 18 septembre 2026, complétées par les lignes pédagogiques Faros déjà présentes
dans `journees-faros.ts`. Les références de capsules restent internes.
Les ateliers sont des adaptations présentielles de 120 minutes incluant la
pratique ; il ne s’agit pas des durées des vidéos ni d’un import des scripts.

| Douleur | Atelier | Sources Faros |
| --- | --- | --- |
| Peu de canaux / équipe peu active en prospection | Campagne locale multicanale avec IA | M1-C3, D1/D2/D3, F1/F2 |
| Découverte vendeur non formalisée | Protocole vendeur, dossier et synthèse IA | M2-A3/A4, B2/B4 |
| Exclusivité / transformation des rendez-vous | Présentation de stratégie et objections | M2-D2/D3/D4 |
| Prix mal défendu / avis de valeur absent | Comparables vérifiés et argumentation avec IA | M2-A2, C2, D2 |
| Suivi vendeur irrégulier | Journal de mandat et compte rendu hebdomadaire IA | M4-A3, B1/B3 |
| Stock non requalifié | Bilan de commercialisation assisté par IA | M4-C3, D2 |
| Découverte acheteur non formalisée | Dossier acheteur et accompagnement IA | M6-B1, C1 |
| Base mal tenue | Corrections, sources et doublons avec IA | M1-B1/B3/B4 |
| Base non exploitée | Segments et relances IA contextualisées | M1-F3, D1/D2/D5 |
| Collecte d’avis absente | Demande au bon moment et relance mesurée | M1-E1/E2, D1/D2 |
| IA non paramétrée | Instructions métier et espace dossier | M0-B1/B2/B3/B4 |
| Prompts non partagés | Modèles réutilisables et test entre collègues | M0-A2/A3/A4, M4-B3 |
| Réponses IA non vérifiées | Contrôle de synthèses par les sources | M0-A5, M5-B1/B2 |

Chaque atelier contient prérequis, objectif observable, déroulé minuté, exercice,
livrable et critères d’évaluation. Il utilise des dossiers anonymisés ou fictifs.
Les compétences sans réponse pédagogique suffisante restent explicitement
« à traiter » : un mauvais ratio ne justifie pas une promesse de résultat chiffré.

## Remise et propositions existantes

La proposition affiche le constat, l’atelier, le résultat attendu et la mise en
pratique IA. Les besoins non couverts sont affichés. Le contrôle serveur compare
les sélections enregistrées aux réponses et au catalogue actuels avant PDF,
programme composé, devis, nouveau lien public et envoi. La relecture humaine
existante reste nécessaire pour la remise.

Les propositions historiques restent conservées. Pour bénéficier de la nouvelle
sélection, créer une nouvelle proposition depuis le diagnostic. Une sélection
ancienne sans justification explicite ne peut pas être remise à nouveau telle
quelle. Les documents déjà remis ne sont pas réécrits automatiquement.

## Installation et exploitation

Le workflow de déploiement, après CI et migrations, installe un nouveau rayon
inactif `faros:ateliers-appliques:v1` pour Start Academy uniquement, via
`installer-ateliers-faros.ts`. Cela n’active aucun nouveau produit vendu et ne
modifie ni prix existant ni ancien corpus Faros exclu de diffusion.

L’installation est atomique, journalisée et idempotente. Une réexécution ne
réécrit rien. Si le contenu de cette édition a été relu ou modifié en base, le
script s’arrête pour préserver cette relecture. Les exclusions posées ensuite
sont conservées. Une évolution du contenu doit faire l’objet d’une nouvelle
édition et d’une nouvelle référence source.

En cas d’échec, le workflow s’arrête avant son appel au hook Vercel. Corriger la
cause puis relancer le workflow est sans duplication. Pour retirer les ateliers,
exclure le nouveau rayon des sorties client ; le moteur conserve les alternatives
Drive disponibles et signale les besoins non couverts. Ne pas supprimer des
modules déjà référencés par des propositions.

Les tests couvrent les confusions métier, la priorité commune audit/parcours,
l’intégration Faros, la déduplication, la persistance des justifications, le rendu
client, les exclusions et la protection contre l’écrasement lors d’un réimport.

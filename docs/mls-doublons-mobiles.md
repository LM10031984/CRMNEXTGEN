# Mobiles MLS dont Excel a supprimé le zéro

Un mobile français de neuf chiffres commençant par 6 ou 7 est normalisé en +33. Cette règle commune s’applique à l’import, au rapprochement et à la recherche. Elle ne modifie pas les numéros étrangers munis d’un indicatif. Les imports futurs repèrent ainsi les coordonnées partagées ou déjà présentes avant de créer un lead.

L’écran administrateur `/app/leads/doublons-mls`, accessible depuis le rapprochement MLS, traite les doublons historiques de ce cas précis. Il exige exactement deux fiches portant les mêmes prénom, nom et mobile normalisés, avec des coordonnées compatibles, une agence générique de réseau et une agence précise du même réseau. Il refuse les fiches ayant un suivi, une affectation, une conversion, une échéance ou une relation métier.

L’aperçu indique la fiche conservée et celle supprimée. Une confirmation individuelle est obligatoire. La transaction conserve la fiche complète, réunit notes et segments, conserve les références d’import et écrit les deux états d’origine dans le journal `leads.merge.mls`. Elle ne supprime aucune agence et ne déclenche aucun message. Aucun nouveau calendrier commercial n’est inventé.

Le serveur vérifie à nouveau les fiches et l’empreinte de l’aperçu, sous transaction sérialisable et verrouillage des deux fiches. Toute modification concurrente, activité ajoutée ou erreur d’audit annule la fusion. Une nouvelle exécution ne trouve plus la paire supprimée.

Aucune migration. Validation : normalisation/import, critères de fusion, refus des divergences et relations, RBAC ADMIN, confirmation explicite ; tests PostgreSQL réels de prévisualisation, fusion, audit, conservation des notes/références, isolation des tenants, activité après aperçu, reprise et annulation transactionnelle.

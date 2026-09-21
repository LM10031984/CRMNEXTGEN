# Import MLS et fiche de suivi commercial

La liste Leads ouvre chaque fiche par le nom ou « Ouvrir la fiche ». « Modifier la fiche » permet de corriger identité commerciale, coordonnées, fonction, ville, rattachement agence, commercial, priorité, statut, prochaine action et notes. L’identité d’une Person déjà liée reste gérée par sa fiche apprenant.

Le formulaire d’activité conserve type (appel, email consigné, note, rendez-vous, relance), date, auteur, résultat, durée facultative, commentaire et prochaine action. Aucun appel ni email n’est envoyé par ce formulaire. Les modifications utilisent un verrou optimiste sur updatedAt ; les activités ont une clé de requête idempotente. Activité, évolution de la fiche et audit sont transactionnels.

## Pipeline et historique

Les statuts historiques restent inchangés en base. CONTACTED avec callCount de 1 à 7 s’affiche Appel 1 à Appel 7 ; CONTACTED sans compteur reste « En cours d’appels ». Le compteur mesure les appels réellement consignés, sans les fabriquer à partir d’un ancien statut. TO_FOLLOWUP est affiché « Relance longue / à réactiver ». Les autres statuts sont conservés.

Un appel sans réponse nécessite une relance postérieure à l’appel. À partir du septième, l’utilisateur choisit explicitement qualification, relance longue ou perte motivée ; aucune perte automatique. Une modification/activité sur un lead ouvert exige une prochaine action datée. Les anciens leads et les leads importés sans date sont visibles via « Prochaine action à planifier ». Les relances dues sont calculées selon le jour civil Europe/Paris.

## Import réutilisable

`/app/leads/import` est réservé aux administrateurs. Les trois onglets MLS sont reconnus par leurs colonnes. La prévisualisation précède l’écriture ; un condensat du plan empêche d’appliquer une prévisualisation devenue obsolète. L’import est sérialisé par tenant et transactionnel. L’interface propose le téléchargement d’un rapport ; AuditLog conserve le journal avec fichier, hash, auteur, compteurs et identifiants créés. Le script `apps/web/scripts/import-mls.ts` expose le même service, avec prévisualisation par défaut et application sur digest explicite.

Politique de rapprochement :

- Normaliser espaces/accents pour les clés, emails et numéros français ; conserver les noms lisibles.
- Regrouper la même identité dans la même agence si ses informations concordent ; conserver tous les segments et références de lignes.
- Mettre à vérifier les identités divergentes et coordonnées communes à plusieurs personnes.
- Ignorer les clés d’import et coordonnées déjà présentes en CRM : aucune modification ou fusion silencieuse.
- Rattacher une agence existante uniquement si le rapprochement est univoque. Ne pas choisir entre plusieurs points de vente ambigus.
- Créer les agences avec forme juridique AUTRE (inconnue), sans inventer SIRET ni adresse. Une ville seule ne crée pas un point de vente connu.
- Conserver les dirigeants MLS dans `Organization.crmManagers`, distinct du signataire des conventions. Ce champ est modifiable depuis « Éditer la fiche » de l’agence, un nom par ligne.
- Créer uniquement des Leads, sans User, Person, inscription, assignation automatique, email, SMS ni appel.

Les fichiers réels et rapports contenant des contacts restent hors Git (dépôt public). Les tests n’utilisent que des identités fictives.

## Migration

`20260920190000_mls_lead_followup` ajoute uniquement des colonnes et index ; aucun statut ni historique n’est réécrit. Un retour à l’ancienne version applicative est possible en conservant ces colonnes. Une suppression des colonnes ne doit être envisagée qu’après export de leurs données ; ne pas lancer de rollback destructif automatique.

Ce lot concerne l’import et les fiches commerciales. Il n’ajoute pas le portail partenaire MLS, le partage externe, la conversion en apprenant ni le Kanban du chantier global.

## Rapprochement des fiches déjà présentes

`/app/leads/rapprochement` et `apps/web/scripts/enrich-mls.ts` partagent le même service administrateur, en prévisualisation par défaut. Il rapproche email/mobile normalisés et identité complète, refuse les coordonnées partagées, les fiches multiples et les points de vente ambigus. L’application du plan contrôlé ne crée aucun lead, utilisateur ou apprenant et n’envoie rien. Elle complète les champs commerciaux vides et les segments MLS, sans écraser les coordonnées, notes, statuts, appels ou le commercial assigné. Elle conserve les adresses existantes. Une enseigne/raison sociale peut être reliée via le nom commercial ; les responsables CRM déjà renseignés restent inchangés. Le journal contient les valeurs avant/après et les agences créées. Une modification concurrente invalide l’aperçu.

Le classement utilise le nom commercial et le réseau renseignés, avec les alias C21/Century 21 et KW/Keller Williams. Un simple réseau comme « Orpi » n’est pas une agence identifiable : les organisations restent séparées. Les signataires contractuels ne servent plus de responsables CRM par défaut.

Le tri initial est « Plus récents », la recherche reconnaît les numéros français nationaux et internationaux, les totaux de base restent visibles avec ceux de la sélection. Les rappels du jour et le lien de planification précèdent les filtres repliables sur mobile.

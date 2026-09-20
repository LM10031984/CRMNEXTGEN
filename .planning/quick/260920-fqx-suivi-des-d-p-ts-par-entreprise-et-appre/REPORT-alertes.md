# Rapport — alertes financement et remboursement

## Réalisé

- Le contrôle J-21 recalcule l'état courant avant chaque livraison.
- Un dossier AGEFICE individuel exige les six pièces : CNI, RIB, attestation CFP, convention signée, formulaire AGEFICE signé et programme résolu par `resolveProgrammeDocument`.
- L'éligibilité AGEFICE et le profil CFP suivent le payeur, le rôle juridique et les dates de la session. Un indépendant financé hors AGEFICE est exclu de ce circuit.
- Les salariés sont regroupés par employeur dans une seule alerte, mais chaque membre actif est contrôlé. Une convention nominative du premier salarié ne masque donc pas le dossier incomplet d'un autre ; les manques sont libellés par apprenant. Leur dossier exige uniquement la convention signée et le programme.
- Un dossier AGEFICE est déposé seulement si une soumission initiale porte un `sentAt`, un statut confirmé et `deliveryState=READY`. Une entreprise est déposée seulement lorsque tous ses participants actifs portent une déclaration de dépôt.
- Un dossier complet non déposé produit une alerte distincte, avec le geste de dépôt adapté : envoi AGEFICE confirmé ou déclaration par un déposant habilité.
- À partir de J+1 après la fin, un rappel interne demande de préparer le remboursement AGEFICE : RIB, émargement signé, assiduité signée et facture payée permettant l'édition acquittée.
- Le rappel J+1 reprend le destinataire du plus récent envoi initial réellement confirmé. Il s'arrête dès qu'un envoi final réellement confirmé existe.
- Les rappels se répètent au plus une fois par semaine en jours calendaires Europe/Paris, y compris autour des changements d'heure.
- Le cron ne rejoue automatiquement que les événements immuables « nouvelle session » et « nouvelle inscription ». Le filtre est appliqué dans la requête SQL avant la limite de 100, puis défendu après décodage ; des rappels périmés ne peuvent donc pas affamer les nouveaux événements. Tous les rappels J-21/J+1 en attente repassent par leur contrôle d'état courant.
- Aucun envoi à un financeur n'est réalisé par ce cron : toutes les alertes vont à `formation@start-academy.fr` et l'envoi du dossier reste explicite dans l'application.

## Sécurité et cohérence

- Toutes les lectures de documents, factures, messages et soumissions sont rattachées au tenant de la session.
- Les sessions et inscriptions annulées sont exclues.
- Les salariés annulés sont exclus de l'agrégat employeur.
- Une issue SMTP incertaine reste bloquée en `uncertain` et n'est pas renvoyée automatiquement.
- Une pièce révoquée ou redevenue manquante continue à produire une alerte de conformité même si un dépôt historique existe ; le dépôt historique n'est jamais effacé ni confondu avec l'état documentaire courant.

## Validation

- `vitest` alertes + statut financement partagé : **99 tests réussis**.
- Couverture ciblée : six pièces, programme partagé, signature manuelle, dépôt réel, agrégat employeur, financeur non AGEFICE, destinataire initial le plus récent, arrêt après envoi final, DST Paris, déduplication hebdomadaire, tenant et non-rejeu des rappels périmés.
- `tsc --noEmit` ne signale plus d'erreur dans le lot alertes. Le contrôle global reste rouge sur des tests modifiés en parallèle hors de ce lot : `after-training-delivery.test.ts` et `opco-preview-current.test.ts`.
- Aucun email réel, commit, déploiement ou migration n'a été exécuté.

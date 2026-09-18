# Envois AGEFICE et alertes formation — livraison du 18/09/2026

## Réalisé

- Deux étapes indépendantes sur OpcoSubmission : PRISE_EN_CHARGE (six pièces), FIN_FORMATION (RIB, émargement signé, assiduité signée, facture acquittée). Moteur documentaire existant réutilisé.
- Messages demandés, signature Béatrice Blanc, expéditeur et copie formation@start-academy.fr. Préparation automatique suivie d'une validation par clic.
- Contrôles signatures, NIR, destinataire, intégrité des clés, relecture des pièces à l'envoi, facture réellement soldée ; refus explicite si facture multiple/avoir/paiement OPCO_SYNC. Maximum 15 Mo.
- Verrou atomique par dossier ET par participant/étape pour couvrir les anciens brouillons doublonnés. Dry-run jamais SENT ; remise incertaine rapprochable par ADMIN/MANAGER après dix minutes et contrôle de messagerie.
- Points d'accueil : résolution à partir des champs CFP importés, choix explicite si ambigu, mémorisation du choix. Saisie confirmée du code postal CFP quand il manque. Annuaire officiel seulement pour les nouvelles propositions, références historiques conservées.
- Alertes automatiques création session, inscription par lien, pièces manquantes J-21. Queue durable transactionnelle, contrôle quotidien à 08:05 UTC, jours calendaires Paris, inscriptions tardives, rappels espacés de sept jours, pas de PJ ni NIR dans les alertes.
- Cron relances initiales exclut les dossiers de fin de formation.

## Vérifications

- Suite monorepo : 4 101 tests web + 208 shared + 231 db réussis, deux tests web ignorés.
- TypeScript application + scripts et lint monorepo vérifiés. Un avertissement alt préexistant dans Paramètres.
- Migration rejouée dans qualiof_agefice_drift_test (locale jetable), contrôle de dérive nul.
- Revue indépendante : course statut/envoi, doublons historiques et rôle commercial/facture corrigés.
- Aucun email réel envoyé. Aucun test de réception/délivrabilité en production.

## Annuaire réel

158 points avec email en base ; 143 points officiels présents et emails identiques (101 départements interrogés). Une seule correction de référence appliquée en production : PTA83 couverture 08 → 08/51, transaction conditionnelle et relecture. 15 anciennes références conservées. Les 187 profils n'avaient pas de FK ; aucune attribution arbitraire effectuée. Voir les rapports dans verification/.

## Déploiement et activation

Migration additive 20260918170000_agefice_delivery : stage, deliveryState, sendingStartedAt, lastError. Le workflow du dépôt applique la migration avant déploiement après fusion/CI. Aucun déploiement applicatif effectué pendant ce travail.

Dans Paramètres organisme : activer Envoi dossiers OPCO et Notifications internes (équipe), plus l'interrupteur général. SMTP doit autoriser formation@start-academy.fr ; MAIL_DRY_RUN doit être false en production. APP_URL (ou NEXT_PUBLIC_APP_URL) et CRON_SECRET requis pour liens et cron. Identifiants uniquement dans le gestionnaire d'environnement serveur.

Premier usage : fiche session Avant/Après ou Dossiers OPCO → préparer → choisir le PA et confirmer le CP CFP si nécessaire → actualiser les pièces → relire → envoyer. Un COMMERCIAL doit demander la génération de facture acquittée à ADMIN/MANAGER/COMPTABLE si ce PDF n'existe pas encore.

Les états d'alerte `sending`/`uncertain` dans EmailMessage nécessitent un contrôle opérateur de la messagerie ; aucune reprise aveugle. Les deux envois AGEFICE disposent d'une reprise explicite dans l'éditeur.

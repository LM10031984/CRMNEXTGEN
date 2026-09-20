# Recette des demandes du fil

| Demande | Livraison / vérification |
|---|---|
| Envoi initial AGEFICE depuis formation@ avec aperçu | Circuit existant conservé; aperçu visuel et consultation PJ ajoutés; envoi utilisateur explicite |
| CNI, RIB, CFP, convention signée, prise en charge signée, programme | 6 pièces requises côté serveur et alerte; source catalogue programme ajoutée |
| Chantal Agier programme manquant | Données réelles SES-0112: brouillon5PJ, programme produit présent; builder corrigé lit6/6 aucune manquante, convention+AGEFICE signés |
| Employeur Chantal salariés SES-0109 | Vérification réelle Hedi/Marie-Claire: convention signée + programme, aucune pièce AGEFICE requise |
| Dépôt manuel documents signés / DocuSeal / lien consultation | Flux existants conservés; UI consultation des pièces dans aperçu ajoutée |
| Convention entreprise commune | Source signée groupe existante prise par builder et contrôles tous salariés |
| Tarif global / régime entreprise | Correction PR108 conservée |
| Annuaire national AGEFICE et choix CFP | Audit existant143centresofficiels sur101départements,158lignes avechistorique conservé;9=filtre06 |
| Alertes création session et inscription publique | Flux durable préservé; flush filtre événements en SQL pour éviter famine |
| J−21 incomplet | AGEFICE6pièces; salariés2pièces par membre,unealerte employeur; hebdo Paris; notification formation@ |
| J−21 complet non déposé | Vérifie confirmation réelle AGEFICE ou déclaration salariés; aucun faux vert |
| Dépôt par Béatrice/Laurent/Jean-Guy | Sélecteur3auteurs,date,trace vraiutilisateur; entreprise groupe et concurrence |
| Suivi sur session | Bloc Dépôts de financement par entreprise/apprenant, agrégat couleur+texte, liens dossier |
| Remboursement AGEFICE J+1 | Alerte interne à préparer; aucun envoi externe automatique; RIB,signatures,facture acquittée |
| Même point d’accueil que demande initiale | Destinataire dernier initial confirmé utilisé par rappel,aperçu,envoi final |
| Apprenant après formation | Aperçu/envoi facture ordinaire et certificat réalisation àperson.email, lendemainParis |
| Dirigeant salariés après formation | Groupage entreprise avec uneattestation par salarié au représentant résolu |
| Tests reçus en réel | Aucun nouvel email de test envoyé; test Laurent ancien déjà fait, non répété |
| Dernier message utilisateur: retirer mail salarié | Explicitement demandé APRÈS livraison du lot courant; seconde étape distincte à réaliser après production |

Réglages prod vérifiés lecture seule: emailsEnabled, opcoSubmissionsEnabled, internalNotificationsEnabled=true. 36 alertesformation historiques sent. Aucun dépôt fictif ni écritures de recette prod.

Validation locale initiale: 4237 tests web passent (2skip), suites racine vertes, tscvert, lintvert hors avertissement imagealt préexistant paramètres. Corrections de revue sous vérification complémentaire.

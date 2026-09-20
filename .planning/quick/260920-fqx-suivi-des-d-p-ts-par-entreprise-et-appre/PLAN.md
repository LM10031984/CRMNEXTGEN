# Finalisation du cycle financement et après-formation

## Spécification
Reprendre toutes les demandes du fil : programme intégré reconnu dans le dossier OPCO Chantal Agier/session109; suivi session par entreprise salariés et par apprenant AGEFICE, indicateur global dépôts; dépôt OPCO externe déclaré auteur/date; succès réel email AGEFICE initial = déposé; alertes admin formation@ J21 incomplet (6 pièces AGEFICE / convention signée + programme salarié), complet non déposé; J+1 remboursement AGEFICE au destinataire initial avec facture acquittée, émargement signé, assiduité signée,RIB; après formation prévisualisation/envoi facture ordinaire + certificat réalisation apprenant, attestations individuelles groupées au dirigeant salariés. Préserver upload relié apprenant, scans signés, DocuSeal, consultation, prix groupe et annuaire existants.

## Contraintes globales
Tenant/RBAC stricts; aucun mail réel de test ou faux dépôt. Envoi utilisateur explicite avec aperçu, pièces exactes vérifiées au serveur, anti doublon et état incertain SMTP. Dépôt ne vaut pas accord financier. Aucun salarié ne nécessite CNI/CFP/RIB. Statuts réels uniquement. Rappels durables dédupliqués et réévalués. Aucun secret affiché. Déploiement autorisé par utilisateur.

## Plan
1. Source commune programme (participant/session puis catalogue produit) et destinataire FIN_FORMATION historique; tests de régression. Responsable racine.
2. Suivi session groupé, déclaration auteur/date avec concurrence, badges apprenants et agrégat. Responsable agent depot, fichiers dédiés et session page, ne pas toucher alertes/postformation.
3. Alertes six pièces/J21 non déposé/J+1 remboursement, préserver événements existants; tests dates/tenant/déduplication. Responsable agent alertes, lib/alertes et cron.
4. Envois après formation avec aperçu, téléchargements, destinataire apprenant/dirigeant et pièces individuelles, audit/idempotence; tests. Responsable agent apres, nouveaux fichiers dédiés, insertion session coordonnée avec depot.
5. Relecture conformité et sécurité de chaque lot puis ensemble; tests complets, CI, merge, migrations, Vercel, vérification production lecture seule, matrice finale des demandes.

## Interfaces et prévol
| Tâches | Interface | Conclusion |
|---|---|---|
|1/3|resolveProgrammeDocument(tenantId,sessionId,productId,participantId,sponsorOrgId) dans lib/opco/programme.ts|Retour Document minimal id/pdfUrl/signedPdfUrl ou null; partagé builder/alertes|
|2/3|Champs SessionParticipant opcoDepositedAt/ByEmail et succès OpcoSubmission stage initial|Dépôt entreprise représenté par tous les membres actifs déclarés; incomplet reste ambre|
|2/4|Session page|Agent depot intègre composant AfterTrainingDelivery sessionId après instruction agent apres|
|1|programme puis mail final|Un ancien envoi final n'établit jamais destinataire initial|
|2|dépôt et suivi|Annulés exclus; partiels jamais verts|
|3|dates et mails|Paris jours calendaires; anciens rappels non envoyés jamais flush sans réévaluation|
|4|après formation|Aucune facture acquittée dans envoi apprenant; aucune attestation groupe unique|

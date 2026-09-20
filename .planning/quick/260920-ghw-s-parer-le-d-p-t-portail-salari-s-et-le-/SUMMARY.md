# Portail OPCO salariés et envoi AGEFICE

Le lot précédent PR109 est livré en production avant démarrage de ce complément, conformément à la demande.

- Salariés : depuis Dossiers OPCO ou la session, accès au groupe entreprise, consultation/téléchargement convention signée et programme, déclaration auteur/date de dépôt sur le portail externe.
- Les conventions individuelles sont toutes conservées si aucune convention commune; les pièces manquantes restent visibles par salarié.
- Aucun nouveau brouillon email entreprise, anciens composeurs redirigés vers la session, envoi serveur interdit même avec forçage administrateur. Relances manuelles/bulk et cron bloquées pour entreprises.
- AGEFICE : envoi avec aperçu maintenu, badge vert « Conforme et déposé » uniquement après envoi initial confirmé. Dépôt ne vaut pas accord de financement.
- Liens de pièces protégés par rôle, tenant, session et entreprise. Aucune clé de stockage reçue du client.

Validation : 4 267 tests web réussis (2 ignorés), suites racine réussies, TypeScript et lint réussis (avertissement image-alt préexistant Paramètres). Revues métier et sécurité : relance entreprise legacy et annulation dépôt malgré pièces manquantes corrigées. Aucun email réel ni faux dépôt utilisé pour la recette. Pas de migration.

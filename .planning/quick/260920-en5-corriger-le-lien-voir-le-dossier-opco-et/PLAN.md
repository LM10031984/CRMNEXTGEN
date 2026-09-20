# Lien dossier OPCO

Le bouton de l'étape Facturation pointe vers /app/dossiers-opco/:id, route absente. Corriger vers /app/dossiers-opco/envoyer/:id. Ajouter une redirection permanente limitée aux identifiants de dossier pour restaurer les anciennes URL sans intercepter les routes existantes. Vérifier la compilation de la règle, les routes voisines et le typage puis contrôler l'ancienne URL en production. Aucun email ni donnée de dossier modifié.

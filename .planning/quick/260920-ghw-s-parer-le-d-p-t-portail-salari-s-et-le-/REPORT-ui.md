# Rapport UI — portail OPCO salariés / email AGEFICE

## Résultat

- La liste **Dossiers OPCO** distingue désormais les salariés (`Portail OPCO`) des apprenants AGEFICE. Une entreprise ouvre directement le groupe de sa session ; aucun bouton de composition, fin AGEFICE, relance financeur ni case de sélection bulk n’est rendu pour ses salariés.
- Le statut entreprise est calculé en une requête sur tous les salariés actifs du couple session–entreprise, même quand la liste est filtrée : dépôt à déclarer, partiel, ou déclaré avec auteur et date. La facturation, la timeline OPCO et l’encaissement restent inchangés.
- AGEFICE conserve la composition initiale et la fin de formation. Le badge vert exact `Conforme et déposé` dépend du helper strict : étape initiale, remise `READY`, `sentAt` présent et statut réel de succès.
- La fiche session expose la section `#depots-financement` et chaque groupe `#depot-{sponsorOrgId}`. Elle propose la convention signée et le programme en consultation ou téléchargement, puis la déclaration auteur/date.
- Une convention commune est affichée une seule fois. Quand les conventions sont individuelles, chacune reste disponible. Un salarié sans convention signée demeure explicitement listé comme incomplet ; il n’est jamais masqué par la convention d’un collègue. Le programme partagé est dédupliqué.
- La confirmation d’un nouveau dépôt reste bloquée si une pièce obligatoire manque. Une déclaration existante peut toujours être corrigée ou annulée dans cet état.
- L’onglet Avant remplace le bouton de composition email des salariés par un lien vers les pièces et le dépôt portail.
- Les anciens brouillons entreprise ouverts via `/dossiers-opco/envoyer/{id}` redirigent vers le groupe de la session.

## Accès privé aux pièces

- Loader : `lib/opco/company-portal-documents.ts`, fondé sur `buildOpcoSubmission` sans créer de brouillon.
- Route : `/api/sessions/{sessionId}/opco-portail/{sponsorOrgId}/{participantId}/{kind}`.
- La route accepte seulement `CONVENTION` et `PROGRAMME`. Elle vérifie RBAC, tenant, session, entreprise, membre actif et nature entreprise via le builder. Une convention n’est servie que si la version sélectionnée est signée. Aucune clé de stockage n’est acceptée depuis le client.

## Vérifications

- Tests ciblés : 6 fichiers, 44 tests passés.
  - loader : groupe commun, conventions individuelles, pièces manquantes, mauvais groupe, convention non signée et type interdit ;
  - route privée : RBAC, paramètres métier, 404 tenant/groupe/pièce et téléchargement ;
  - UI : séparation portail/email, succès AGEFICE, correction d’un faux dépôt malgré des pièces manquantes, onglet Avant et fiche session.
- `pnpm exec tsc --noEmit` : succès.
- `git diff --check` : succès.
- La racine a également exécuté la suite globale : 4 259 tests et lint passés.

## Risques résiduels

- Le chargement des pièces est volontairement limité à la fiche session. Il appelle le builder pour chaque salarié afin de garantir que la convention couvre réellement chaque membre ; la liste globale ne fait aucun chargement de document.
- Les anciennes déclarations partielles restent ambres jusqu’à correction. Elles ne deviennent jamais vertes par simple présence d’une pièce chez un autre salarié.
- Aucun email, brouillon, faux dépôt, migration ou écriture de production n’a été créé pendant les tests.

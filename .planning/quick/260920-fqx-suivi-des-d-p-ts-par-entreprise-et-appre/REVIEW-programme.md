# Relecture programme, aperçu et destinataire du remboursement

Verdict conformité : PASS pour le lot demandé. Verdict qualité : PASS, aucune anomalie importante ou critique identifiée par la revue statique.

Revue du diff fourni `/private/tmp/qualiof-root-review.diff` et des chemins effectifs builder → aperçu → sauvegarde → envoi, route de consultation, moteur du programme et calendrier Paris. Aucun test déjà déclaré dans REPORT-programme.md n’a été relancé. Aucun envoi, aucune donnée métier modifiée.

## Conformité vérifiée

- Le résolveur commun cherche dans le tenant, avec priorité inscription, entreprise/session, session générique, catalogue du produit. Les générateurs existants enregistrent effectivement les champs utilisés : sessionId pour le programme session, entityType=product/entityId sans session/participant pour le catalogue.
- Le brouillon DRAFT/READY ancien expose les pièces recalculées, y compris le programme catalogue, sans mutation à la lecture et en conservant les exclusions des mêmes clés. Les pièces SENT et celles d’un envoi verrouillé restent celles enregistrées.
- La sauvegarde accepte soit la liste enregistrée, soit une liste entière relue depuis les sources serveur. Kind, clé, nom et preuve de signature doivent correspondre; la seule donnée pièce choisie par le client est included. Une clé étrangère ou signature forgée ne peut donc pas être introduite par cette nouvelle branche.
- Le bouton Envoyer sauvegarde cet aperçu avant de réclamer l’envoi. L’envoi réclame atomiquement le dossier puis revalide les sources courantes, le destinataire et la complétude avant tout téléchargement ou SMTP. Une ancienne liste encore sauvegardable ne contourne pas cette validation d’envoi.
- La consultation exige les rôles administratifs autorisés; le dossier est récupéré avec tenantId. Le navigateur choisit kind/filename, jamais une clé stockage arbitraire. La réponse directe est privée/no-store/nosniff; la branche Supabase fournit une URL signée de cinq minutes.
- FIN_FORMATION reprend un destinataire de PRISE_EN_CHARGE réellement confirmé : sentAt présent, deliveryState READY et statut envoyé/accusé/accord/remboursé. Un ancien envoi final ou un brouillon initial ne sert pas de référence. Le serveur vérifie à nouveau ce destinataire lors de l’envoi; modifier artificiellement recipientEmail dans une sauvegarde ne permet pas de contourner le verrouillage.
- Choix de point d’accueil et code postal sont refusés pour FIN_FORMATION côté serveur; le destinataire est en lecture seule dans l’éditeur.
- La condition de fin s’appuie sur les jours calendaires Europe/Paris et exige J+1, y compris lors de la validation avant envoi.

## Points mineurs et limites

- Le test de route ne couvre que le fournisseur MinIO; la redirection Supabase et sa durée d’expiration ne sont pas exercées dans ce lot. Lecture statique cohérente avec le contrat stockage existant.
- Le test intitulé « refuse une clé ou preuve de signature forgée » falsifie seulement la clé. La comparaison de signe existe bien dans le code; un cas dédié de signature seule renforcerait la preuve sans changer le verdict.
- Le lien Consulter résout les pièces au moment du clic; si une source change alors que l’éditeur reste ouvert, il peut consulter une version plus récente portant le même nom. L’envoi de l’ancienne clé est bloqué au serveur, donc pas d’envoi silencieux d’une version différente; un rechargement reste nécessaire dans ce cas concurrent.

La concordance entre Chantal, sa session effective et le contenu de production repose sur les preuves readonly décrites dans REPORT-programme.md; cette revue n’a pas consulté la production et ne répète pas cette vérification. Relecture de branche complète à suivre à la demande de l’agent racine.

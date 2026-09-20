# Revue ciblée — dernière correction facture

Verdict : **PASS**. Le finding relatif au contournement du payeur par `participantId` est clos. Aucun nouveau défaut bloquant ni régression introduite identifié dans le diff `/private/tmp/qualiof-invoice-fix-review.diff`.

Contrôles effectués en lecture seule :

- Le résolveur d’envoi vérifie maintenant le payeur courant pour le chemin nominatif comme pour le chemin groupé. La forme réelle `participantId=p`, `participantIds=[p]`, ancien payeur est rejetée et sa facture n’est pas jointe.
- Un tableau `participantIds` multi-personnes est rejeté même lorsque `participantId` désigne directement l’apprenant.
- Une session explicitement différente est rejetée. Le cas historique légitime `sessionId=null` reste accepté lorsque la relation directe `participantId` établit l’inscription.
- La route privée charge le sponsor de l’inscription et applique les mêmes garde-fous au téléchargement : tenant, session, payeur, groupe d’une personne maximum et cohérence de la forme nominative. Aucun accès direct à la facture refusée par le scénario corrigé n’est réintroduit.
- Trois régressions ciblées ont été ajoutées : ancien payeur nominatif, autre session explicite, groupe multi-personnes avec lien nominatif. Le fixture positif conserve une facture nominative historique avec session nulle.

Validation prise en compte, sans relance : rapport du lot après-formation à **20/20 tests ciblés réussis**, TypeScript global vert. Aucun email envoyé ni code modifié pendant cette contre-revue.

Les quatre findings initiaux avaient déjà été clôturés dans REVIEW-process-fixes.md. Cette validation ferme sa dernière réserve sur le lot 4.

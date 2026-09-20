# Contre-revue ciblée lots 2/3/4

Relecture statique du 20 septembre 2026 après commits d9b3481, 6cde54a et 11db338. Aucun test relancé, aucun email, aucune modification de code. Validation communiquée : 49 tests dépôt/éligibilité, 99 alertes, 17 après-formation et TypeScript vert.

## Quatre constats précédents

| Constat | Vérification de la correction | Verdict |
| --- | --- | --- |
| Ancien envoi validant nouveau snapshot entreprise | relatedEntity porte désormais l’empreinte ; état envoyé réservé à l’empreinte courante ; changement signalé et nouvelle confirmation explicite ; tentative incertaine bloque tout le groupe ; verrou commun conservé | Corrigé |
| Contrôle entreprise limité au premier salarié | Boucle sur chaque membre, résolution programme et convention/scan nominatif pour chacun ; message décrit les manques par nom | Corrigé |
| Famine après 100 rappels périmés | Filtre session/enrollment ajouté en base avant take:100, compatible avec JSON.stringify utilisé par le producteur | Corrigé |
| CAS dépôt sans appartenance | CAS individuel et groupe incluent sessionId, sponsorOrgId et exclusion CANCELLED ; échec groupe déclenche rollback transactionnel | Corrigé |

Les tests ajoutés couvrent ajout de salarié après envoi, régénération de document, maintien du blocage incertain, second salarié incomplet et CAS après réaffectation. Aucun autre défaut identifié dans ces quatre corrections.

## Nouveau contrôle facture : correction complémentaire nécessaire

**P1 — Le chemin nominatif contourne la validation du payeur d’une facture de groupe à une personne.**

Dans `apps/web/src/server/actions/after-training-delivery.ts`, `unsafeGroupedInvoices` ne vérifie que les factures dont `participantId !== participantId courant`, et `matchingInvoices` accepte immédiatement celles dont le participant correspond. Or le producteur réel `apps/web/src/server/actions/invoices.ts:573` renseigne aussi `participantId` pour un groupe à une personne, en plus de `participantIds:[p]`.

Scénario concret : facture émise pour sponsor A, inscription ensuite corrigée vers sponsor B ; la facture porte toujours participantId=p et participantIds=[p]. La nouvelle validation n’identifie pas le mauvais payeur et joint la facture A à l’envoi individuel actuel. Les tests ajoutés utilisent seulement participantId:null et ne couvrent donc pas cette forme réelle.

Vérifier le payeur sur les deux chemins ; lorsque participantIds est renseigné, appliquer ses contraintes même si participantId correspond. Vérifier une session explicitement renseignée tout en préservant les anciennes factures nominatives légitimes dont sessionId est null et dont l’inscription établit la session. Ajouter une régression avec la forme produite réellement : participantId=p, participantIds=[p], mauvais payerOrgId.

## Verdict

Lots 2 et 3 : validation de revue favorable sur le périmètre ciblé. Lot 4 : quatre défauts initiaux clos, mais validation finale conditionnée à la correction du contournement payeur ci-dessus. L’audit manuel d’un envoi retrouvé en boîte est explicite, réservé ADMIN/MANAGER et ne déclenche aucun nouvel SMTP. Le retrait ultérieur du composeur salarié reste hors de cette livraison.

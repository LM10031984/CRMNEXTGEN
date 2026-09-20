# Distinguer clairement le portail OPCO et le mail AGEFICE

Prérequis accompli: PR109 livrée en production, commitf2d95db, CI35503214846 etdeploy35503312610successful, VercelAzr3i9ei9N3TryCPDDz5BzSZNXpuSUCCESS. La dernière demande peut maintenant être traitée.

## Spécification
Les salariés déposent sur plateforme OPCO externe, jamais par email depuis Qualiof. Fournir convention signée et programme consultables/téléchargeables par entreprise+session; déclaration dépôt auteur/date déjà disponible. AGEFICE garde envoiavecaperçu par apprenant, statutvert conforme/déposé aprèsremiseconfirmée. Accès simple depuis sessionouDossiersOPCO. Préserver toutefacturation/encaissement et envois attestations postformation.

## Tâches
1. Racine: serverguards compose/send/markSENT dossiers entreprise, navigation client respecte redirectTo, anciensbrouillonsredirigés vers session, testaucunSMTP entreprise. Lecture des relancesfinanceur pour éviter emails dépôt entreprise.
2. Agent UI: dans session et DossiersOPCO, distinguer portailsalariés/AGEFICE, remplacer boutonsmail salarié par lien blocsession groupe, download2pièces privées exactessignéesparentreprise, badgevert envoyéAGEFICE et légende couleurs; périmètre fichiersUI et loaderpièces dédié, pas actionsopco-submission ni compose-opco-button.
3. Tests ciblés+globaux, revue de conformité, CI, prod. Aucune nouvelle emailde test ni fauxdépôt.

## Contrat
ComposeResult peut retourner redirectTo pour entreprise au lieu submissionId. Le lien session cible #depots-financement, le groupe entreprise #depot-{sponsorOrgId}. Charger lespièces seulementdanslesession (pas N+1 danslist), contrôle groupe par membres buildercommunexistant. Les liens privés d'accès doivent vérifier tenant/RBAC et couvrir la bonne entreprise/session; ne jamaisfairepasserconventionnon signée pour signée. UIpréserve badges dépôt et date/nom.

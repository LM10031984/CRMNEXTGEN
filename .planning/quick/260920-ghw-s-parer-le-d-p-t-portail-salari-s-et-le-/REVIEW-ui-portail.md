# Revue indépendante UI et pièces du portail

Revue statique, sans modification de code ni lancement de tests, du lot en cours `feat/opco-portail-sans-mail`.

## Verdict initial

Un constat P2 à corriger avant validation : l’interface empêche désormais d’annuler un dépôt erroné lorsque les pièces ne sont plus complètes.

Dans `apps/web/src/components/sessions/session-funding-summary.tsx`, la prop `canWrite` de `CompanyDepositTracker` est conditionnée à l’absence de pièce manquante. Or cette prop contrôle aussi « Corriger la déclaration » et « Annuler la déclaration ». Scénario : dépôt déjà renseigné par erreur, puis convention supprimée ou régénérée non signée ; toutes les actions de correction disparaissent. Le tracker individuel étant retiré de Dossiers OPCO, le parcours principal ne permet plus d’enlever cette fausse déclaration. Le serveur autorise explicitement l’annulation sans exiger les pièces.

Correction : distinguer droit de modification et autorisation de confirmer un nouveau dépôt. Maintenir la possibilité d’annuler/corriger la déclaration existante ; seules les écritures établissant un dépôt doivent rester conditionnées à la complétude. Le serveur reste l’autorité.

## Contrôles sans autre constat bloquant

- Les lignes entreprise remplacent composeur et relance financeur par un lien vers le groupe entreprise de la session. Les anciens dossiers entreprise redirigent vers la même ancre, effectivement présente.
- L’onglet Avant envoie vers le bloc de dépôts, sans nouveau composeur salarié.
- Le loader regroupe par employeur/session, parcourt chaque membre, et déduplique les pièces identiques. La convention réellement collective et le programme commun donnent deux liens ; les éventuelles conventions individuelles distinctes restent visibles, sans masquer les apprenants incomplets.
- La convention n’est servie comme signée qu’avec `signe=true`, depuis la résolution métier existante, qui inclut les scans signés.
- La route privée impose ADMIN/MANAGER/COMMERCIAL/COMPTABLE, résout la pièce côté serveur, vérifie session/entreprise/inscription non annulée et refuse tout type autre que convention/programme. Le builder vérifie le tenant de la session ; aucune clé arbitraire client n’est acceptée.
- AGEFICE conserve le composeur et la fin de formation. Son nouveau libellé vert repose sur le prédicat historique de remise initiale confirmée prévu par ce lot ; la distinction dépôt versus accord reste visible.
- Les nouveaux changements UI ne touchent pas les envois postformation ni les actions comptables.

Périmètre de cette revue : UI, loader pièces entreprise et route privée. Les protections serveur compose/send/markSENT relèvent de l’autre lot de revue.

## Contre-revue de la correction P2

**PASS — réserve levée.** `canWrite` conserve désormais uniquement le droit issu du rôle ; `readyToDeposit` porte séparément la complétude. Pour une déclaration de groupe existante, l’édition reste accessible lorsque les pièces manquent, la confirmation est désactivée et l’annulation reste disponible. Le serveur continue de contrôler les nouvelles déclarations. Aucun autre changement bloquant identifié dans ce correctif ciblé. Relecture seule, aucun test relancé.

# Revue indépendante des lots 2, 3 et 4

Revue statique du 20 septembre 2026. Aucun envoi, aucune donnée métier modifiée, aucun test relancé. Résultat de validation communiqué par l’orchestrateur : 4 237 tests passés, 2 ignorés, TypeScript vert ; seul avertissement lint préexistant image alt. La suppression du composeur salarié dans dossiers-opco relève expressément de la livraison suivante et ne constitue pas un écart de ce lot.

## Verdicts

| Lot | Conformité | Qualité | Verdict |
| --- | --- | --- | --- |
| 2 — Dépôts session | Regroupement entreprise, AGEFICE par apprenant, agrégat, auteur/date, contrôle pièces par membre, exclusion annulés à la lecture, dépôt distinct de l’accord présents | Tenant/RBAC, CAS des champs dépôt et audit présents ; appartenance mutable absente du CAS | Correction P2 avant validation finale |
| 3 — Alertes | Six pièces AGEFICE, J-21 Paris, non-dépôt, J+1 remboursement, destinataire initial réel, arrêt après final confirmé présents | Deux écarts : couverture entreprise du seul premier membre ; famine de file événements | Corrections P1/P2 avant validation finale |
| 4 — Après formation | Aperçu et pièces consultables, facture ordinaire + certificat apprenant, attestations nominatives au représentant, SMTP réel et audit présents | Bon verrou de claim et revalidation, mais état envoyé détaché du snapshot courant | Correction P1 avant validation finale |

## Constats actionnables

### P1 — L’ancien envoi entreprise valide à tort les nouveaux membres

`apps/web/src/server/actions/after-training-delivery.ts:208` (`stateFor`) ne compare que `relatedEntity=after-training:<session>:company:<entreprise>`. La requête ne charge même pas le snapshot des membres/pièces envoyés. Après un envoi A+B confirmé, ajouter C fait afficher les attestations courantes A+B+C sous le badge « Envoyé », alors que C n’a jamais été envoyé. Le verrou de claim recherche également tout ancien `sent` sur cette même clé et interdit l’envoi complémentaire. Le problème existe aussi pour une pièce régénérée : l’aperçu courant n’est plus celui réellement envoyé.

Conserver une preuve du snapshot livré et comparer au plan courant. Un changement doit rester explicitement non envoyé ; permettre une livraison complémentaire ou nouvelle version avec confirmation explicite, sans autoriser deux claims concurrents pour la même version. Régression attendue : envoyer A+B, ajouter C, vérifier absence de faux badge et possibilité contrôlée de couvrir C.

### P1 — Les alertes entreprise ne vérifient que le premier salarié

`apps/web/src/lib/alertes/formation-check.ts:278-297` résout convention, programme et scan manuel uniquement pour `members[0]`. Une entreprise comprenant A avec convention nominative signée et B sans convention est annoncée « complète non déposée ». Si les deux portent un dépôt historique, le rappel est entièrement supprimé alors que B reste incomplet. Le même défaut concerne un programme rattaché uniquement à A et les scans manuels nominatifs.

Le dépôt groupé contrôle déjà chaque membre, donc deux parcours de cette livraison se contredisent. Calculer la couverture pour tous les membres ; la convention réellement collective peut couvrir chacun. Régression attendue : deux salariés, pièces seulement au premier, avec puis sans dépôts historiques.

### P2 — Cent rappels périmés bloquent les notifications de nouveaux événements

`apps/web/src/lib/alertes/formation-notifier.ts:101-115` sélectionne les cent plus anciens `queued`, puis seulement en mémoire filtre `session` / `enrollment`. Les rappels devenus inutiles restent intentionnellement en file afin de ne pas partir sans revalidation. Dès que cent de ces rappels précèdent un nouvel événement, ce dernier n’est plus jamais sélectionné, même aux passages suivants.

Filtrer les événements en base avant `take`, ou paginer jusqu’aux événements admissibles. Régression attendue : cent rappels obsolètes suivis d’une nouvelle inscription ; l’inscription doit être livrable sans envoyer les rappels.

### P2 — Le CAS du dépôt groupé ne protège pas l’appartenance au dossier

`apps/web/src/server/actions/opco-deposit.ts:170-179` compare id, tenant et valeurs dépôt mais omet session, entreprise et statut d’inscription. Entre lecture des candidats et mise à jour, une autre transaction peut déplacer un membre vers une autre session/entreprise du même tenant, ou l’annuler. Le CAS réussit encore et journalise le dépôt pour le groupe initial alors que la ligne ne lui appartient plus.

Inclure au minimum l’appartenance et l’état actif dans chaque CAS, avec rollback global en cas d’échec. Pour la garantie complète annoncée concernant changements de groupe et pièces pendant l’opération, employer une stratégie transactionnelle cohérente (snapshot sérialisable avec conflit traité, ou verrous respectés par les mutations). Régression attendue : déplacement concurrent après lecture, aucune déclaration partielle ni au mauvais dossier.

## Points contrôlés sans écart bloquant identifié

- Les lectures interactives et téléchargements sont bornés au tenant et aux rôles autorisés ; les clés de stockage ne sont pas sérialisées vers le client.
- Après formation, la facture provient de `invoice.pdfUrl`, et non d’une édition acquittée ; les pièces entreprise sont filtrées sur chaque participant et type `ATTESTATION_FIN`.
- Les chaînes interpolées dans l’HTML sont échappées.
- L’état après formation n’est marqué envoyé qu’après succès non simulé/non supprimé avec identifiant SMTP ; échec ambigu bloqué durablement, reprise réservée ADMIN/MANAGER et auditée.
- Le claim après formation utilise un verrou PostgreSQL pour empêcher les doubles clics ; le plan est recalculé après claim avant envoi.
- J-21, fréquence hebdomadaire et J+1 utilisent les jours calendaires Europe/Paris. Un rappel périmé n’est pas envoyé automatiquement par le flush.
- Les succès AGEFICE exigent stade initial, `sentAt`, `READY` et statut compatible, sans confondre dépôt et accord.

La validation initiale reste suspendue aux quatre corrections ci-dessus et à leur vérification ciblée. Aucune demande nouvelle de retrait du composeur salarié n’est ajoutée à ce périmètre.

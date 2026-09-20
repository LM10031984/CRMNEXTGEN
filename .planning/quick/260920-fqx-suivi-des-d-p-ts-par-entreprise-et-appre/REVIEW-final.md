# Relecture globale finale

Périmètre : changements `a293a0d..11db338`, plan, rapports d’implémentation et REVIEW-process.md. Revue statique indépendante, centrée sur les interfaces entre programme, dépôt, alertes et après-formation. Aucun test relancé, aucun email envoyé, aucun code modifié.

## Verdict

**Conformité globale : PASS dans le périmètre livré. Qualité : aucun nouveau défaut important ou critique identifié.**

La validation technique finale reste conditionnée au résultat du full rerun en cours chez l’orchestrateur et à la relecture ciblée des quatre corrections par le reviewer processus. Les résultats de tests mentionnés ci-dessous sont ceux transmis par l’orchestrateur, pas de nouvelles exécutions de cette revue : 4 237 tests verts avant la vague de corrections ; ciblés 99/49/17 et racine 15 verts après corrections.

La demande récente de retrait des mails salariés des dossiers OPCO appartient explicitement à la livraison suivante; elle n’est pas traitée comme un écart de cette branche.

## Interfaces vérifiées

| Interface | Constat |
| --- | --- |
| Programme → aperçu → sauvegarde → envoi | Même résolveur participant/entreprise/session/catalogue dans le builder. Ancien brouillon enrichi sans mutation GET; nouvelle liste validée entièrement contre les sources serveur; envoi revalidé après claim. Historique SENT/verrouillé conservé. |
| Programme → alertes | Le checker réutilise resolveProgrammeDocument avec tenant/session/produit/apprenant/employeur. Les pièces spécifiques du premier salarié ne suffisent plus à déclarer le groupe complet. |
| AGEFICE → dépôt session → rappel | Même prédicat d’envoi initial confirmé (stage initial, sentAt, READY, statut compatible). Un brouillon, un final seul ou un état SMTP incertain ne produit pas de dépôt réussi. Dépôt et accord restent distincts dans l’interface. |
| Entreprise → dépôt groupé → agrégat | Tous les membres actifs attendus sont comparés aux membres courants; pièces contrôlées par membre; CAS borné session/employeur/statut actif et valeurs dépôt. Groupe partiellement déclaré et agrégat partiel restent ambre. |
| Initial → remboursement | Builder et checker sélectionnent le dernier initial confirmé selon sentAt/id et utilisent son destinataire. Le final relit le destinataire au moment de l’envoi, interdit les modifications du point d’accueil et demande facture acquittée, RIB, émargement et assiduité signés. |
| Dates | J-21 et fréquence hebdomadaire suivent les jours Paris; remboursement et après-formation s’ouvrent à J+1 Paris. Les présélections SQL laissent les bornes précises aux règles calendaires. |
| File de notifications | Les événements immuables sont sélectionnés avant la limite SQL; les rappels passent par leurs checkers et leur corps queued est actualisé avant livraison. L’incertitude SMTP n’est pas rejouée automatiquement. |
| Après-formation → documents/comptabilité | Facture ordinaire issue de pdfUrl et certificat individuel vers l’apprenant; attestations ATTESTATION_FIN nominatives vers le représentant résolu du groupe. Les factures groupées multi-apprenants sont bloquées dans le parcours individuel. |
| Après-formation → état livré | L’empreinte de version lie destinataire, objet, membres et identités des sources. Nouveau membre/pièce = nouvelle version à envoyer explicitement; un claim incertain bloque toutes les versions du même groupe logique. La confirmation manuelle reprend les participants du snapshot audité. |
| Consultation et sécurité | Routes et actions bornées tenant/RBAC, clés de stockage résolues côté serveur, aperçu après-formation sans clé stockage, liens privés. Aucun contournement nouveau par une clé forgée identifié. |

## Points mineurs non bloquants

- Les limites de couverture du lot programme restent celles de REVIEW-programme.md : branche de téléchargement Supabase non exercée dans le test ajouté, et cas dédié de falsification du seul champ signe absent.
- L’empreinte après-formation n’inclut pas html/text ni les noms de fichiers. Une modification du seul nom du représentant, sans changement d’adresse, de sujet ou de pièces, peut donc modifier la salutation entre aperçu et clic sans invalider la confirmation. Ce point ne change ni destinataire ni pièces; ajouter le corps au fingerprint renforcerait ultérieurement la fidélité stricte de l’aperçu.
- Les règles de calendrier Paris sont cohérentes mais la petite fonction parisDay reste dupliquée dans post-formation/delivery.ts; réutiliser le helper commun réduirait le risque de divergence future.

La revue statique ne remplace ni la confirmation du full rerun ni la vérification de production readonly prévue au plan. Aucun blocage supplémentaire n’est ajouté par cette revue.

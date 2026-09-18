# Prix et statuts — réalisation locale du 17 septembre 2026

Décisions source : contexte QualiOF fourni par Laurent le 17/09/2026. Base de code : `2dabbe7b` (PR #95). Branche locale : `fix/260917-regime-session`.

## Périmètre et population examinée

Lecture du code des tests, rattachements, sessions, inscriptions, programmes, conventions, factures, éligibilité AGEFICE et signatures. Les quatre chemins d'inscription trouvés dans l'application sont : `addParticipant`, `createSessionFull`, `enrollFromRequest` et le nouvel écrivain transactionnel partagé. Le changement de commanditaire et les changements de dates ont aussi été contrôlés.

Aucune lecture ni écriture de la base réelle n'a été effectuée pour ce chantier. Les chiffres 87 sessions, 376 inscriptions, 123 produits et 486 modules proviennent du contexte utilisateur ; ce ne sont pas un nouveau relevé. Aucune intervention sur SES-0115, SES-0116, les six dossiers AGEFICE, la session de janvier de Katia ou PROD-0062. Aucun document réel généré, aucun merge ni déploiement.

## Comportement réalisé

- Les unités ne chargent plus l'environnement applicatif et forcent une URL Postgres factice locale. Le scan de chronologie du cron est doublé. Les suites qui utilisent une base sont séparées. Les E2E refusent une URL distante et contrôlent les tenants avant leurs fixtures ; aucune variable de contournement production ne passe ce garde.
- Les rattachements ont une interface pour corriger leurs périodes ou changer de rôle. Un changement ferme l'ancien lien puis crée le suivant. Prévisualisation et confirmation portent sur un instantané ; application et AuditLog sont dans une transaction. Les pièces engagées protègent les périodes historiques. La suppression d'un lien utilisé est refusée et propose de terminer la période.
- La session déclare `ENTREPRISE` (convention et prix total) ou `INDIVIDUEL` (contrat et prix par stagiaire). Le catalogue n'en décide pas. La création et la duplication proposent ce choix. Une session historique peut être déclarée depuis sa fiche après prévisualisation, sans régénération automatique de ses documents.
- Un forfait entreprise de 240 € reste 240 € après un troisième inscrit. Le montant contractuel est `TrainingSession.priceTotalHT`. Pour maintenir les agrégats existants par inscription, les parts techniques `SessionParticipant.priceHT` sont réparties en centimes dans la transaction d'ajout, de retrait ou de modification du forfait. Trois inscrits donnent 80 + 80 + 80 ; un total de 100 donne 33,34 + 33,33 + 33,33. Ces parts ne sont pas des prix de vente individuels. Le forfait se facture en une ligne. Une inscription déjà facturée ou engagée empêche un nouveau partage.
- Les programmes, conventions, factures et écrans de signature lisent le régime de session. Le programme d'une session déclarée utilise son montant sans modifier le produit. Les empreintes documentaires intègrent le régime et le total uniquement pour les sessions déclarées.
- Le financeur est un axe séparé : rattachement actif chez le commanditaire aux dates de session, code financeur renseigné et, pour un TNS, profil AGEFICE de ce même commanditaire. Une EI annexe ne suffit plus. L'autofinancement et le paiement direct par l'entreprise ne déclenchent pas d'AGEFICE. Les compteurs et les générateurs utilisent la même population. Une génération refusée ne supprime pas un dossier existant.
- Le garde d'inscription utilise `payer-rule.ts`. Un agent commercial payé par une SAS est accepté en entreprise. Les incompatibilités nomment la personne et la fiche à corriger. Aucun nouveau garde d'inscription pour les sessions `regime = NULL` ; leurs règles de prix et d'éligibilité historiques restent en place.

## Vérifications effectuées

Sur données factices et doubles de base uniquement :

- `pnpm test` : 369 suites web, **3 928 tests réussis**, 2 ignorés ; db : **231** ; shared : **208**. Total : **4 367 réussis**.
- TypeScript application, scripts et package db : vérifiés sans émission.
- Lint : aucune erreur ; avertissement préexistant `parametres/page.tsx:228` sur l'attribut alt d'une image.
- Schéma Prisma valide. Comparaison hors base entre le schéma de `2dabbe7b` et le schéma final : un enum et deux colonnes nullable seulement.
- Tests rouges observés avant les changements sur les prix de programme, la facture forfaitaire, la résolution AGEFICE, la précision monétaire et la compatibilité des liens historiques.
- Sonde de puissance : désactivation temporaire du refus de payeur → deux tests échouent ; restauration → six tests du garde réussissent. La sonde n'est pas conservée dans le code.
- Prévisualisation sans écriture, clé périmée, transaction auditée, comptage des mises à jour effectives et rejeu sans second journal sont couverts par tests unitaires.

### Complément du 18 septembre — autorisation de tester et pousser

Après la demande explicite « ok fais les tests et pousse le code », les contrôles suivants ont été exécutés sur PostgreSQL 16.13 dans un nouveau conteneur jetable `qualiof-regime-tests-20260918`, exposé uniquement sur `127.0.0.1:55439`, sans volume existant ni environnement de production. Son contenu a été vérifié : aucune table métier au départ, puis zéro tenant, produit et module après migration.

- `check:schema` sur `qualiof_regime_drift` : aucune dérive après rejeu complet des migrations.
- `prisma migrate deploy` sur `qualiof_regime_test` : 33 migrations appliquées ; second passage sans migration en attente.
- Tests d'intégration : **13 réussis**, deux passages, dont **7 nouveaux tests** de régime et de rattachement sur une vraie base. Ils vérifient le forfait stable après ajout du troisième agent commercial payé par une SAS ; la répartition exacte des centimes ; la prévisualisation sans écriture ; le refus d'une confirmation périmée ; le rollback de l'inscription et des parts si l'audit échoue sur une contrainte FK ; les refus de payeur incompatible et de forfait engagé ; les inscriptions concurrentes avec rejeu d'un éventuel conflit sérialisable ; le changement de rôle avec conservation de l'ancienne période et rejeu sans duplication.
- `pnpm test --force` : **4 367 tests unitaires réussis**, 2 ignorés, aucun résultat repris du cache.
- `pnpm lint --force` et TypeScript application : codes de sortie 0. Seul avertissement : attribut alt préexistant dans `parametres/page.tsx:228`.
- Après les tests : zéro tenant, utilisateur, produit, module, session, inscription et journal d'audit. Les fixtures ont été nettoyées.

Les parcours navigateur complets n'ont pas été exécutés. Les tests de concurrence vérifient le résultat et la possibilité de rejouer un conflit ; ils ne constituent pas un test de charge. Les résultats détaillés des gates sont consignés dans `verification/prix-statuts-2026-09-18.md`.

## Migration additive — appliquée uniquement aux bases jetables

Fichier : `packages/db/prisma/migrations/20260917180000_session_regime/migration.sql`.

```sql
CREATE TYPE "SessionRegime" AS ENUM ('ENTREPRISE', 'INDIVIDUEL');
ALTER TABLE "TrainingSession"
  ADD COLUMN "regime" "SessionRegime",
  ADD COLUMN "priceTotalHT" DECIMAL(10,2);
```

Aucun UPDATE, aucune valeur par défaut, aucun remplissage rétroactif. Le diff généré hors base confirme ces seuls objets. Un déploiement de l'application nécessite cette migration avant le nouveau code.

Avant toute écriture réelle : identifier la cible par son contenu, produire son dry-run, arrêter pour validation humaine, puis appliquer de façon auditée et vérifier le rejeu. Aucun accord pour une migration ou une correction de données réelles n'est déduit de l'autorisation de tester et pousser. Les gates base et intégration ont passé avant publication de la branche.

## Points restant à décider avec les données réelles

- Date exacte de passage de Katia au salariat : inconnue, jamais inventée. Les dates présentes dans les tests sont fictives.
- Le schéma historique impose l'unicité personne + organisation + rôle. Un retour à un rôle déjà utilisé dans cette organisation est donc refusé explicitement par l'éditeur ; aucune ancienne période n'est écrasée. Une historisation permettant plusieurs retours au même rôle nécessiterait une évolution distincte de cette contrainte.
- Un financeur non renseigné chez le commanditaire ne peut pas être deviné à partir d'une EI annexe ; la fiche doit être complétée.

## Corrections de documentation

Correction du 17/09/2026 de la phrase de PR #95 « le mode du PRODUIT — LE POINT DE DÉPART » : cela ne concerne désormais que les sessions historiques sans régime. Pour une session déclarée, le régime et le montant viennent de la session.

Correction du 17/09/2026 de « le generator supprime puis retourne Inscription introuvable » dans les anciens tests AGEFICE : l'inscription et son éligibilité sont maintenant vérifiées avant suppression. Cela protège les dossiers existants lors d'un refus.

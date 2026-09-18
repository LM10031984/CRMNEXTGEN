# Validation avant push — 18 septembre 2026

Branche : `fix/260917-regime-session`. Code fonctionnel testé : `fdb31c75` ; ce lot ajoute les tests d'intégration et leur sélection dans Vitest.

Autorisation utilisateur : « ok fais les tests et pousse le code ».

## Cible identifiée avant écriture

- Nouveau conteneur `qualiof-regime-tests-20260918`, ID `40bcece4a4586f7b4e6322c6cd788800acb2d5e23261de081947e0ea1fff5e9e`.
- Image locale `postgres:16-alpine`, serveur PostgreSQL 16.13.
- Port `127.0.0.1:55439`, stockage temporaire en mémoire ; aucun volume existant monté.
- Lecture de `information_schema.tables` avant migration : **0 table métier** dans public.
- Bases : `qualiof_regime_drift` pour le garde de dérive ; `qualiof_regime_test` pour l'intégration.
- Après migration et avant fixtures : **0 tenant, 0 produit, 0 module**. Aucun tenant Start Academy ni donnée réelle.
- Identifiants locaux factices fournis explicitement aux commandes. Aucune lecture de `.env` ou `.env.local` de production.

## Résultats observés

| Contrôle | Résultat | Code de sortie |
| --- | --- | --- |
| `pnpm --filter @qualiof/db run check:schema` | Aucune dérive entre migrations rejouées et schéma | 0 |
| `pnpm --filter @qualiof/db exec prisma migrate deploy` | 33 migrations appliquées | 0 |
| Même commande, deuxième passage | `No pending migrations to apply.` | 0 |
| `pnpm test --force` | Web : 3 928 réussis, 2 ignorés ; db : 231 ; shared : 208 ; 0 tâche en cache | 0 |
| `pnpm lint --force` | 3 packages validés ; 0 tâche en cache | 0 |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | Aucune erreur | 0 |
| `pnpm --filter @qualiof/web test:integration`, deux passages | 3 suites, 13 tests réussis à chaque passage | 0 |

Lint conserve l'avertissement préexistant `parametres/page.tsx:228`, attribut alt d'image.

## Intégration réelle

Les 7 nouveaux tests utilisent le vrai client Prisma, les vraies transactions et les contraintes PostgreSQL. Seuls l'authentification, le cache Next et le choix explicite du client de test sont substitués. Les suites existantes de fusion (3 tests) et de cohérence facture/lignes (3 tests) passent aussi.

Cas ajoutés :

1. Deux puis trois inscriptions d'agents commerciaux payés par une SAS : forfait 240 €, parts 120/120 puis 80/80/80 ; rejeu sans seconde inscription ni audit.
2. Déclaration d'une session historique après prévisualisation : aucune écriture lors du dry-run, total 100 € ventilé 33,34/33,33/33,33 ; audit des trois modifications et rejeu sans nouvelle écriture.
3. Nouvelle inscription après prévisualisation : ancienne clé refusée, prix et audit inchangés.
4. Échec du journal par FK utilisateur inexistante : inscription et redistribution entièrement annulées par PostgreSQL.
5. Payeur EI_SELF incompatible ou convention déjà signée : refus sans inscription ni redistribution.
6. Deux inscriptions concurrentes : somme conservée, éventuel conflit sérialisable `P2034` rejouable, une seule inscription et un seul audit de création par personne.
7. Agent commercial devenant salarié à une date fictive : clôture de l'ancienne période, création de la nouvelle, résolution du rôle à la date de session, rejeu sans doublon ni second audit.

Après les deux passages, une lecture SQL confirme **0 tenant, utilisateur, produit, module, session, inscription et AuditLog** dans la base d'intégration.

## Limites

Pas de parcours navigateur complet, de test de charge, de merge ni de déploiement. Les migrations et les fixtures ont été appliquées uniquement aux bases jetables décrites ci-dessus. La production n'a pas été consultée ni modifiée.

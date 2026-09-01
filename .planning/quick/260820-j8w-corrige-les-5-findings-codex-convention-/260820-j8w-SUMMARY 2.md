# Quick 260820-j8w — Correction des 5 findings Codex (convention entreprise)

**Date :** 2026-08-20
**Branche :** cloud-migration
**Commit :** `411f8cc`

## Le problème

La quick 260817-mm0 a introduit un document de convention rattaché à
l'**organisation** commanditaire (`participantId=null`) — mais n'a traité qu'**un
seul** consommateur : la fiche session. Les autres résolvent la convention d'un
participant par `participantId` et ne la voyaient donc pas.

La revue Codex de la PR #13 a relevé 4 P1 + 1 P2. **Tous vérifiés dans le code
avant correction**, et le troisième plus large que décrit : `generateConventionForParticipant`
est appelé depuis **5 endroits**.

Le code était déjà en production (merge `99d480e`).

## Les 5 corrections

| # | Sévérité | Problème | Correction |
|---|---|---|---|
| F1 | P1 | `generateConventionEntreprise` n'appelait que `validateRequest()` — une action qui **supprime des documents** était invocable par un lecteur | `requireRole(ADMIN/MANAGER/COMMERCIAL)` |
| F2 | P1 | Le cœur comblait un prix manquant par le prix produit ; la facture somme les prix **bruts** ⇒ convention engageant **plus** que le facturé | Fallback supprimé, refus en nommant les personnes sans prix |
| F3 | P1 | Régénérer une convention individuelle laissait le document groupe ⇒ la session portait **les deux** | Garde dans `generateConventionCore` ⇒ couvre ses **5 appelants** sans les modifier |
| F4 | P1 | Le **dossier OPCO** cherchait par `participantId` ⇒ « CONVENTION manquante » dans le scénario OPTIMMO / OPCO EP visé par le chantier | Lookup étendu au document groupe |
| F5 | P2 | Le statut de préparation ne comptait que `entityType='participant'` ⇒ annonçait les conventions manquantes et proposait l'action qui recrée des individuelles | Requête et comptabilisation étendues |

## La leçon

Quatre endroits répondaient à la même question — « ce participant a-t-il une
convention ? » — avec quatre implémentations divergentes. C'est ce qui a produit
les findings.

`apps/web/src/lib/docs/convention-coverage.ts` devient la **source unique**, y
compris en remplacement de la passe ad hoc écrite dans `page.tsx` lors de la
quick précédente. Module neutre : un fichier `'use server'` ne peut exporter que
des fonctions async.

## Choix notable

La garde F3 retourne un **succès** pointant sur le document groupe, pas une
erreur. Le participant *est* couvert ; faire échouer l'appel casserait les flux
batch (pack de clôture, préparation de masse) qui appellent le générateur
individuel pour chaque participant.

## Vérification

- **1247/1247 tests verts** (157 fichiers), dont 8 sur le helper et 2 sur la garde.
- **Build monorepo vert**, `tsc --noEmit` et lint propres.
- **Test de puissance** : désactiver la garde anti-doublon fait virer rouge le
  test correspondant ; restaurée ⇒ vert.
- `generators-idempotent.test.ts` toujours vert (non-régression du `deleteMany`
  inconditionnel).

## Reste à faire

- Le parcours n'a pas été rejoué dans l'interface après ces correctifs (tests,
  types, lint et build seulement). Le PDF, lui, avait été relu sur données
  réelles OPTIMMO à la quick précédente.
- Chantiers suivants du todo du 12/08, toujours non traités : template
  « Contrat de formation professionnelle » et analyse de besoin par commanditaire.

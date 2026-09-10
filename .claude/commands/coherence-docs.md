---
description: Détecte les documents QualiOF périmés — générés avant une modification des données qu'ils portent (prix, dates, lieu, formateur, programme) — et propose la régénération sûre
argument-hint: "[SES-XXXX | --tous | --depuis 2026-06-01]"
allowed-tools: Bash(pnpm *) Read Grep Glob
---

# Cohérence documentaire — $ARGUMENTS

## Le trou que cette commande couvre

`Document` stocke `hashSha256` (empreinte du **PDF produit**) : il dit que le
fichier n'a pas bougé, pas qu'il raconte encore la vérité. On modifie une
session après coup, les PDF restent, et rien ne signale qu'ils mentent. C'est le
mode de défaillance le plus silencieux du produit — il ne se voit qu'en audit ou
au refus du financeur.

**Depuis le 02/09/2026, une partie du trou est fermée en base** (lot 0 · 0.2) :
`Document.sourceFingerprint` porte l'empreinte des champs d'entrée réellement
rendus, et le verdict est binaire. Mais l'empreinte ne se pose qu'à la
GÉNÉRATION : tout document produit avant cette date a `sourceFingerprint = null`
et s'affiche « non vérifiable » (pastille grise pointillée dans la matrice) —
ni périmé, ni à jour. **C'est exactement le parc que cette commande couvre** :
l'heuristique de dates ci-dessous reste la seule méthode pour le passé, et pour
les types hors périmètre de l'empreinte (EMARGEMENT, FACTURE).

## 0. Mesurer la décrue avant de plonger

```
pnpm --filter @qualiof/web docs:empreintes
```

Lecture seule. Donne le stock de documents **non vérifiables** (types couverts
par l'empreinte, mais produits avant le 02/09/2026) et le pourcentage déjà
vérifiable, par type. Ce stock ne peut que décroître, au rythme des
régénérations légitimes.

Deux usages :

- **avant** une campagne, pour savoir ce qu'il reste à traiter ;
- **après**, pour vérifier que le nombre a bougé. S'il ne bouge pas alors qu'on
  a régénéré, c'est que le chemin emprunté ne pose pas l'empreinte — le
  vérifier avant de conclure quoi que ce soit sur la donnée.

Ne jamais régénérer en masse **pour faire baisser ce compteur** : un document
engagé (catégorie 1 ci-dessous) reste intouchable, compteur ou pas.

## 1. Détecter

Pour chaque `Document` / `PedagogicalAsset` du périmètre, compare
`createdAt` du document avec `updatedAt` des entités dont il dépend :

| Document | Dépend de |
|---|---|
| CONVENTION | session (dates, lieu, modalité), participant (`priceHT`, sponsorOrg), produit (titre, durée, programme), tenant (raison sociale, adresse, SIRET) |
| CONVOCATION | session (dates, lieu), `SessionSlot` (horaires réels), formateur `isPrimary` |
| PROGRAMME | produit (`programMd`, objectifs, durée, `derouleJson`) |
| EMARGEMENT | `SessionSlot`, `Location` (raison sociale + CP + ville), participants inscrits |
| AGEFICE | participant, `Person`, `Organization`, `Location`, produit (champs `agefice*`) |
| ATTESTATION / CERTIFICAT | heures réellement émargées (`Attendance`), participant, session |
| FACTURE | `Invoice` (montants), payeur, `BillingProfile` |

Un document est **suspect** si une de ses dépendances a un `updatedAt`
postérieur à son `createdAt`.

Ajoute trois contrôles indépendants de l'horodatage :

- `ClosureJob.usedStub = true` (ou `PedagogicalAsset.rawJson.source = 'stub'`)
  → contenu générique, jamais personnalisé. Depuis le 02/09 la fiche session le
  signale déjà et le pack ne se télécharge plus sans confirmation ; la commande
  sert alors à balayer les sessions qu'on n'ouvre pas
- clé storage qui ne résout pas (signed URL en erreur) → preuve fantôme
- montant écrit dans la convention ≠ `participant.priceHT` actuel (relire le PDF)

## 2. Trier par gravité

1. **Document engagé et faux** — convention signée ou dossier OPCO envoyé dont
   les données ont bougé depuis. Ni régénérable ni effaçable : avenant ou
   nouveau dossier. À remonter à Laurent nommément.
   `getParticipantDocEngagement` répond déjà à la question, et distingue le
   « peut-être envoyé » (document antérieur au suivi des envois du 02/09) du
   « engagé » prouvé.
2. **Document émis et faux** — envoyé mais pas encore contractuel. Régénérer
   puis renvoyer, en le disant au destinataire.
3. **Document dormant et faux** — jamais sorti de l'outil. Régénération simple.
4. **Faux positif** — la dépendance a bougé sur un champ que le document ne
   porte pas (ex. `internalNotes`). Explique pourquoi tu classes ainsi.

Ne régénère jamais la catégorie 1 sans arbitrage humain explicite.

## 3. Régénérer

`regenerateParticipantDoc` (synchrone : convention, AGEFICE, programme) ou
`regenerateBatchParticipantDocs` (batch closure). Vérifie ensuite le contenu du
PDF produit, pas seulement le code retour. `AuditLog action: 'documents.regenerate'`.

## 4. Ce qui est déjà outillé (ne pas le réécrire)

Livré le 02/09/2026, lot 0 · 0.2 et 0.3 :

| Besoin | Où c'est |
|---|---|
| Empreinte des données d'entrée | `Document.sourceFingerprint`, posée à la génération |
| Projection par type de document | `lib/docs/source-fingerprint.ts` (PUR, testable sans base) |
| Verdict `unknown` / `fresh` / `stale` | `getDocumentStaleness(tenantId, docId)` |
| État documentaire d'une session | `analyzeSessionDocuments(tenantId, sessionId, productId)` — une seule lecture, rend `stale` / `unverifiable` / `engaged` |
| « ce document est-il déjà sorti ? » | `getDocumentEngagement` / `getParticipantDocEngagement` (`lib/docs/document-engagement.ts`) |
| Contenu générique bloquant la remise | blocker `stub_documents` (`blocks: 'delivery'`) dans `getSessionCompleteness` |
| Compteur de décrue du parc non vérifiable | `pnpm --filter @qualiof/web docs:empreintes` |

Deux règles à respecter en étendant l'empreinte :

- **une seule fonction de calcul**, appelée à l'écriture ET au contrôle ;
- **aucune valeur dérivée de `new Date()`** dans une projection, sinon le
  document devient « périmé » le lendemain sans que rien n'ait bougé.

Restent à faire si le besoin se présente : `EMARGEMENT` (porté par
`PedagogicalAsset`, qui n'a pas la colonne) et `FACTURE` (`Invoice.sourceFingerprint`
appartient au lot 2.1 — spec facturation électronique du 02/09).

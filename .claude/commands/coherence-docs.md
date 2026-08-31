---
description: Détecte les documents QualiOF périmés — générés avant une modification des données qu'ils portent (prix, dates, lieu, formateur, programme) — et propose la régénération sûre
argument-hint: "[SES-XXXX | --tous | --depuis 2026-06-01]"
allowed-tools: Bash(pnpm *) Read Grep Glob
---

# Cohérence documentaire — $ARGUMENTS

## Le trou que cette commande couvre

`Document` stocke `hashSha256` (empreinte du **PDF produit**) mais **rien sur
les données d'entrée**. Aucun champ ne dit « ce PDF a été fabriqué à partir de
tel prix, telles dates, tel lieu ». Conséquence : on modifie une session après
coup, les PDF restent, et rien dans l'application ne signale qu'ils mentent.
C'est le mode de défaillance le plus silencieux du produit — il ne se voit qu'en
audit ou au refus du financeur.

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

- `ClosureJob.usedStub = true` → contenu générique, jamais personnalisé
- clé storage qui ne résout pas (signed URL en erreur) → preuve fantôme
- montant écrit dans la convention ≠ `participant.priceHT` actuel (relire le PDF)

## 2. Trier par gravité

1. **Document engagé et faux** — convention signée ou dossier OPCO envoyé dont
   les données ont bougé depuis. Ni régénérable ni effaçable : avenant ou
   nouveau dossier. À remonter à Laurent nommément.
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

## 4. Le correctif de fond à proposer

Si Laurent veut fermer le trou pour de bon : ajouter à `Document` un
`sourceFingerprint String?` = SHA-256 du JSON des champs d'entrée effectivement
rendus, calculé au moment de la génération. Un helper
`isDocumentStale(doc)` recalcule l'empreinte et compare. Le badge « à
régénérer » devient alors dérivable partout (fiche session, matrice Qualiopi,
pack de fin de formation) au lieu d'être deviné à la date.

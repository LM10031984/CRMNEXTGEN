---
description: Pilote la tarification d'une session QualiOF — forfait groupe entreprise et tarif par stagiaire TNS coexistant sur la même session — et propage sans jamais réécrire une pièce déjà engagée
argument-hint: "[SES-XXXX] [optionnel: payeur, nouveau prix, ou --etat]"
allowed-tools: Bash(pnpm *) Read Grep Glob Edit Write
---

# Tarification — session $1

## Le modèle, avant toute chose

Le prix n'appartient PAS à la session. Il appartient au **couple (session × payeur)**.
Sur une même session on trouve couramment :

- **Une agence personne morale avec des salariés** → un **forfait global** négocié
  pour le groupe. Ce n'est pas « un tarif × N salariés » : c'est un montant unique.
  La convention d'entreprise et la facture portent ce forfait.
- **Un agent commercial en EI / auto-entrepreneur**, dans la même salle → un
  **tarif par stagiaire**, souvent calé sur ses droits AGEFICE de l'année.

`TrainingSession.pricePerLearner` ne peut pas représenter les deux. C'est un champ
unique là où il faut une grille. Tout ce qui suit en découle.

Le dépôt porte déjà les traces de ce besoin : `TrainingProduct.groupFlatPrice`
(« Tarif_forfait_groupe »), le correctif `quick-260817-mm0` « prix GLOBAL
entreprise, pas un tarif par salarié », et la règle payeur personne morale du 28/08.
Ne les contredis pas : complète-les.

## Le niveau catalogue, et pourquoi il ne redescend pas

Le prix du produit est un **tarif catalogue**. Il ne redescend jamais sur les
sessions existantes : chaque session a figé son prix négocié à sa création.
Changer `TrainingProduct.priceHT` ou `groupFlatPrice` n'affecte que les sessions
créées **après**. Répercuter sur une session en cours est une décision
commerciale explicite, session par session — jamais une conséquence automatique.

## Étape 1 — État des lieux (toujours en premier, jamais d'écriture)

Pour la session $1, produis un tableau **groupé par payeur** (`sponsorOrgId`) :

| Payeur | Forme juridique | Inscrits | Mode de tarif | Montant | Ce qui est déjà engagé |
|---|---|---|---|---|---|

Pour chaque inscrit de chaque groupe : `priceHT`, `financingMode`,
`financingStatus`, statuts `OpcoSubmission`, statuts `Invoice` (individuelles
**et** groupées via `participantIds`), état de la convention
(`docStatus.CONVENTION` fait autorité, le booléen legacy est *shadowed*).

Signale immédiatement les trois anomalies qui invalident tout le reste :

- un inscrit à **0 €** (le chemin d'inscription public créait des participants à
  zéro et générait la convention dans la foulée)
- une **somme des quotes-parts ≠ forfait** annoncé au payeur
- un montant de convention **≠** `participant.priceHT` actuel (relis le PDF,
  ne te fie pas au champ)

Arrête-toi là et présente. Si l'argument `--etat` est passé, c'est le livrable final.

## Étape 2 — Les deux modes, et ce qu'ils impliquent

### `FORFAIT_GROUPE` — payeur personne morale

Le montant vendu est **global**. `participant.priceHT` devient une **quote-part**,
pas un prix de vente : elle sert au BPF, au CA par stagiaire et au suivi, jamais à
la facturation individuelle.

Règles non négociables :
- La somme des quotes-parts est **exactement** égale au forfait, au centime.
  Répartis à l'euro inférieur et donne le reliquat au dernier inscrit — ne laisse
  jamais un écart d'arrondi apparaître entre la convention et la facture.
- Ajouter ou retirer un salarié **redistribue** les quotes-parts et ne change pas
  le forfait — sauf si le forfait a été renégocié, ce qui est une décision
  commerciale explicite, jamais une conséquence automatique.
- La convention d'entreprise porte le forfait et liste nominativement les
  stagiaires couverts.

### `PAR_STAGIAIRE` — TNS, EI, auto-entrepreneur, autofinancement

Le montant est unitaire et peut différer d'un inscrit à l'autre dans le même groupe.

- Pour un dossier AGEFICE, propose l'alignement sur les droits de l'année
  (`lib/enrollment/agefice-rights.ts`), **sans jamais l'appliquer en silence**.
- Si le tarif dépasse la prise en charge, calcule et affiche le **reste à charge**.
  Il doit apparaître explicitement sur la convention : un apprenant qui découvre
  un solde à payer après coup, c'est un litige, et en audit une réserve sur
  l'information préalable.
- L'année qui compte pour le plafond est celle du **dépôt du dossier**
  (`financingRequestDate`), pas celle de la session.

## Étape 3 — Qui a le droit de bouger

Utilise `classifyParticipantPrice` (`lib/pricing/classify-participant.ts`).
Ne réimplémente pas la règle, ne la contourne pas.

| Classe | Traitement |
|---|---|
| `LIBRE` | nouveau montant appliqué, pièces régénérées |
| `ENGAGE_OPCO` | intouchable — nouveau dossier ou avenant auprès du financeur |
| `FACTURE` | intouchable — avoir puis refacturation (numérotation continue) |
| `SIGNE` | avenant écrit, jamais de régénération muette |

**Le verrou est individuel, la conséquence est collective.** Sur un forfait groupe,
si un seul salarié est déjà facturé, tu ne peux plus redistribuer les quotes-parts
sans casser l'égalité somme = forfait. Dans ce cas : ne touche à rien, expose le
blocage, et propose l'avenant. C'est le piège principal de cette commande.

## Étape 4 — Appliquer

Une transaction. Pour chaque inscrit modifié : l'écriture **et** son `AuditLog`
(`action: 'pricing.cascade'`, diff avant/après, mode de tarif, payeur). Un tarif
changé sans trace est le trou E-4 de l'audit du 28/08.

Puis régénère les pièces des seuls inscrits touchés, via
`routeConventionsByPayerRule` (import dynamique — le routeur tire `@/lib/storage`,
donc `sharedEnv` fail-loud). Vérifie le montant **dans le PDF produit**, pas le
code retour.

## Étape 5 — Rendre compte

Qui a changé, qui n'a pas changé et pourquoi, quelles pièces ont été régénérées,
quels avoirs ou avenants restent à faire à la main. Sur un forfait, redonne
l'égalité vérifiée : `somme des quotes-parts = forfait`.

## Si on te demande de faire évoluer le modèle

La cible est une **grille tarifaire de session**, pas un champ de plus :

```
SessionPricing
  sessionId
  sponsorOrgId          // le payeur — c'est la clé, avec sessionId
  mode                  // FORFAIT_GROUPE | PAR_STAGIAIRE
  amountHT              // le forfait, ou le tarif unitaire par défaut du groupe
  vatRate
  note                  // motif de la remise / de la négociation
  @@unique([sessionId, sponsorOrgId])
```

`participant.priceHT` reste, mais devient **dérivé** : quote-part en forfait,
tarif unitaire sinon, surchargeable à la main pour un cas particulier (et alors
marqué comme tel, sinon la prochaine redistribution l'écrase).

Cascade de résolution du prix d'un inscrit, dans cet ordre :
`SessionPricing` du payeur → `TrainingSession.pricePerLearner` →
`TrainingProduct.groupFlatPrice` si personne morale, sinon `TrainingProduct.priceHT`.
**Jamais 0 comme valeur par défaut** — 0 doit toujours être un choix explicite,
jamais un repli.

Migration Prisma **additive** + `migrate deploy` (jamais `db push` vers le cloud).
**Aucun backfill.** Les sessions existantes gardent ce qu'elles ont : la cascade
retombe sur `session.pricePerLearner` puis le produit, et c'est le comportement
voulu. Reconstruire une grille depuis les `participant.priceHT` actuels
inventerait des forfaits qui n'ont jamais été négociés — sur les 283 couples
mesurés le 28/08, 278 sont homogènes mais 5 divergent, et l'un d'eux (SES-0106)
est un forfait DÉJÀ correctement réparti qu'une reconstruction naïve classerait
en anomalie. Décision verrouillée en Phase 23.

Les 5 cas divergents servent de **fixtures de test, en dur**. Aucun test, aucun
script de vérification ne lit une session réelle pour « valider » une répartition :
c'est le premier chemin par lequel le backfill reviendrait par la fenêtre.

TDD : tests RED d'abord, un par ligne du tableau de l'étape 3, plus l'égalité
d'arrondi et le cas de la session mixte entreprise + EI.

# L'unité d'affichage, pièce par pièce — relevé du 15/09/2026

**Constat, pas correctif.** Deux pièces ont été changées (programme composé,
proposition) parce qu'elles étaient nommées dans l'arbitrage. Les cinq autres
sont **relevées et laissées telles quelles**.

Doctrine appliquée — §8.1, en tête : *une prestation se dit dans l'unité de
celui qui la lit. Le client lit des DEMI-JOURNÉES ; le financeur lit des
JOURNÉES et des HEURES ; « conventionné » et « sur site » ne paraissent sur
aucune pièce.*

---

## A. Les cinq pièces financeur — **toutes conformes, aucun défaut**

| Pièce | Libellé exact rendu | Unité | Verdict |
|---|---|---|---|
| **Convention** | `48 heures (6 journées de 8 heures)` — `convention-template.ts:160‑172`, `formatDuree` gère `%7` et `%8` | heures **+** journées | ✅ |
| **Émargement** | En-têtes `Signature stagiaire · Matin · 09:00 – 12:30` et `· Après-midi · …`, pieds `Signature formateur — Matin` / `— Après-midi` | matin/après-midi = **rythme de signature**, pas un volume | ✅ |
| **Attestation d'assiduité** (AGEFICE) | `Durée en heure(s)` · `Durée en présentiel individuel / collectif` · colonnes `Prévue` / `Réalisée` | heures | ✅ |
| **Dossier AGEFICE** | `Durée : 48 heures` — `agefice-template.ts:269` | heures | ✅ |
| **Dossier OPCO EP** | `Durée : 48h` dans le corps du mail de dépôt — `opco-submission.ts:325` | heures | ✅ |

**Aucune d'elles n'annonce de demi-journées à un financeur.** La chaîne
contractuelle était déjà dans la bonne unité — la règle neuve ne la corrige pas,
elle l'explique.

Note sur l'émargement : le mot « demi-journée » y figure **une fois, dans un
commentaire de fichier** (« tableau de signatures par demi-journée »). Rien n'en
sort au rendu.

---

## B. Ce qui a été changé — les deux pièces nommées

| Pièce | Avant | Après |
|---|---|---|
| **Programme composé**, en-tête | `Durée : 48 h conventionnées (24 h sur site, co-animation 2 formateurs)` | **`6 journées — 48 heures.`** |
| **Programme composé**, blocs | `### Demi-journée 1 — 4 h sur site (8 h conventionnées)` | **`### Journée 1 — 8 h`** |
| **Proposition**, phrase des 5 surfaces | `Les 72 heures conventionnées par participant (9 demi-journées de 4 h sur site, co-animées par 2 formateurs) figurent à l'identique sur…` | **retirée** (la valeur reste au tableau chiffré) |
| **Proposition**, en-tête de colonne | `Heures conv.` | **`Heures`** |

Deux tests ont été **renversés, pas supprimés** (§4 ter), commentaire et motif
conservés. Le test de contrat joue **deux volumes** pour être mutation-safe.

---

## C. Les trois points — TRANCHÉS le 16/09/2026

### ① « co-animé, sur site » — DISSOCIÉ, et le devis suit

Arbitrage : le devis garde la **valeur** (l'assiette de la facture), pas les
**mots**. Son lecteur est le dirigeant, pas le financeur. Donc proposition
**et** devis disent « Parcours de 6 demi-journées ».

**Vérification faite AVANT, comme demandé — rien en aval n'exige des heures :**

| Ce qui aurait pu l'exiger | Constat |
|---|---|
| La **facture** | Elle ne naît pas du devis : aucun `quoteId` sur `Invoice`. Le libellé de ligne est reconstruit (`invoice-snapshot.ts:361`, `invoices.ts:590` = nom du stagiaire) |
| La **facturation électronique** (Factur-X / PDP) | `InvoiceLine.unit` est délibérément **C62** (unité), quantité 1. Le fichier écrit pourquoi HUR est refusé : *« le prix de QualiOF est une place de formation, pas un tarif horaire ; mettre la durée en quantité avec l'unité HUR ferait dire à la facture un prix unitaire que personne n'a négocié »* |
| Une **mention légale** du devis | `quote-template.ts` ne porte aucune mention en heures |

→ Appliqué. Le libellé vit désormais dans **`libelleVolumeClient(halfDays)`**
(`builder.ts`), une fonction nommée plutôt qu'un littéral recopié deux fois —
c'est le patron `decrireDureeProduit`, et c'est §4 septdecies appliqué.

### ② Le rapport d'audit — pièce CLIENT, l'argent remplace les heures

Les trois tuiles de la page 17 :

| | Avant | Après |
|---|---|---|
| 1 | Volume proposé · **10 demi-journées** · *40 h sur site* | Volume proposé · **10 demi-journées** · *Dans vos locaux* |
| 2 | **Heures conventionnées** · *80 h* · *La valeur portée sur la convention…* | **Pris en charge** · *8 400 €* · *Par vos financeurs — montage et dépôt compris* |
| 3 | Reste à charge · *1 680 € sur 10 080 € HT* | inchangé |

**Le compte se referme désormais en euros** : 8 400 + 1 680 = 10 080 € HT. Le
document rendu ne contient plus **aucune** occurrence de « conventionnées » ni
de « sur site » — vérifié sur le HTML produit.

Rendus joints : `DIAG-R001-audit-AVANT.html` et `DIAG-R001-audit-APRES.html`.

**Un point de conception reste ouvert.** Ta phrase — *« 3 000 € par personne et
par an »* — n'est pas dans la page. Deux raisons :

- elle n'est vraie que pour les **bénéficiaires AGEFICE** : sur ce dossier, 2
  agents à 3 000 € mais 1 salarié relevant de l'OPCO EP (2 500 €). Une tuile qui
  annoncerait « 3 000 € par personne » serait fausse pour un tiers de l'équipe ;
- le plafond est une **`FundingRule`** (`AGEFICE_ANNUAL_CAP`), pas une
  constante — et le gabarit ne reçoit pas les règles aujourd'hui.

Proposition : la porter **dans la ligne AGEFICE du tableau**, où elle est vraie
(« 2 agents commerciaux · 3 000 € par personne et par an »), ce qui suppose de
passer les règles au gabarit. À confirmer.

### ③ La mention d'émargement — NON TOUCHÉE

Hors visée, comme tranché : elle décrit un rythme de signature et elle est
exacte. Le garde qui la **fige à une occurrence** reste en place.

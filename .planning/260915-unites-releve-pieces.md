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

## C. Trois points qui demandent ton arbitrage

### ① La chaîne « co-animé, sur site » est PARTAGÉE entre proposition et devis

`builder.ts:276` et `:304` produisent le libellé de ligne :

```
Parcours de 6 demi-journées, co-animé, sur site
```

Il alimente **à la fois** la colonne « Désignation » de la proposition (pièce
client) **et** la ligne du devis (pièce contractuelle, que tu m'as dit de ne pas
toucher).

**Conséquence : la proposition porte encore « sur site ».** Je ne l'ai pas
changée — une chaîne partagée ne se modifie pas pour satisfaire une pièce sans
décider pour l'autre. Deux sorties possibles :

- **dissocier** : un libellé client (`Parcours de 6 demi-journées`) et un libellé
  contractuel (inchangé) — c'est le patron `decrireDureeProduit` de
  `creneaux.ts`, déjà éprouvé ;
- **aligner** : un seul libellé sans les mots d'interne, sur les deux pièces.

### ② Deux arbitrages d'il y a une heure sont contredits par la règle neuve

Tu avais dit **garder** ces deux-là. La règle « ces mots ne paraissent sur
aucune pièce » les vise désormais. Je ne tranche pas à ta place.

| Pièce | Ce qu'elle porte encore |
|---|---|
| **Rapport d'audit**, tuiles de la page financement | `24 h sur site` · `Heures conventionnées` · *« La valeur portée sur la convention, l'émargement et le dossier financeur »* |
| **Devis**, libellé de ligne | `… de 4 h sur site, … 48 h conventionnées par participant` |

Lecture possible : la règle neuve les emporte, et le devis dirait « 6 journées —
48 heures ». Lecture inverse : ton « garde-la » nommait ces pièces, la règle
neuve nommait les deux autres — **et une consigne dit ce qu'elle couvre**
(§4 quater). C'est la raison pour laquelle je te la pose au lieu d'étendre.

### ③ Une mention d'organisme dit « demi-journée » sur toutes les pièces Qualiopi

`qualiopi-mentions.ts:81`, rubrique *Modalités d'évaluation* :

> « Une liste d'émargement est signée **à la demi-journée** ; »

Elle sort dans le programme composé — et dans toute pièce qui hérite des
mentions. Elle décrit un **rythme de signature**, pas un volume vendu, donc elle
n'est probablement pas visée. Mais c'est la seule occurrence restante, et un
test la **fige à une** : si une seconde apparaît, le cadre du programme s'est
remis à parler en demi-journées et le test rougit.

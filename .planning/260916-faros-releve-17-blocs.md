# Faros — ce que le corpus contient vraiment

_Relevé écrit le 16/09/2026. Population : `~/Projects/nxt-coach/Formation Faros`
(538 Mo), lecture seule, aucun fichier modifié. Ce que j'ai cherché : les
**unités importables** dans le catalogue QualiOF, et ce qui répond aux **20
douleurs sans réponse** du relevé `260916-rattachement-douleur-module.md`._

> **Pourquoi ce fichier existe.** La session précédente a annoncé « le relevé des
> 17 blocs Faros est livré et inchangé **dans le rapport** ». Il n'y avait aucun
> fichier. Un relevé qui vit dans un rapport de conversation n'est pas un relevé :
> personne ne peut le rouvrir. C'est la même famille que `quick.md` §4 quater.
> Celui-ci est écrit sur le disque, daté, et nomme sa population.

---

## 1 · Le fait qui commande tout : il n'y a aucune vidéo

| Cherché dans les 538 Mo | Trouvé |
|---|---:|
| `*.mp4`, `*.mov`, `*.m4v`, `*.avi` | **0** |
| `*.mp3`, `*.m4a`, `*.wav` | 1 (un enregistrement de réunion du 31/08) |

Faros est **intégralement en pré-production** : scripts, prompteurs par voix,
shot-lists, plans de démo, livrets apprenant. Le cours n'est pas tourné.

---

## 2 · Trois corpus, trois statuts — et ils ne disent pas la même chose

| Corpus | Version | Statut écrit dans son propre manifeste |
|---|---|---|
| `SA_ADM_M001_AGEFICE_…` | v1.0 · 16/07/2026 | **G3 prêt à produire** |
| `SA_ACQ_M003_TROUVER_VENDEURS_…` | v1.0 · 20/07/2026 | **G3 prêt à produire** |
| `AGENT-INCOMPARABLE…/LIVRAISON_PARCOURS` (M0→M6) | **v0.9** · 29/07/2026 | **« NE PAS DIFFUSER AUX APPRENANTS — relecture et levée des ⚠️ requises »**, trous 🔴/🟠 non levés, liens GPT `[À COMPLÉTER]` |
| `TOURNAGE-PAR-MODULE` (les 17 blocs) | v2 · 17/08/2026 | pack de **tournage** — « à tourner », pas « tourné » |

### L'extraction ne s'arrête pas à 2 par accident

Le catalogue porte `faros:SA-ADM-M001` et `faros:SA-ACQ-M003`. **Ce sont
exactement les deux seuls corpus dont le manifeste dit « prêt ».** La cause A du
`260914-POINT-5` (« pourquoi l'extraction n'en voit que 2 ») se referme ici :
ce n'était pas un défaut d'extraction, c'était le corpus qui se refusait
lui-même. Il n'y a rien à réparer de ce côté.

---

## 3 · Les 17 blocs — relevé complet

Source : `TOURNAGE-PAR-MODULE/00-INDEX.html`, v2 du 17/08 au soir.
**154 capsules** au total.

| # | Bloc | Capsules | État que le pack se donne |
|---:|---|---:|---|
| 1 | Pré-module — Le Diagnostic | 3 | ✅ prêt |
| 2 | Pré-module — Le Dossier | 4 | 🆕 **PROPOSITION à valider** |
| 3 | Capsule — Les Garde-fous | 1 | ✅ prêt |
| 4 | M0 — Le Socle IA | 22 | ✅ prêt |
| 5 | M1 — Trouver des vendeurs | 28 | 🆕 prompteur extrait le 17/08 |
| 6 | M2 — Gagner le mandat | 23 | ⚠️ sourcer 141/91 avant D3/D6 |
| 7 | M3 — Commercialiser ★ MODULE TEST | 13 | ⚠️ à valider |
| 8 | M4 — Ne plus jamais perdre un vendeur | 17 | ⚠️ seuils 10/15 |
| 9 | M5 — Gagner 5 à 10 heures | 11 | ✅ prêt |
| 10 | M6 — Maîtriser l'acheteur & piloter | 15 | ⚠️ **7 chiffres à valider** (DPE, ratios) |
| 11 | Capsule — Connecteurs mail | 5 | 🆕 réparée 17/08 |
| 12 | Démo-kit — Outils branchés | — | kit de données à exécuter à J-4 |
| 13 | Fil rouge — Train my agent | 2 | ✅ prêt |
| 14 | Bonus — Créer tes outils | 2 | ⚠️ 2 renvois à trancher |
| 15 | Bonus — Partir de zéro | 1 | ✅ prêt |
| 16 | M6-F — Tes agents qui bossent | 6 | 🆕 intégré 17/08 |
| 17 | Capsule — L'interface a changé (pérennité) | 1 | 🆕 intégré 17/08 |

**7 blocs sur 17 portent un ⚠️ ou un 🆕 non validé dans leur propre fiche.**

---

## 4 · La question de design tranchée : quelle est l'unité importée ?

La question posée était : la capsule, ou le **groupe de capsules** (A1-A4,
B1-B4…) ? J'ai regardé les deux. Aucune des deux ne tient.

### Le groupe de lettres n'est pas une unité — il n'a pas de titre

Le regroupement par lettre est régulier dans **6 blocs sur 17** (M0, M2, M3, M4,
M5, M6) et **nulle part il ne porte de nom**. Ni dans les fiches, ni dans les
plans. Le plan de tournage de M0 numérote d'ailleurs autrement que sa propre
fiche (`0`, `1.1`→`1.4`, `2`, `3`, `4` contre `A`→`F`). Le groupe de lettres est
un **ordre de tournage**, pas une séquence pédagogique nommée.

Sans titre, pas d'objectif. Sans objectif, rien qui puisse partir dans un
programme Qualiopi. La question se ferme d'elle-même.

### ⚠️ Et le seul endroit qui semble donner un titre au groupe est un piège d'homonymie

Les livrets apprenant de M2 s'appellent `M2-A1` … `M2-A5`. Ce ne sont **pas** les
capsules `A1`…`A5`. Vérifié en ouvrant les cinq :

| Livret | Son titre | La capsule qui porte le même code |
|---|---|---|
| `M2-A1-preparer-r1` | Préparer ton R1 vendeur | `A1` = « Un prix se compare, une stratégie se choisit » |
| `M2-A2-protocole-vendeur` | Le protocole vendeur augmenté par l'IA | `A2` = « Ton intel en 15 minutes » |
| `M2-A3-dossier-renovation` | Le dossier rénovation | `A3` = « Tes 5 questions et tes 2 parades » |
| `M2-A4-prepa-r2-closer` | Prépa R2 : closer le mandat | `A4` = « Atelier : prépare ton prochain R1 » |
| `M2-A5-estimation-multilingue-video` | Estimation multilingue & vidéo | *(pas de capsule A5)* |

Le `A` du livret est un **numéro d'annexe**, pas la lettre du groupe. Un import
qui apparierait sur la chaîne « A1 » câblerait chaque livret sur la mauvaise
capsule, **sans jamais échouer**. Même famille que `quick.md` §4 quater bis :
une décision s'attache à une identité, jamais à un libellé.

### La capsule ne tient pas non plus : elle casse la doctrine des unités

Une capsule dure **5 à 15 minutes** et se regarde seule. Une unité du catalogue
QualiOF se vend en **demi-journées co-animées sur site**. Verser 154 capsules
dans les 336 unités animables, c'est mettre un objet de 10 minutes dans le même
sac qu'une demi-journée de 4 heures — et laisser le composeur en tirer un
parcours. Le client lirait « 6 demi-journées », le financeur « 48 heures », et
l'une des unités dedans serait une vidéo de 12 minutes qui n'est pas tournée.

### ⛔ La réponse : **on n'importe rien aujourd'hui**

Ni la capsule, ni le groupe. Pas pour une raison technique — parce que **le
corpus dit lui-même qu'il n'est pas diffusable**, et que le mettre au catalogue
produirait exactement le défaut qu'on traque depuis une semaine : *une absence
rendue par une affirmation positive*. Un programme remis à un financeur qui
annonce « M2 — Gagner le mandat, 23 capsules » pour des vidéos qui n'existent
pas en est la pire instance possible.

---

## 5 · Ce à quoi Faros sert vraiment : écrire les 20 modules manquants

Faros n'est pas du **catalogue**. C'est de la **matière rédactionnelle** — et
sur ce terrain il est excellent : chaque capsule porte un titre déjà écrit dans
la langue du métier, une durée, une voix, et un plan de démo détaillé.

Croisement des **20 douleurs sans réponse** (§6 de
`260916-rattachement-douleur-module.md`) avec les 154 titres de capsules :

### Nommées par une capsule — 11 sur 20

| Douleur | Capsule Faros |
|---|---|
| Outil d'IA paramétré (instructions personnalisées) | **M0-B1 — Instructions personnalisées + mémoire** *(au mot près)* |
| Réflexe de vérification des réponses IA | **Garde-fous G1 — Les 5 garde-fous du conseiller augmenté** |
| Part d'exclusivité dans les rentrées | M2-D3 — L'exclusivité, chiffrée et montrée |
| Attitude face à un vendeur au-dessus du marché | M2-C1 — L'ACM sans prix · M2-C2 — défendre le prix par le potentiel |
| Transformation rendez-vous → mandat | M2-D1 — R1 découvre, R2 conclut · M2-D4 — Le closing collaboratif + les 3 objections |
| Nombre de visites nécessaires par vente | M4-C3 — Le taux d'attractivité · M4-C1 — Après chaque visite |
| Indicateurs suivis | M6-E1 — Tes chiffres de conseiller : le tableau de bord |
| Processus de requalification du stock | M3-C2 — La rotation des 15 jours · M4-D2 — /bilan-gamma · M4-D3 — Présenter le bilan |
| Base à jour | M6-F2 — Réveiller ta base dormante : le nursing qui tourne |
| La base est exploitée | M6-F2 (idem) |
| Diversité des sources de contacts | M1 — livrets *secteur/boîtage*, *prospect IA*, *e-réputation*, *présence locale* |

### Approchées sans être nommées — 6

Transformation contacts → rendez-vous (M1, dont les 28 capsules ne sont pas
titrées dans la fiche — elles sont dans le master PDF) · Financement acquéreur
vérifié en amont (M6-A3, les deux filtres) · Avis de valeur écrit remis (M2-C1
approche l'ACM, pas l'avis de valeur) · Processus de collecte d'avis (livret M1-E
e-réputation) · Toute l'équipe a accès aux outils (M0-C1 boîte à outils) ·
Reporting commercial en place (M6-E1, côté conseiller).

### Rien dans Faros — 3, et elles ont une famille commune

**Part de l'équipe qui prospecte réellement** · **Rythme de réunion d'équipe** ·
**Signature électronique en place**.

Les deux premières sont des douleurs de **dirigeant** ; Faros est écrit pour le
**conseiller**. C'est la limite du corpus, et elle est nette : le parcours forme
celui qui vend, pas celui qui pilote ceux qui vendent.

---

## 6 · Ce qui reste à trancher — pour Laurent, pas pour une session

1. **Faros entre-t-il un jour au catalogue ?** Si oui, il lui faut un champ
   `modalite` explicite (distanciel asynchrone) et sa propre unité de lecture —
   pas les demi-journées. Tant que ce champ n'existe pas, la réponse est non.
2. **Les 20 modules manquants s'écrivent-ils à partir de Faros ?** Oui pour 11
   d'entre eux, et le travail est d'écrire un déroulé de demi-journée à partir
   d'un script de capsule — pas de copier le script.
3. **Les 3 douleurs de dirigeant** n'ont de source nulle part. Elles s'écrivent
   depuis zéro, ou elles sortent du diagnostic.

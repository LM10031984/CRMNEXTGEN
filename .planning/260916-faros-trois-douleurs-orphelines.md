# Les 3 douleurs orphelines — cherchées dans TOUT le corpus Faros

_Relevé du 16/09/2026. Lecture seule : **aucun fichier du dossier
`Formation Faros` n'a été modifié**, aucune écriture en base._

## Ce qu'on me demandait de vérifier

La lecture à confronter : « **part de l'équipe qui prospecte réellement** »,
« **rythme de réunion d'équipe** » et « **signature électronique en place** »
n'ont aucune réponse dans Faros. Le relevé
`260916-faros-releve-17-blocs.md` §5 les donnait pour orphelines après avoir
croisé les **154 titres de capsules**. La consigne : chercher **au-delà des
titres** — livrets, PDF, transcripts.

---

## 1 · Population balayée

`~/Projects/nxt-coach/Formation Faros`, **537 Mo**. Les copies
`AGENT-INCOMPARABLE-CONTENU-20260817 2` et `… 3` sont exclues (contenu identique,
six `.DS_Store` d'écart — vérifié).

| Format | Fichiers | Comment il a été lu | Lus |
|---|---:|---|---:|
| `.html` `.txt` `.md` `.csv` | 427 | `grep -iE` direct | 427 |
| `.pdf` | 149 | extraction `unpdf` (dépendance du dépôt), texte fusionné | **149 / 149** |
| `.docx` `.pptx` | 19 | `unzip -p '*.xml'` + suppression des balises | 19 |
| **Total** | **595** | | **595** |

**0 fichier illisible.** Témoin de non-vacuité, exigé avant de conclure à un
zéro : `Presentation_Projet_Elearning_StartAcademy.docx` rend 14 657 caractères.

⚠️ **Le dossier n'est pas le parcours.** `Formation Faros/` est un répertoire de
travail : il contient le parcours Faros *et* de la matière de référence d'autres
missions — formations **Nestenn**, formation **Ludo Salenne** (~55 PDF), baromètre
ISTF. Cette distinction commande la réponse n°2 ci-dessous.

## 2 · Motifs employés, verbatim

```
signature   signature [ée]lectronique|yousign|docusign|e-?sign\b|parapheur|signer en ligne
réunion     r[ée]union d'[ée]quipe|r[ée]union hebdo|point d'[ée]quipe|
            r[ée]union commerciale|animer une r[ée]union|rituel d'[ée]quipe
prospection qui prospecte|part de l'[ée]quipe|proportion.{0,30}[ée]quipe|
            combien de conseillers|tous.{0,15}prospectent|[ée]quipe.{0,30}prospecte
```

Puis, sur les 9 PDF **manager** (`manager|phase2|saison2|participant|recap`), un
comptage élargi à `réunion` / `signature` / `équipe` nus — large à la détection,
strict au jugement (`quick.md` §4 quaterdecies).

### Deux motifs ont mordu à faux, et je les corrige ici

- **`e-signature` a matché à l'intérieur d'un mot composé** : « formul**e-signature** »
  (`conception/VOIX-NEYRAT.md:40`), « phras**e-signature** »
  (`conception/TEMPLATE-module.md:86`). Ce sont des *formules fétiches de
  l'animateur*. Le motif manquait ses limites de mot.
- **`qui prospecte` a matché le préfixe de « qui prospect*er* »** :
  « Famille A — CIBLER (la data : **qui prospecter**) »
  (`DOSSIER-TOURNEUR/05-m1.html:43`, `conception/modules/M1-structure.md:18`).
  C'est *qui cibler*, pas *qui dans l'équipe prospecte* — le sens inverse.

Aucune des deux n'est une touche. Sans le motif écrit, on ne pourrait pas le
savoir (`quick.md` §4 quater).

---

## 3 · Verdict, douleur par douleur

### ① Signature électronique en place — **RIEN. Confirmé.**

**Zéro occurrence** sur les 595 fichiers. Les seules chaînes « signature » du
corpus sont :

- « signature du compromis », « signature mandat », « améliorer la signature de
  mandats » — l'acte de signer, pas l'outil ;
- les deux « formule-signature » ci-dessus.

Ni `Yousign`, ni `DocuSign`, ni `parapheur`, ni « signer en ligne » nulle part.
**Ta lecture tient.**

### ② Part de l'équipe qui prospecte réellement — **RIEN de nommé.**

Aucun fichier ne pose la question du **ratio** : combien de conseillers
prospectent effectivement. Faros mesure l'activité d'**un** conseiller
(`M1-A3 — Diagnostic : où fuit ton acquisition ?`, `M1-F2 — Piloter les bons
indicateurs`), jamais la dispersion dans une équipe.

Le plus approchant est **hors parcours Faros** : `phase2_formation_ia_nestenn (1).pdf`
porte « **Ma Perf Immo** — Piloter la performance individuelle et collective »
(45 min). Il pilote une performance ; il ne mesure pas la part de l'équipe qui
prospecte. **Approché, pas nommé.** Ta lecture tient.

### ③ Rythme de réunion d'équipe — **JE TE CONTREDIS, et voici où.**

**Dans le parcours Faros : rien**, et les trois échos sont tous des *usages* qui
présupposent la réunion au lieu de l'installer :

- `TOURNAGE-PAR-MODULE/13-FIL-ROUGE-TRAIN-MY-AGENT/TEXTE-LAURENT.txt:20` —
  « le ring collectif. Le simulateur fait un excellent exercice de réunion
  d'équipe » ;
- `LIVRAISON_PARCOURS/M6_ACHETEUR_PILOTAGE/M6-RESSOURCES.html:354` — idem ;
- `nestenn_guide_participant.pdf` — « Format visuel à partager en réunion
  d'équipe ».

**Un quatrième écho est différent et mérite ton arbitrage** :

> `conception/00-MAPPING.md:38`
> « **M7 — Pack IA Agence / Manager (11)** : **Prépa réunion d'équipe** · Prépa
> coaching · Agent de coaching · Analyse de coaching · Pilotage / tableaux de bord
> conseiller · … »
> *(M7 = cible secondaire managers, phase « Agence », **hors MVP 7** — listé pour
> mémoire.)*

La douleur est donc **nommée et explicitement écartée** du périmètre, dans un
document qui se déclare lui-même « **PAS du contenu pédagogique** — une grille de
correspondance ». Il n'y a rien à importer : il y a une intention différée.

**Et hors parcours, dans le dossier, il existe un module entier qui y répond :**

> `phase2_formation_ia_nestenn (1).pdf`, p. 12 sqq.
> « **MODULE 2 — Brief Immo.** Préparez et animez efficacement vos réunions
> d'équipe grâce à l'IA. **60 minutes · démo + création.**
> *Gains pour le manager* : réunions ciblées, motivantes, actionnables · gain de
> 30-45 minutes sur chaque réunion · supports générés : ordre du jour, slides,
> résumés. »
> Et le déroulé type de la réunion y est écrit (« 5 Capsule coaching (5 min)… ·
> 6 Challenge de la semaine (5 min)… »).

**C'est un livrable NESTENN, pas Faros** — branding Nestenn de bout en bout, absent
de `TOURNAGE-PAR-MODULE`, de `LIVRAISON_PARCOURS` et de `conception/`. Il est dans
le dossier parce que c'est le répertoire de travail de Laurent.

> **Ce que ça change, et c'est à toi de trancher** : si la matière rédactionnelle
> se prend dans le DOSSIER et pas seulement dans le PARCOURS, alors la douleur
> « rythme de réunion d'équipe » **a une source**, et elle est mieux écrite que la
> plupart des modules du catalogue. Je ne tranche pas : le corpus Nestenn est un
> livrable d'un autre client.

---

## 4 · Ce que ce relevé n'a pas cherché

- Le `.mp3` du 31/08 (2 h 45 d'enregistrement de réunion) n'est **pas transcrit** :
  son contenu échappe à tout motif textuel. C'est le seul angle mort du balayage.
- Les 14 `.zip` n'ont pas été dépliés — ils portent, d'après leurs noms, des
  copies des packs déjà balayés (`PACK-TOURNAGE-v2`, `TOURNAGE-PAR-MODULE-20260817`,
  `REVUE-AGENT-INCOMPARABLE`). **Non vérifié**, dit plutôt que supposé.
- Les 6 `.png` (captures) et les 2 `.xlsx` n'ont pas été lus.

## 5 · Ce qui en découle

1. **Deux douleurs sur trois sont bien orphelines**, confirmé sur 595 fichiers.
   Elles s'écrivent depuis zéro, ou elles sortent du diagnostic.
2. **La troisième a une source, hors Faros** — arbitrage attendu sur le périmètre
   de la matière rédactionnelle (parcours seul, ou dossier entier).
3. La limite du corpus est nette et elle se confirme : **Faros forme celui qui
   vend, pas celui qui pilote ceux qui vendent.** Le pack manager existe à l'état
   de ligne dans un mapping, marqué « hors MVP ».

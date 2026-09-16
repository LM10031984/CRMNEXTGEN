# Les rattachements douleur → module, écrits en base locale

_16/09/2026. Population : base **LOCALE** `qualiof_dev`, tenant « Start Academy ».
Aucune écriture en production, aucune migration. Ce relevé dit ce qui est écrit,
ce qui ne l'est pas et pourquoi, et ce qui reste sans réponse après écriture._

## 1 · Ce qui a été écrit

**1 signal posé.** Et c'est là que mon attendu était faux : les 7 décisions du
tri du 11/09 **étaient déjà écrites** depuis ce jour-là (commit `7dafa2d4`,
« écrits en base »). Vérifié par lecture directe avant d'agir, pas déduit.

| | |
|---|---:|
| Décisions écrivables | **8** |
| Cibles de module | **12** |
| Posées le 16/09 | **1** |
| Déjà en place (11/09) | **11** |
| En échec | **0** |

La seule écriture du jour :

| Douleur | Chapitre | Module | Identité |
|---|---|---|---|
| Avis en ligne rapportés aux ventes | 9 — Base de données & e-réputation | Répondre aux avis clients en ligne, positifs comme négatifs | `drive:047#20` |

Signal posé : « Réputation — peu d'avis en ligne au regard du nombre de ventes :
la demande d'avis n'est pas systématique ».

**Distinct, à dessein**, du signal que `ecrire-modules-rediges.ts` avait posé le
11/09 sur le même module — celui-là porte le **moment** de la demande, celui-ci
le **ratio** du barème. Les fondre ferait répondre un seul signal à deux
questions (§4 quater). `drive:047#20` en porte donc deux.

### Protocole tenu

- **Une transaction.** Les écritures sont collectées puis appliquées ensemble :
  un rattachement à moitié posé laisserait des douleurs couvertes et d'autres
  non, sans qu'on sache lesquelles.
- **AuditLog dans la même transaction que la donnée** — un journal qui survit à
  un échec d'écriture raconterait une écriture qui n'a pas eu lieu. Une entrée :
  `diagnostic.rattachement.pose` · `TrainingModule` · `drive:047#20` ·
  before 1 signal → after 2.
- **Idempotence prouvée, pas supposée.** Second passage immédiat :
  `0 signal posé · 12 déjà en place · 0 en échec`.

## 2 · Ce qui n'est pas écrit, et pourquoi

**2 douleurs, non écrivables — et ce n'est pas un reste à faire.**

| Douleur | Cibles retenues par Laurent | Obstacle |
|---|---|---|
| Modèles de prompts communs à l'équipe | `PROD-0042`, `PROD-0066`, `PROD-0058` | produits **vendus**, aucun module |
| Coaching individuel régulier | `PROD-c0c85e08` | idem |

Un signal se pose sur un **module** ; leur programme vit dans `programMd` et ils
n'en portent aucun. **Il n'y a rien où poser.** L'obstacle est structurel : la
décision est prise, elle n'est pas en attente.

C'est d'ailleurs ce qu'une des phrases corrigées au §4 disait mal.

## 3 · Ce qui reste sans réponse après écriture

**20 douleurs** — confirmé, pas repris d'un document. Relevé régénéré après
écriture : `10 rattachées · 0 à relire · 4 barrées · 20 sans proposition`.

Le §2 (« à relire ») est **vide**, comme Laurent l'a tranché : la seule ligne qui
y figurait était « Avis en ligne rapportés aux ventes », désormais rattachée.

## 4 · Le balayage — les phrases qui affirmaient un état de la base

`propose-rattachement.ts` portait **cinq** affirmations sur l'état de la base
qu'il ne lisait jamais. La première m'a induit en erreur aujourd'hui.

| Ligne | Ce qu'elle disait | Sort |
|---|---|---|
| 654 | « **Les rattachements ne sont pas encore écrits en base.** » — en gras, collée à une date réelle qui lui donnait l'air d'une mesure | ✅ remplacée par une **mesure** |
| 695 | « C'est ce qui **sera** écrit en base à ta validation. » | ✅ dérive de la mesure |
| 900 | « Il est ici comme trace de ce qui **va être** écrit. » | ✅ dérive de la mesure |
| 901 | « **On écrit** le rattachement : le module retenu reçoit le signal… » | ✅ dérive de la mesure |
| ~137 | « ⚠️ **Pas encore écrit en base.** » sur les 2 produits vendus | ✅ → « ⛔ **Non écrivable en l'état.** » |

La cinquième est d'une autre nature et mérite d'être distinguée : elle ne se
trompait pas sur un fait, elle se trompait sur la **nature** du fait. « Pas
encore » annonce une action en attente ; l'obstacle est structurel. Rien n'attend.

### La mesure qui remplace la constante

Le script compte désormais, à chaque génération, les cibles qui portent leur
signal. Trois états, tous lisibles :

```
aucun écrit      → **Aucun rattachement n'est écrit en base** (0 cible sur 12).
partiellement    → **N cible(s) sur 12 sont écrites en base** — les autres attendent…
tous écrits      → **Tous les rattachements sont écrits en base** (12 cible(s) sur 12).
```

Sortie effective après écriture : *« **Tous les rattachements sont écrits en
base** (12 cible(s) sur 12). **Compté à la génération, pas supposé.** »*

## 5 · Vérification du parcours composé — DIAG-R001

| Critère | Résultat |
|---|---|
| Volume | **6 demi-journées · 48 h conventionnées** ✅ |
| Σ devis = Σ proposition | ✅ au centime (6 048,00 € HT) |
| « déroulé à compléter » | **0 occurrence** ✅ |
| `drive:047#20` programmé une seule fois | **non vérifiable ici** — voir ci-dessous |

⚠️ **Le contrôle d'unicité demandé ne peut pas se faire sur ce dossier.**
`drive:047#20` n'apparaît **pas du tout** dans le parcours de DIAG-R001 : la
douleur « avis » n'y est pas déclenchée. Zéro occurrence n'est pas « une seule
occurrence » — c'est une autre mesure, et la dire pour l'autre serait le défaut
qu'on traque.

Ce que ce dossier prouve en revanche, sur un autre module : le dédoublonnage
**fonctionne**. Notice de composition : *« 1 module écarté parce qu'il figurait
déjà au parcours (Installer un rythme de suivi vendeur qui tient jusqu'à la
vente). Un module transverse remonte sur plusieurs besoins — il n'est programmé
qu'une fois. »* (`composer.ts:333`.)

**À vérifier sur un dossier qui déclenche la douleur « avis ».** Non fait.

## 6 · Relevé sans correction — la justification affichée peut être la mauvaise

`composed-programme.ts:448` : `signal: m.matchedSignals[0] ?? null`.

Seul le **premier** signal est retenu pour l'affichage. Un module qui en porte
deux — et `drive:047#20` en porte deux depuis aujourd'hui — affiche donc la
justification d'**origine**, pas nécessairement celle qui l'a sélectionné.

Le composeur dédoublonne correctement (`composer.ts:333`) : **il n'y a pas de
doublon dans le parcours.** C'est la **raison affichée** qui peut être la
mauvaise — sur une pièce dont tout l'intérêt est de tracer pourquoi chaque
module y est.

**Noté, non corrigé**, sur consigne.

## 7 · Ce que ce relevé n'a pas fait

- **Rien en production.** Le second tour est arbitré séparément.
- Aucune migration, aucune PR, aucun merge.
- Le contrôle d'unicité de `drive:047#20` dans un parcours composé (§5).
- Les 4 barrages du 11/09 restent des refus de paire : aucune des 4 douleurs
  n'a trouvé d'autre candidat, elles restent dans les 20.

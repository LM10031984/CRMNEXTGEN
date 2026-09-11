---
quick_id: 260911-kwf
phase: quick-260911-kwf
plan: "03"
slug: decisions-par-surface
branch: docs/260911-decisions-par-surface
subsystem: spec-chaine-diagnostic
tags: [spec, decisions, heures-conventionnees, qualiopi, financeur, rdv, documentation]
requires:
  - .planning/specs/2026-09-01-chaine-diagnostic-proposition.md
provides:
  - "D-23 / D-25 : trois règles PAR SURFACE au lieu d'un « partout », datées et motivées"
  - "§7.1 et §7.2 alignés sur le code : l'écran participant ne porte pas les heures conventionnées"
  - "D-6 CLOSE avec sa réponse, sa source et la consigne « ne jamais rouvrir »"
  - "D-8 migrée vers les TRANCHÉES (sa cellule le disait déjà)"
  - "l'avertissement de MIGRATION en tête du tableau des décisions restantes — UN bloc, refondu en passe 2 avec la formulation de Laurent"
  - "creneaux.ts : le commentaire renvoie au §8.1 et à D-23/D-25, plus à « règle n°2 »"
  - "D-3, D-4, D-5, D-7 et D-10 migrées vers les TRANCHÉES, chacune avec son MOTIF et la date du 11/09/2026"
  - "D-7 : les plafonds OPCO EP sont un FAIT VÉRIFIÉ (IDCC 1527), le seed est juste, le « ≈ 4 000 € » d'OPTIMO était une erreur de saisie"
  - "§8.2 + table des FundingRule : un plafond OPCO EP est une donnée de BRANCHE, modifiable à dessein — pas une constante du produit"
  - "D-1, D-2, D-9 : colonne « Se ferme quand » — elles attendent des données réelles, pas un avis"
  - "creneaux.test.ts : dernier pointeur « règle gravée n°2 » corrigé, commentaire seul, 3155 tests inchangés"
affects:
  - ".planning/specs/2026-09-01-chaine-diagnostic-proposition.md"
  - "apps/web/src/lib/campagne/creneaux.ts"
  - "apps/web/src/app/rdv/[token]/page.tsx"
  - ".planning/STATE.md"
tech-stack:
  added: []
  patterns:
    - "une décision tranchée MIGRE vers le tableau des TRANCHÉES le jour même — y laisser une décision close la rend fausse"
    - "jamais de pointeur « ligne NNN » dans un texte durable : nommer la section (§8.1) ou la décision (D-23)"
    - "une règle d'affichage s'énonce PAR SURFACE, avec son lecteur — pas « partout »"
key-files:
  created:
    - .planning/quick/260911-kwf-lot-1-extraction-retirer-les-pieds-de-pa/260911-kwf-SUMMARY-03.md
  modified:
    - .planning/specs/2026-09-01-chaine-diagnostic-proposition.md
    - apps/web/src/lib/campagne/creneaux.ts
    - apps/web/src/app/rdv/[token]/page.tsx
    - apps/web/src/lib/campagne/__tests__/creneaux.test.ts
    - .planning/STATE.md
decisions:
  - "Le commit 267f401 est CONSERVÉ, pas reverté : la ligne rouge du §8.1 nomme ses cinq surfaces, et l'écran d'inscription n'en fait pas partie."
  - "Le lecteur des heures conventionnées est le PAYEUR, qui les reçoit expliquées dans la proposition avant la convention."
  - "D-6 CLOSE le 11/09/2026 : le dossier se déclare en 8 h. Source : les sessions co-animées sont déjà remboursées sur des heures doublées, les dossiers payés de Laurent font foi. Ne JAMAIS la rouvrir."
  - "D-8 rejoint les TRANCHÉES : sa propre cellule disait « ✅ tranchée avec D-11 »."
  - "Une décision tranchée migre le jour même vers le tableau du dessus — c'est la cause racine de l'incident du 11/09, troisième cas de la semaine."
  - "Passe 1 : D-1..D-5, D-7, D-9, D-10 laissées NON tranchées — leur seconde colonne est un défaut PROPOSÉ, pas un arbitrage. Question posée à Laurent."
  - "Passe 2, réponse de Laurent du 11/09/2026 : D-3 (remise > 15 % par MANAGER, cohérent avec D-8), D-4 (devis à l'ACCEPTATION — pas de DEV-NNNN mort, numérotation propre pour l'audit), D-5 (30 j + relance J-5 — le dossier OPCO EP se dépose 1 mois avant le démarrage), D-10 (page équipe v1 = CA N-1 + objectif + forces ; ratios individuels = référentiel v2) rejoignent les TRANCHÉES."
  - "D-7 n'est PAS un arbitrage mais un FAIT VÉRIFIÉ : plafonds OPCO EP 2026, IDCC 1527 — 2 500 € < 11 salariés, 4 500 € de 11 à 50, fonds conventionnels au-delà. Le seed est juste ; le « ≈ 4 000 € » d'OPTIMO était une erreur de saisie, pas une source concurrente."
  - "Un plafond OPCO EP est une donnée de BRANCHE (convention collective du client), pas une constante du produit : IDCC 1527 couvre les agences et les syndics, hors immobilier le chiffre change, donc le FundingRule reste modifiable à dessein."
  - "D-1, D-2 et D-9 restent OUVERTES parce qu'elles attendent des DONNÉES RÉELLES, pas un avis — chacune porte sa condition de fermeture. D-9 : tant que le barème n'est pas figé, aucun score n'est comparable d'un audit à l'autre."
  - "L'avertissement de tenue du tableau est refondu en UN bloc, pas empilé — un second avertissement serait le défaut même que la règle dénonce. Formulation de Laurent : le remède est le DÉPLACEMENT, pas l'écriture."
metrics:
  duration: "~50 min (passe 1) + ~40 min (passe 2)"
  tasks: 9
  commits: 10
  tests_added: 0
  completed: "2026-09-11"
---

# Quick 260911-kwf-03 — La lecture des heures se règle PAR SURFACE, et la décision vit dans la spec

Documentation seule, plus trois commentaires. **Aucun comportement, aucune
signature, aucune assertion de test touchés** — le commit `267f401` est conservé
tel quel.

> **Ce compte rendu couvre DEUX passes de la même branche** (`docs/260911-decisions-par-surface`,
> PR #61). **Passe 1** : la lecture des heures PAR SURFACE, D-6 close, D-6 et D-8
> migrées. **Passe 2** (11/09, plus bas) : Laurent répond sur les sept fiches
> restantes — **cinq migrent avec leur motif, trois restent ouvertes avec leur
> condition de fermeture**. Un seul fichier, pas de SUMMARY-04 : c'est la même
> passe documentaire vue de la PR.

---

# ⚠ À LIRE EN PREMIER

## 1. La cause racine, et pourquoi cette tâche n'est pas cosmétique

> **Une décision qui n'est pas dans la spec — ou qui y est au mauvais endroit —
> sera défaite de bonne foi par la session suivante.**

C'est le **troisième cas de la semaine**. Le mécanisme exact, cette fois :
**D-6** avait été tranchée par Laurent, mais elle était restée listée dans le
tableau des **décisions restantes**. Une session l'y a lue comme « à trancher »
et en a tiré, de bonne foi, un contre-argument contre une décision déjà prise.
Il a fallu un arbitrage pour le défaire.

La même erreur de rangement touchait **D-8**, dont la cellule disait
pourtant elle-même « ✅ **Tranchée avec D-11** ».

Les deux ont migré. Le tableau des restantes porte maintenant l'avertissement
qui dit **pourquoi** la migration est une règle, pas une préférence de rangement.

## 2. Les trois règles, telles qu'elles sont désormais écrites (D-23, D-25, §7)

1. **Documents contractuels et financeur** — proposition, convention, feuilles
   d'émargement, attestation d'assiduité, dossier financeur : **heures
   conventionnées obligatoires, valeur unique, jamais recalculées.**
2. **Écran de choix de créneau (`/rdv/[token]`)** — **demi-journées + heures sur
   site UNIQUEMENT.** Le participant y lit ce qu'il doit bloquer dans son agenda.
   Les heures conventionnées sont une mécanique de financement (co-animation,
   assiette du financeur) dont le lecteur est le **PAYEUR**, pas l'agent qui
   choisit une matinée.
3. **Partout où le chiffre est montré au client, il ne paraît JAMAIS seul** —
   une phrase avec sa raison : « 4 h sur site animées par 2 formateurs, soit 8 h
   conventionnées prises en charge par votre financeur. »

Daté du **11/09/2026**, commit déclencheur **`267f401`** nommé, motif de
l'arbitrage écrit : la ligne rouge du **§8.1 NOMME ses surfaces**, et l'écran
d'inscription n'en fait pas partie.

## 3. D-6 est CLOSE — avec sa source, et on ne la rouvre jamais

**Réponse : 8 h**, les heures doublées. **Source** : *« les sessions co-animées
sont déjà remboursées sur des heures doublées ; mes dossiers payés font foi »* —
c'est une réponse **avec sa source**, ce que la fiche exigeait (« une réponse
sans sa source ne vaut rien le jour d'un contrôle »).

Conséquences consignées : `TRAINER_COUNT_DEFAULT = 2` n'est plus un défaut en
attente d'arbitrage mais **la règle** ; la validation par l'expert-comptable et
l'auditeur Qualiopi reste **un confort, plus une condition** (le §8.1 le dit
maintenant, là où il écrivait « à faire valider une fois ») ; **D-26 reste
entière** — déclarer des heures doublées suppose justement que le nombre de
formateurs déclaré soit le vrai.

---

# Le constat FIFPL / indé payeur de lui-même : AUCUN TROU

Vérifié, et repris tel quel : `.planning/specs/2026-09-11-fifpl-individuel.md`
**n'existe pas et n'a pas à exister**. Le cas de l'indépendant qui est son propre
payeur est **déjà couvert**.

`apps/web/src/lib/proposition/templates/proposition-template.ts` rend, **sans
condition**, en **page 3** sous le tableau par payeur :

> « Les N heures conventionnées par participant (X demi-journées de Y h sur site,
> co-animées par Z formateurs) figurent à l'identique sur la convention, les
> feuilles d'émargement, l'attestation d'assiduité et les dossiers financeurs. »

C'est exactement le chiffre **accompagné de sa raison**, et la **liste des
surfaces**. Toute proposition le porte, donc l'indé qui choisit son créneau **et**
signe le lit **avant** la convention. Cette phrase est citée dans D-23 et D-25
comme **le précédent en production** de la règle n°3 — elle existe déjà, il n'y
avait pas à l'inventer.

---

# Passe 2 (PR #61) — Laurent a répondu : CINQ tranchées, TROIS ouvertes

La question posée en fin de passe 1 était, pour chacune des sept fiches restantes :
*est-ce ton arbitrage, ou juste un défaut proposé ?* **Laurent a répondu le
11/09/2026.** Cinq sont des arbitrages — elles ont donc MIGRÉ, avec leur motif.
Trois restent ouvertes, et ce qui les distingue est écrit : **elles attendent des
DONNÉES RÉELLES, pas un avis.**

## Les cinq tranchées — le motif compte autant que la décision

| # | Décision | Motif, tel qu'il est écrit dans la spec |
|---|---|---|
| **D-7** | Plafonds OPCO EP : **2 500 € HT/an** < 11 salariés · **4 500 € HT/an** de 11 à 50 · **fonds conventionnels** au-delà. **Le seed est juste.** | **Ce n'est pas un arbitrage, c'est un FAIT VÉRIFIÉ** — plafonds OPCO EP 2026, branche immobilier, **convention collective IDCC 1527**. Le « ≈ 4 000 € » de la proposition OPTIMO du 11/08 était une **erreur de saisie, pas une source concurrente** : c'est écrit noir sur blanc pour qu'on ne le ressorte plus jamais comme une contradiction à réarbitrer. |
| **D-3** | Un **MANAGER** peut accorder une remise > 15 % du reste à charge. | **Cohérent avec D-8** (nommément référencée) : l'écart AGEFICE de 24 €/agent s'offre d'un clic depuis la proposition. Réserver ce clic à l'ADMIN seul bloquerait en rendez-vous la seule personne qui est devant le client. Garde-fous du §8.3 inchangés. |
| **D-4** | Les devis sont générés **À L'ACCEPTATION** de la proposition. | **Pas de `DEV-NNNN` mort dans la numérotation — elle doit rester propre pour l'audit.** Le client lit le détail chiffré **dans la proposition**, il n'a pas besoin d'un devis pour décider. |
| **D-5** | Validité **30 jours**, relance automatique à **J-5**. | Pas un chiffre rond : un **équilibre entre deux contraintes**. Le **dossier OPCO EP se dépose 1 mois avant le démarrage** ; 30 j laissent au dirigeant le temps de consulter sans rendre le dépôt impossible. |
| **D-10** | Page équipe **v1 = CA N-1 + objectif + forces**, saisis par le commercial. | Les **ratios individuels** (RDV, mandats, exclusifs par agent) sont une **extension du référentiel v2, pas la v1** : trois champs de plus par agent rallongent le R1 — sur une équipe de 8, cela se paie en rendez-vous. |

Chacune porte **11/09/2026** en colonne date, et chacune est rangée à côté de ce
qu'elle concerne : D-7 et D-3 après D-8 (plafonds, puis geste commercial), D-4 et
D-5 après D-16 (cycle de vie de la proposition et du devis), D-10 en fin de
tableau. **Aucune autre décision n'a été tranchée ici, D-6 n'a pas été rouverte,
et `D-19 bis` / `D-19 bis (suite)` n'ont pas été touchées** — ce sont bien deux
lignes distinctes, une fiche et sa continuation, pas un doublon.

## Les trois ouvertes — avec leur CONDITION DE FERMETURE

Le tableau des restantes gagne une quatrième colonne, « **Se ferme quand** ».
C'est elle qui dit pourquoi ces trois-là ne sont pas tranchables aujourd'hui.

| # | Se ferme quand |
|---|---|
| **D-1** — set LÉGER | **Après 2 R1 RÉELS** menés avec le set proposé. Avant d'avoir tenu deux rendez-vous avec ce set, on ne sait ni ce qui manque ni ce qui traîne. |
| **D-2** — benchmarks des ratios | **Avec D-9, pas avant** — même matière, même calibration. Les trancher séparément, c'est calibrer deux fois la même chose et finir par se contredire. |
| **D-9** — barème de scoring | **Se calibre sur 3 audits réels, puis se FIGE et se VERSIONNE.** Et la conséquence qu'on oublie est maintenant **écrite dans la table** : **tant que le barème n'est pas figé, aucun score n'est comparable d'un audit à l'autre** — ni entre deux dossiers, ni dans le temps. |

## D-7 au §8 : un plafond de branche n'est pas une constante de produit

Les chiffres étaient **listés** dans la table des `FundingRule` ; ils sont
surtout **utilisés** au **§8.2**, là où l'algorithme nomme `OPCO_EP_ENVELOPE`
avec ses paliers. C'est donc là que la nuance est écrite, en premier :

> ces paliers sont ceux de la **convention collective DU CLIENT** — **IDCC 1527
> couvre les agences immobilières et les syndics** — donc **hors immobilier, le
> chiffre change**. Le paramètre reste **modifiable dans Paramètres, à dessein** :
> ce n'est pas une constante du produit, c'est une **donnée de branche**.

Un **renvoi court** est aussi posé sur les deux lignes `OPCO_EP_ENVELOPE_LT_11`
et `OPCO_EP_ENVELOPE_11_TO_50` de la table des seeds, plus une note de branche
juste sous la table : **quelqu'un qui lit la table seule ne doit pas y voir une
constante universelle.**

## L'avertissement de tenue du tableau : UN bloc, refondu — pas un second empilé

Un avertissement existait déjà (passe 1). **Il a été refondu, pas doublé** : un
second avertissement empilé aurait été exactement le défaut que la règle dénonce.
Il porte maintenant la formulation de Laurent :

> Une décision tranchée **quitte la table des restantes LE JOUR** où elle est
> tranchée. Le défaut du 11/09 n'était **pas** qu'une décision manquait par
> écrit : c'est qu'une décision **réglée était restée rangée avec les questions
> ouvertes** — lisible, et trompeuse. **Le remède est le déplacement, pas
> l'écriture.**

L'incident **D-6/D-8** reste en illustration, la précision « la seconde colonne
porte un défaut proposé, jamais un arbitrage » est conservée, et un dernier
paragraphe dit ce qui distingue les trois lignes restantes : **des données
réelles, pas un avis**, d'où la colonne de fermeture.

---

# Trois références de l'arbitrage d'origine étaient inexactes

Relevées et corrigées avant d'écrire. Elles illustrent la leçon du jour.

1. **« la spec s'arrête à D-10 » — FAUX.** Le tableau des TRANCHÉES portait déjà
   **D-11 à D-29**, y compris D-19 bis/ter et D-25 bis. **Rien à ajouter de D-11
   à D-27.** Le vrai défaut était l'**inverse** : deux décisions *closes* étaient
   restées dans les *restantes* — et c'est ce défaut-là qui a causé l'incident.
2. **« la ligne rouge, ligne 424 » — MAUVAISE RÉFÉRENCE.** La ligne 424 parle des
   liens de rayons du catalogue. La ligne rouge vit dans le **§8.1, « La règle de
   tarification Start Academy »**. Le raisonnement de Laurent était **exact** —
   cette ligne nomme bien ses cinq surfaces — seul le numéro était faux. D'où la
   règle d'écriture appliquée partout ici : **on nomme la section ou la décision,
   jamais un numéro de ligne**, parce qu'un numéro périme au premier paragraphe
   ajouté.
3. **`.planning/specs/2026-09-11-fifpl-individuel.md` n'existe pas.** Ni cherché,
   ni créé. La question de fond était bonne et le constat est ci-dessus : aucun
   trou.

---

# Ce qui a changé, fichier par fichier

## `.planning/specs/2026-09-01-chaine-diagnostic-proposition.md`

- **§7.1** — la phrase qui décrivait l'écran `/rdv` disait « Chaque date affiche
  ses demi-journées, ses heures sur site et ses heures conventionnées ». Elle
  contredisait le code depuis `267f401`. Elle distingue désormais **ADMIN** (les
  trois valeurs) et **PARTICIPANT** (demi-journées + heures sur site, et rien
  d'autre), et rappelle que la ligne rouge n'en est pas entamée.
- **§7.2** — la règle « aucun nombre d'heures sans dire lequel il est » (D-25)
  nomme les deux lectures : admin « 36 h sur site · 72 h conventionnées »,
  participant « 36 h sur site ». Jamais « 36 h » nu, ni sur l'un ni sur l'autre.
- **§8.1** — la ligne rouge est **intacte, mot pour mot**. Seule la phrase de fin
  bouge : la validation par l'expert-comptable/l'auditeur n'est plus présentée
  comme une condition, puisque D-6 est close. C'était le crochet parfait pour
  rouvrir D-6 de bonne foi.
- **D-23** et **D-25** — trois règles par surface, datées du 11/09/2026, commit
  `267f401` nommé, motif écrit. **Tout le reste est conservé** : arrondi au plus
  proche avec plancher à 1, `Europe/Paris`, `durationHours` = heures
  conventionnées, preuve Faros FRM-0004..0007, ×2 = règle de tarification, la
  convention ne nomme pas deux formateurs.
- **D-25 bis** — ne dit plus « D-6 doit trancher » ni « sa question est dans le
  tableau des restantes » (deux affirmations devenues fausses) : D-6 est close et
  vit juste en dessous.
- **D-6** et **D-8** — migrées dans les TRANCHÉES, insérées là où c'est lisible :
  D-8 juste après D-11 (elle est tranchée **avec** elle), D-6 juste après D-25 bis
  (même sujet, et D-25 bis y renvoie).
- **Tableau des restantes** — avertissement de migration en tête, avec l'incident
  du 11/09 comme motif, et la précision que la seconde colonne porte un **défaut
  proposé, jamais un arbitrage**.

**Passe 2 — même fichier :**

- **D-7, D-3, D-4, D-5, D-10** — migrées dans les TRANCHÉES avec leur **motif** et
  la date du **11/09/2026**, chacune rangée à côté de ce qu'elle concerne (D-7 et
  D-3 après D-8 ; D-4 et D-5 après D-16 ; D-10 en fin de tableau).
- **§8.2** — nouveau paragraphe ⚠ **Nuance conventionnelle (D-7)** placé juste
  après le pseudo-code, **là où l'algorithme nomme `OPCO_EP_ENVELOPE` avec ses
  paliers** : plafonds de la convention collective du client, **IDCC 1527**
  (agences et syndics), chiffre différent hors immobilier, paramètre modifiable à
  dessein. Le paragraphe ⚠ « Nuance moteur (D-8) » juste au-dessus est intact.
- **Table des seeds `FundingRule` (§4)** — les deux lignes `OPCO_EP_ENVELOPE_LT_11`
  et `OPCO_EP_ENVELOPE_11_TO_50` portent le renvoi « **palier de convention
  collective, IDCC 1527, cf. D-7** », et une **note de branche** courte est posée
  sous la table, au-dessus de la note de réconciliation AGEFICE (inchangée).
- **Tableau des restantes** — quatrième colonne « **Se ferme quand** », trois
  lignes restantes (D-1, D-2, D-9), et l'avertissement **refondu en un seul bloc**
  avec la formulation de Laurent.
- **Non touché, volontairement** : la ligne rouge du §8.1 (intacte au mot), D-6,
  `D-19 bis` et `D-19 bis (suite)` — deux lignes distinctes, pas un doublon.

## `apps/web/src/lib/campagne/creneaux.ts` — commentaire seul

Il invoquait « **règle gravée n°2** », pointeur qui ne renvoie à **rien** dans ce
dépôt (l'expression ne figure nulle part ailleurs que dans un test et dans D-25,
elle vient du PRD proposition v2). Il renvoie maintenant au **§8.1 (ligne rouge
de cohérence)** et à **D-23 / D-25**, et énonce les **trois surfaces**.

Vérifié exact vis-à-vis du code :

| Fonction | Surface | Heures conventionnées ? |
|---|---|---|
| `decrireCreneau` | admin — fiche campagne, formulaire de création | **oui** |
| `decrireDureeProduit` | admin — durée du produit | **oui** |
| `decrireCreneauParticipant` | participant — `/rdv/[token]` | non |
| `decrireDureeProduitParticipant` | participant — durée du produit | non |

## `apps/web/src/app/rdv/[token]/page.tsx` — commentaire seul

Même pointeur mort (« règle n°2 ») dans le commentaire au-dessus de la durée du
produit. Il nomme désormais le §8.1, ses cinq surfaces et D-23/D-25.


## `apps/web/src/lib/campagne/__tests__/creneaux.test.ts` — commentaire seul (passe 2)

Le dernier pointeur mort de la famille. Le bloc de commentaire au-dessus de
`describe('decrireDureeProduit …')` disait « **la règle gravée n°2** impose que ce
soit LA valeur unique » — une expression qui vient du PRD proposition v2 et ne
renvoie à rien dans cette spec. Il nomme désormais la **ligne rouge de cohérence
du §8.1** et **D-23 / D-25**, comme les deux pointeurs corrigés en passe 1, et
redit la règle d'écriture : on nomme la section et la décision, jamais un numéro
de ligne.

⛔ **Commentaire SEUL.** Vérifié au `git diff` : **4 lignes de commentaire
ajoutées, 1 retirée, rien d'autre**. Aucune assertion, aucun `expect`, aucun nom
de test, aucune valeur attendue. Le compte de tests est resté à **3155**.

---

# Mis de côté (volontairement)

- **D-1, D-2, D-9** : non tranchées — elles attendent des données réelles, et
  chacune porte désormais sa condition de fermeture (ci-dessus).
- **Aucun revert de `267f401`**, aucun fichier de spec FIFPL, aucune signature ni
  comportement modifiés. **Aucune ligne de code de production sur les deux
  passes** — les trois fichiers TypeScript touchés ne l'ont été qu'en commentaire.
- **Hors périmètre, relevé sans y toucher** : « règle gravée n°7 » vit encore dans
  `apps/web/src/lib/proposition/module-matcher.ts` (l. 22 et 260) et « règle
  gravée n°2 » dans `packages/db/prisma/seed-demo.ts` (l. 230). Même famille de
  pointeur, autre règle et autre fichier : à reprendre au prochain passage sur
  ces fichiers, pas en pleine passe documentaire.

**Le dernier pointeur mort de la famille « règle n°2 » est en revanche CORRIGÉ**
en passe 2 : voir ci-dessous.

---

# Gates

| Gate | Résultat |
|---|---|
| `pnpm lint` | **0 erreur** (2 warnings préexistants : `parametres/page.tsx` alt-text, `use-autosave.ts` exhaustive-deps) |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | **0 erreur** |
| `pnpm test` | **3155 passés / 2 ignorés** — 202 shared + 179 db + 2774 web. Compte **inchangé**, comme attendu d'une tâche documentaire. |

---

# Commits

| # | Commit | Sujet |
|---|---|---|
| 1 | `8356ada8` | `docs(chaine-diagnostic)` — le §7 lit les heures par surface, pas « partout » |
| 2 | `68046fda` | `docs(chaine-diagnostic)` — D-23 et D-25 énoncent trois règles PAR SURFACE |
| 3 | `e5dbba2b` | `docs(chaine-diagnostic)` — D-6 et D-8 rejoignent les TRANCHÉES, et on dit pourquoi |
| 4 | `6fff38e1` | `docs(rdv)` — le commentaire des créneaux nomme ses trois surfaces, plus « règle n°2 » |
| 5 | `87763db3` | `docs(260911-kwf)` — compte rendu + STATE.md |

**Passe 2 :**

| # | Commit | Sujet |
|---|---|---|
| 6 | `ade806b5` | `docs(spec)` — cinq décisions tranchées rejoignent les TRANCHÉES, avec leur motif |
| 7 | `885e3b53` | `docs(spec)` — les plafonds OPCO EP sont une donnée de branche, pas une constante |
| 8 | `36b180a5` | `docs(spec)` — D-1, D-2 et D-9 restent ouvertes, avec leur condition de fermeture |
| 9 | `bf9d16bb` | `docs(campagne)` — le dernier « règle gravée n°2 » nomme enfin le §8.1 et D-23/D-25 |
| 10 | _celui-ci_ | `docs(260911-kwf)` — compte rendu complété + STATE.md |

Branche `docs/260911-decisions-par-surface`, **poussée en passe 1 (PR #61
ouverte), non fusionnée**. Les commits de passe 2 **ne sont pas poussés** — c'est
Laurent qui s'en charge.

---

## Self-Check: PASSED

- Fichiers annoncés : tous présents (spec, `creneaux.ts`, `rdv/[token]/page.tsx`,
  `STATE.md`, ce compte rendu).
- Commits annoncés : `8356ada8`, `68046fda`, `e5dbba2b`, `6fff38e1` retrouvés
  dans l'historique.
- Citation de `proposition-template.ts` relue dans le fichier, rendue sans
  condition en page 3 (`pageDetailAndSteps`).
- Pointeur mort restant confirmé en passe 1 : `creneaux.test.ts:224`, non touché
  à dessein **à l'époque** — **corrigé en passe 2**, commentaire seul.

**Passe 2 :**

- Les cinq fiches **D-3, D-4, D-5, D-7, D-10** relues dans le tableau des
  TRANCHÉES ; le tableau des restantes ne porte plus que **D-1, D-2, D-9**, avec
  leur colonne « Se ferme quand ».
- **Un seul** avertissement en tête du tableau des restantes (vérifié : aucune
  seconde occurrence de « Une décision tranchée » dans le fichier).
- `D-19 bis` et `D-19 bis (suite)` présentes et **inchangées** ; la ligne rouge du
  §8.1 **inchangée au mot** ; D-6 non rouverte.
- `git diff` du test : **4 lignes de commentaire ajoutées, 1 retirée**, aucune
  autre ligne.
- Commits retrouvés dans l'historique : `ade806b5`, `885e3b53`, `36b180a5`,
  `bf9d16bb`.
- Gates rejouées après le dernier changement de code : **lint 0 · tsc 0 · 3155
  passés / 2 ignorés** (202 shared + 179 db + 2774 web).

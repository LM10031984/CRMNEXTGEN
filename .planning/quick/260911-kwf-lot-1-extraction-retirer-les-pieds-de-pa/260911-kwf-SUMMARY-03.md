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
  - "l'avertissement de MIGRATION en tête du tableau des décisions restantes"
  - "creneaux.ts : le commentaire renvoie au §8.1 et à D-23/D-25, plus à « règle n°2 »"
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
    - .planning/STATE.md
decisions:
  - "Le commit 267f401 est CONSERVÉ, pas reverté : la ligne rouge du §8.1 nomme ses cinq surfaces, et l'écran d'inscription n'en fait pas partie."
  - "Le lecteur des heures conventionnées est le PAYEUR, qui les reçoit expliquées dans la proposition avant la convention."
  - "D-6 CLOSE le 11/09/2026 : le dossier se déclare en 8 h. Source : les sessions co-animées sont déjà remboursées sur des heures doublées, les dossiers payés de Laurent font foi. Ne JAMAIS la rouvrir."
  - "D-8 rejoint les TRANCHÉES : sa propre cellule disait « ✅ tranchée avec D-11 »."
  - "Une décision tranchée migre le jour même vers le tableau du dessus — c'est la cause racine de l'incident du 11/09, troisième cas de la semaine."
  - "D-1..D-5, D-7, D-9, D-10 NON tranchées : leur seconde colonne est un défaut PROPOSÉ, pas un arbitrage. À confirmer par Laurent."
metrics:
  duration: "~50 min"
  tasks: 4
  commits: 5
  tests_added: 0
  completed: "2026-09-11"
---

# Quick 260911-kwf-03 — La lecture des heures se règle PAR SURFACE, et la décision vit dans la spec

Documentation seule, plus deux commentaires. **Aucun comportement, aucune
signature, aucun test touchés** — le commit `267f401` est conservé tel quel.

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

# À CONFIRMER PAR LAURENT — arbitrage ou défaut proposé ?

Sept fiches restent dans le tableau des **décisions restantes**. Leur seconde
colonne s'intitule « Défaut proposé » : ce qui y est écrit est une **proposition
de l'outil**, pas forcément une décision. **Aucune n'a été tranchée ici** — la
question à Laurent est, pour chacune : *est-ce ton arbitrage, ou juste un défaut
proposé ?*

| # | Question | Ce qui est écrit comme défaut |
|---|---|---|
| D-1 | Composition exacte du set LÉGER (§6.2) | la liste proposée, ajustée après 2 RDV réels |
| D-2 | Benchmarks initiaux des ratios (seuils d'alerte) | valeurs du référentiel v1.0 du repo diag |
| D-3 | Qui peut créer une remise > 15 % (MANAGER, ou ADMIN seul ?) | MANAGER |
| D-4 | Devis générés à l'envoi de la proposition ou à l'acceptation ? | à l'acceptation |
| D-5 | Durée de validité par défaut (30 j ?) et relance à J-5 | 30 j |
| D-7 | OPCO EP : 4 500 € (dit le 01/09) vs ≈ 4 000 € (proposition OPTIMO du 11/08) | 4 500 en seed, modifiable dans Paramètres |
| D-9 | Barème de scoring (pondérations → score chapitre → score global) | barème v1 avec le lot D, calibré sur 3 audits puis figé |
| D-10 | Page équipe : champs d'activité par agent en plus du CA N-1 ? | v1 CA N-1 + objectif + forces — ⚠ celle-ci porte déjà « **règle VALIDÉE par Laurent le 03/09/2026** » dans sa cellule : elle est probablement à migrer aussi, à confirmer |

**D-10 mérite un regard à part** : sa cellule contient « ✅ Règle VALIDÉE par
Laurent le 03/09/2026, telle quelle ». Si c'est bien un arbitrage, elle a le même
défaut de rangement que D-6 et D-8 — elle n'a pas été déplacée ici par prudence,
parce que la validation porte sur une *partie* de la fiche (le complément du
03/09) et non visiblement sur la question d'origine.

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

---

# Mis de côté (volontairement)

- **`apps/web/src/lib/campagne/__tests__/creneaux.test.ts` ligne ~224** porte
  encore « la règle gravée n°2 » en commentaire. **Non touché** : la consigne
  était de ne modifier aucun test. C'est le dernier pointeur mort de cette
  famille dans le dépôt ; à reprendre au prochain passage sur ce fichier.
- **D-1..D-5, D-7, D-9, D-10** : non tranchées (voir le tableau ci-dessus).
- **Aucun revert de `267f401`**, aucun fichier de spec FIFPL, aucune signature
  ni comportement modifiés.

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
| 5 | _celui-ci_ | `docs(260911-kwf)` — compte rendu + STATE.md |

Branche `docs/260911-decisions-par-surface`, **non poussée, non fusionnée** —
c'est Laurent qui s'en charge.

---

## Self-Check: PASSED

- Fichiers annoncés : tous présents (spec, `creneaux.ts`, `rdv/[token]/page.tsx`,
  `STATE.md`, ce compte rendu).
- Commits annoncés : `8356ada8`, `68046fda`, `e5dbba2b`, `6fff38e1` retrouvés
  dans l'historique.
- Citation de `proposition-template.ts` relue dans le fichier, rendue sans
  condition en page 3 (`pageDetailAndSteps`).
- Pointeur mort restant confirmé : `creneaux.test.ts:224`, non touché à dessein.

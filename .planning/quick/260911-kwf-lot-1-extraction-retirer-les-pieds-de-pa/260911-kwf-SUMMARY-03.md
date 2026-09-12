---
quick_id: 260911-kwf
phase: quick-260911-kwf
plan: "03"
slug: decisions-par-surface
branch: docs/260911-decisions-par-surface
subsystem: spec-chaine-diagnostic
tags: [spec, decisions, heures-conventionnees, qualiopi, financeur, rdv, documentation, codes-produits, import-smartof, provenance, releve-prod]
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
  - "STATE.md : le relevé de prod est NOMMÉ — date et heure, 41 codes en clair, la commande qui les reproduit, les titres des deux routes"
  - "la règle de relevé : un compte sans liste ne répond à aucune question de différence"
  - "import-smartof.ts : un code FABRIQUÉ suit la série PROD-NNNN, plus jamais un fragment hexadécimal d'UID"
  - "scripts/lib/product-code.ts : la règle de provenance isolée et testable sans jouer l'import"
  - "8 tests de contrat sur la PROVENANCE (pas sur le format), dont 5 prouvés RED avant correctif"
  - "crud-edits.ts : le constat « PROD-00661 se lit 661 » consigné en commentaire, comportement inchangé"
  - "D-18 reçoit sa réponse : pas un défaut de moteur, un produit diffusable qui n'aurait pas dû l'être"
  - "D-19 ter reçoit son premier usage réel : PROD-00661 écarté des sorties client, maintenu au catalogue public"
affects:
  - ".planning/specs/2026-09-01-chaine-diagnostic-proposition.md"
  - "apps/web/src/lib/campagne/creneaux.ts"
  - "apps/web/src/app/rdv/[token]/page.tsx"
  - ".planning/STATE.md"
  - "packages/db/scripts/import-smartof.ts"
  - "packages/db/scripts/lib/product-code.ts"
  - "apps/web/src/server/actions/crud-edits.ts"
tech-stack:
  added: []
  patterns:
    - "une décision tranchée MIGRE vers le tableau des TRANCHÉES le jour même — y laisser une décision close la rend fausse"
    - "un relevé de référence porte sa date, sa commande et sa LISTE — un total ne répond à aucune question de différence"
    - "garde de PROVENANCE plutôt que contrainte de format : venu du fichier source → verbatim, fabriqué par nous → série maison"
    - "un identifiant qui a servi ne se réécrit pas — l'anti-vidage appliqué aux identifiants"
    - "un constat qu'on ne peut pas corriger s'écrit à côté du code concerné, pas seulement dans un compte rendu"
    - "jamais de pointeur « ligne NNN » dans un texte durable : nommer la section (§8.1) ou la décision (D-23)"
    - "une règle d'affichage s'énonce PAR SURFACE, avec son lecteur — pas « partout »"
key-files:
  created:
    - .planning/quick/260911-kwf-lot-1-extraction-retirer-les-pieds-de-pa/260911-kwf-SUMMARY-03.md
    - packages/db/scripts/lib/product-code.ts
    - packages/db/scripts/__tests__/product-code.test.ts
  modified:
    - .planning/specs/2026-09-01-chaine-diagnostic-proposition.md
    - apps/web/src/lib/campagne/creneaux.ts
    - apps/web/src/app/rdv/[token]/page.tsx
    - apps/web/src/lib/campagne/__tests__/creneaux.test.ts
    - .planning/STATE.md
    - packages/db/scripts/import-smartof.ts
    - apps/web/src/server/actions/crud-edits.ts
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
  - "Passe 3, 12/09/2026 — Le relevé de prod est NOMMÉ : 41 codes en clair, la date et l'heure, la commande qui les reproduit. L'ancien « 32 codes PROD- » comptait les PRÉFIXES (il manquait les 7 FRM-*) et notait un compte sans la liste — d'où le « 32 → 34 » lu comme deux créations alors qu'aucun produit n'avait été créé. Règle : un relevé qui note un compte sans noter la liste ne peut répondre à aucune question de différence."
  - "Passe 3 — La garde sur les codes produits porte sur la PROVENANCE, pas sur le format : l'hétérogénéité est VOULUE (le Custom ID est la référence qui remonte au dossier SmartOF, un CHECK rejetterait FRM-0001 ou PROD-00661). Venu du fichier source → verbatim ; fabriqué par nous → série PROD-NNNN. Le repli hexadécimal de import-smartof.ts:415 disparaît."
  - "Passe 3 — Aucun code existant réécrit, aucune migration, aucune écriture en base. Les 4 PROD-xxxxxxxx restent : un identifiant qui a servi ne se réécrit pas."
  - "Passe 3 — Le séquenceur lit PROD-00661 comme 661 : consigné en commentaire dans crud-edits.ts et dans STATE.md, comportement INCHANGÉ (rien ne casse, max à 675 + boucle de garde)."
  - "Passe 3 — D-18 a sa réponse : pas un défaut de moteur, un produit diffusable qui n'aurait pas dû l'être (PROD-00661). Arbitrage Laurent : excludedFromClientOutputs = true, premier usage réel de D-19 ter — plus jamais proposé, mais maintenu au catalogue public parce qu'une session réelle a eu lieu. DÉCISION CONSIGNÉE, PAS APPLIQUÉE."
  - "Passe 3 — import-from-smartof.ts:695 porte le même défaut, NON corrigé : non nommé par Laurent, en attente d'arbitrage. sync-smartof-1208.ts:1019 intouchable (one-shot daté déjà joué)."
metrics:
  duration: "~50 min (passe 1) + ~40 min (passe 2) + ~45 min (passe 3)"
  tasks: 14
  commits: 16
  tests_added: 8
  completed: "2026-09-12"
---

# Quick 260911-kwf-03 — La lecture des heures se règle PAR SURFACE, et la décision vit dans la spec

Documentation seule, plus trois commentaires. **Aucun comportement, aucune
signature, aucune assertion de test touchés** — le commit `267f401` est conservé
tel quel.

> **Ce compte rendu couvre TROIS passes de la même branche** (`docs/260911-decisions-par-surface`,
> PR #61). **Passe 1** : la lecture des heures PAR SURFACE, D-6 close, D-6 et D-8
> migrées. **Passe 2** (11/09, plus bas) : Laurent répond sur les sept fiches
> restantes — **cinq migrent avec leur motif, trois restent ouvertes avec leur
> condition de fermeture**. **Passe 3** (12/09, tout en bas) : les **codes
> produits** — le relevé de prod nommé, la garde de provenance à l'import, et
> D-18 qui reçoit enfin sa réponse. Un seul fichier, pas de SUMMARY-04 : c'est la
> même branche vue de la PR.
>
> ⚠ **La passe 3 est la seule à toucher du code de production** (une ligne dans
> `import-smartof.ts`, plus un module neuf et son test). Les passes 1 et 2
> n'étaient que documentation et commentaires.

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

# PASSE 3 (12/09/2026) — les codes produits : un relevé qui NOMME, une garde de PROVENANCE

Trois choses, dans cet ordre, parce que c'est l'ordre de la cause : un relevé
faux a fait croire à des créations qui n'existaient pas ; le relevé faux venait
d'un compte sans liste ; et le compte sans liste venait de ce qu'on croyait
connaître la forme des codes.

## 3.1 — L'ancien relevé ne valait rien, et il a coûté

`STATE.md` annonçait, en référence de non-régression avant merge :
« `/catalogue` → 200, **32 codes `PROD-` distincts** ».

**Le vrai compte est 41.** Relevé le **11/09/2026 à 19:58 CEST** sur
`https://qualiof.vercel.app/catalogue` : **34 en `PROD-*` et 7 en `FRM-*`**
(`FRM-0001` à `FRM-0007`, les journées Faros de D-25).

L'écart n'est pas une erreur de comptage. Ce sont **deux défauts de méthode**, et
chacun suffisait à rendre le marqueur inutile :

**① Il comptait les PRÉFIXES, pas les produits.** `grep PROD-` ne voit pas un
code `FRM-*`. Et rien n'impose le préfixe : `packages/db/scripts/import-smartof.ts`
(l. 415) écrit le `Custom ID` source **verbatim**. Un Custom ID qui ne commence
pas par `PROD-` devient donc un code **parfaitement légitime et invisible au
relevé**. Le marqueur mesurait un préfixe en croyant mesurer un catalogue.

**② Il notait un compte sans noter la liste.** C'est le défaut qui a coûté : lu
plus tard contre 34, le « 32 → 34 » a été interprété comme **deux créations de
produits**, alors qu'**aucun produit n'avait été créé**. Avec la liste, la
question se tranchait en une soustraction ; avec le seul total, elle n'était pas
tranchable — par personne, jamais.

> **La règle, et elle vaut pour tout relevé de référence : un relevé qui note un
> compte sans noter la liste ne peut répondre à aucune question de différence.**

`STATE.md` porte désormais la **date et l'heure**, les **titres des deux routes**
(`/diagnostic` → « Diagnostic express — Start Academy » ; `/catalogue` →
« Catalogue formations Start Academy — IA pour conseillers immobiliers »), les
**41 codes en clair**, et la **commande exacte** qui les reproduit. Le badge de
code est un `<span>` en `font-mono`, et **le préfixe n'est pas présumé** :

```bash
curl -s https://qualiof.vercel.app/catalogue \
  | grep -oE '<span class="shrink-0 text-xs font-mono[^"]*">[^<]+</span>' \
  | sed -E 's/.*">([^<]+)<.*/\1/' | sort -u
```

Elle rend 41 lignes. `wc -l` pour le compte, **la liste pour la différence**.
Trois marqueurs indépendants concordent sur 41 : les badges de code, les sujets
« Devis » distincts, et le relevé lui-même.

## 3.2 — La garde porte sur la PROVENANCE, pas sur le format

Première intuition, écartée par Laurent : contraindre le format des codes (un
`CHECK` en base, une normalisation à l'import). **Elle était fausse, et il s'est
corrigé explicitement — l'hétérogénéité est VOULUE.**

Le `Custom ID` SmartOF **est** la référence d'origine : c'est elle qui permet de
remonter au dossier source. Une contrainte de format rejetterait `FRM-0001`,
`PROD-047`, `PROD-00661` — tous réels, tous légitimes, tous porteurs de
traçabilité. Une garde de format aurait détruit exactement ce qu'on voulait
protéger.

**La frontière se trace sur la provenance :**

| Provenance du code | Règle | Pourquoi |
|---|---|---|
| **Fichier source** (`Custom ID` présent) | **VERBATIM**, quelle que soit la forme | C'est la traçabilité SmartOF. La forme n'est pas notre affaire |
| **Nous** (`Custom ID` absent) | **Série `PROD-NNNN`** | C'est notre numérotation, les trois autres sites qui fabriquent des codes la suivent déjà |

Le repli `` `PROD-${uid.substring(0, 8)}` `` de `import-smartof.ts:415`
disparaît donc au profit du prochain `PROD-NNNN` libre. Ce qu'il coûtait :

- `PROD-7a78c8b2` ne se lit pas, ne se dicte pas au téléphone, ne se cherche pas
  de mémoire ;
- et surtout il est **invisible au séquenceur**, qui ne lit que
  `/^PROD-0*(\d+)$/`. **Un code fabriqué hors série ne fait pas avancer la
  série** : il s'accumule à côté, et le prochain numéro se calcule comme s'il
  n'existait pas.

L'alignement est repris des sites existants, **rien n'a été réinventé** : lecture
du maximum en `/^PROD-0*(\d+)$/` comme `crud-edits.ts` (~l. 823),
`padStart(4, '0')` et vérification d'existence avant écriture comme
`import-diag-catalog.ts` (~l. 217). L'appelant fournit les codes déjà pris —
**ceux de la base ET ceux alloués pendant le même run**, sans quoi deux lignes
sans `Custom ID` réclameraient le même numéro.

### Pourquoi la règle sort dans un module à elle

`import-smartof.ts` appelle `main()` **au chargement du module**. L'importer
depuis un test lancerait l'import **pour de vrai**, contre la base pointée par
`.env` — c'est-à-dire la production. La règle vit donc dans
`packages/db/scripts/lib/product-code.ts`, testable seule, exactement comme
`lib/corpus-local.ts` l'avait été le 11/09 pour le même motif.

### Le test, et sa preuve de rougeur (quick.md §4 ter)

8 tests, **5 prouvés ROUGES contre le code non corrigé** — lancés avant le
correctif, comptés, et le compte est dans le message du commit `017b94b4` :

```
× FABRIQUE un PROD-NNNN quand la ligne source ne porte pas de Custom ID
    → attendu /^PROD-\d{4,}$/, reçu « PROD-7a78c8b2 »
× continue la série AU-DESSUS du plus grand numéro déjà pris
    → attendu « PROD-0676 », reçu « PROD-7a78c8b2 »
× lit PROD-00661 comme 661, exactement comme le séquenceur de crud-edits.ts
    → attendu « PROD-0662 », reçu « PROD-7a78c8b2 »
× donne deux numéros DISTINCTS à deux lignes sans Custom ID du même run
    → attendu « PROD-0676 », reçu « PROD-7a78c8b2 »
× SAUTE un numéro déjà pris plutôt que de le réécrire
    → attendu « PROD-0677 », reçu « PROD-7a78c8b2 »
```

Les **3 verts** ne sont pas des décorations, ce sont les gardes de
non-régression du verbatim — dont **le discriminant, qui est le cœur du
contrat** : un `Custom ID` qui **RESSEMBLE** à un repli hexadécimal —
`PROD-7a78c8b2`, qui est réellement au catalogue — doit sortir **verbatim**. À la
forme, ce code est indistinguable d'un code fabriqué ; **seule la provenance les
sépare**. Une garde écrite sur le format le rejetterait, et perdrait sa
traçabilité. C'est le test qui interdit de retomber dans l'intuition écartée.

Le test porte aussi les 41 codes du relevé en dur, et **asserte ses prémisses**
plutôt que de les supposer : que `PROD-0675` est bien là, que `PROD-0676` n'y est
pas, que la liste fait bien 41 dont 7 `FRM-*`.

## 3.3 — AUCUN code existant n'est réécrit

> **Un identifiant qui a servi ne se réécrit pas.** C'est l'anti-vidage appliqué
> aux identifiants.

`PROD-00661` porte **une session réellement terminée** ; son attestation, son
émargement et son dossier financeur peuvent porter ce code. Les quatre
`PROD-xxxxxxxx` hérités du repli restent tels quels. **Aucune migration de
données, aucun renommage, aucune suppression, aucune écriture en base.** Le
correctif ne change que ce que l'import **fabriquera**, jamais ce qu'il a déjà
écrit.

## 3.4 — Le séquenceur : consigné, pas corrigé

`crud-edits.ts` (~l. 823) lit `/^PROD-0*(\d+)$/`. Le `0*` fait que **`PROD-00661`
vaut 661**, exactement comme vaudrait `PROD-0661`. Deux codes distincts pour
l'œil, **un seul numéro pour le séquenceur**.

**Rien ne casse aujourd'hui** : le maximum du catalogue est 675 (`PROD-0675`), et
une boucle de garde de 50 essais vérifie l'existence avant d'écrire — donc aucune
collision ne peut produire un écrasement.

**Et ça doit être écrit quand même**, pour une raison qui n'est pas technique :
**le séquenceur et l'œil humain ne lisent pas la même chose.** Le jour où
quelqu'un déduira un numéro d'un code à l'œil — dans un tableur, dans un mail,
dans un dossier financeur — il ne trouvera pas le même que ce code-ci. Un constat
qu'on ne peut pas corriger se range **à côté du code concerné**, pas seulement
dans un compte rendu que personne ne relit en éditant la fonction.

Dit au même endroit : le filtre `startsWith: 'PROD-'` ignore les 7 `FRM-*`. C'est
**correct** — autre espace de noms, autre série — mais ça se dit, sinon le
prochain lecteur y verra un oubli.

⛔ **Commentaire seul, aucun changement de comportement.** Vérifié au `git diff` :
14 lignes ajoutées, **0 retirée**, aucune expression touchée.

## 3.5 — D-18 a sa réponse, et D-19 ter son premier usage réel

D-18 partait d'un symptôme : un programme « pour activité événementielle » qui
remontait sur l'e-réputation d'une agence immobilière. La réponse du 04/09
traitait le **moteur** — des mots-clés qui qualifient, des familles acceptées par
ordre de préférence. Elle était juste. **Elle répondait à côté.**

**Le programme a maintenant un nom** : `PROD-00661` « Communication digitale &
Stratégie marketing pour activité événementielle », **72 h, 3 024 € HT, une
session réellement terminée**. Et nommé, le diagnostic change de nature : ce
n'était **pas un défaut de moteur**, c'était un **produit diffusable qui n'aurait
pas dû l'être**. Aucun réglage lexical ne règle ça — un programme d'événementiel
peut légitimement partager du vocabulaire avec une douleur de communication
digitale. Ce qui manquait n'était pas de la précision, c'était **l'information
que ce programme ne doit pas sortir**.

**Arbitrage de Laurent** : `PROD-00661` passe à
`excludedFromClientOutputs = true` — **premier usage réel de D-19 ter**, posée le
11/09 pour un autre cas.

| Surface | Effet | Pourquoi |
|---|---|---|
| Moteur de reco (audit, proposition) | **plus jamais proposé** | C'est l'interdiction, et elle porte sur le programme **et tous ses modules** |
| Catalogue public `/catalogue` | **il y reste, téléchargeable** | **Une session réelle a eu lieu** : l'auditeur Qualiopi doit pouvoir voir le programme remis à ces stagiaires. Le retirer ferait un trou dans la preuve |

C'est la distinction que D-19 ter rend possible, et elle n'est pas symétrique :
**« ne pas proposer » n'est pas « ne pas montrer »**. La colonne
`excludedFromClientOutputs` compte donc **2** produits depuis le 12/09 :
`PROD-0681` (v0.9 non livrable) et `PROD-00661` (hors domaine, session réelle).

### ⛔ La commande qui l'appliquerait — NON EXÉCUTÉE, elle attend Laurent

**Aucune écriture n'a été faite, ni en prod, ni en local.** La décision est
consignée dans la spec ; voici le geste qui l'appliquerait, `update` ciblé sur le
code, **scopé `tenantId`** :

⚠ **NON EXÉCUTÉE.** Écrire le script dans le bac à sable, pas dans le dépôt —
ce n'est pas du code à garder, c'est un geste à tracer :

```ts
// /tmp/appliquer-d19ter-prod00661.ts  — ⚠ NON EXÉCUTÉ, attend Laurent.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const tenant = await prisma.tenant.findFirst({
  where: { name: process.env.TENANT_DEFAULT_NAME ?? 'Start Academy' },
  select: { id: true, name: true },
});
if (!tenant) throw new Error('Tenant introuvable — lancer le seed.');

// Scopé { tenantId, code } — jamais un `update` sur un `id` recopié à la main.
const r = await prisma.trainingProduct.updateMany({
  where: { tenantId: tenant.id, code: 'PROD-00661' },
  data: { excludedFromClientOutputs: true },
});

console.log(`tenant ${tenant.name} — lignes touchées : ${r.count}`); // attendu : 1
await prisma.$disconnect();
```

```bash
# Base LOCALE (qualiof_dev) : `.env.local` est chargé AVANT `.env`, comme les
# scripts `:local` du dépôt. ⚠ NON EXÉCUTÉE.
pnpm --filter @qualiof/db exec dotenv -e ../../.env.local -e ../../.env -- \
  tsx /tmp/appliquer-d19ter-prod00661.ts
```

Trois précautions qui font partie de la commande, pas de son confort :

1. **`updateMany` scopé `{ tenantId, code }`**, jamais un `update` sur un `id`
   recopié à la main : un `id` collé depuis un écran est la porte ouverte au
   mauvais tenant.
2. **`r.count` doit valoir exactement 1.** `0` = le code n'existe pas dans cette
   base (typiquement : lancé en local alors que le produit n'y est pas) ; `2` =
   un doublon de code, qui serait une découverte à traiter avant d'écrire.
3. **Une écriture en PROD est un geste séparé et délibéré.** La règle du dépôt
   est de ne jamais pointer une commande Prisma sur le `DATABASE_URL` du `.env`
   — il pointe la production Supabase (quick.md §4, STATE.md point 1). Porter
   cette décision en prod se décide avec Laurent, et **pas avant** que le
   programme composé de DIAG-0001 ait été relu — même ordre que pour le
   versement de la bibliothèque.

## 3.6 — Signalé, NON corrigé : le même défaut vit ailleurs

| Site | Ligne | Statut | Motif |
|---|---|---|---|
| `packages/db/scripts/import-smartof.ts` | 415 | ✅ **corrigé** | nommé par Laurent |
| `apps/web/scripts/import-from-smartof.ts` | 695 | ⚠ **NON corrigé — à arbitrer** | `p.customId?.trim()` ou, à défaut, le même hachage de 8 caractères d'UID — **exactement le même défaut**, même conséquence. Laurent ne l'a pas nommé : il n'est pas corrigé, il est signalé. Le correctif y serait mécanique (le module `lib/product-code.ts` existe désormais), mais c'est un script d'import en base : ça s'arbitre, ça ne se décide pas en passant |
| `apps/web/scripts/sync-smartof-1208.ts` | 1019 | ⛔ **intouchable** | `PROD-${productUid.slice(0, 8)}`, **sans condition** — toujours hexadécimal. C'est le one-shot daté du 12/08, **déjà joué**. Le réécrire falsifierait son rapport : un script one-shot est une archive de ce qui s'est passé, pas du code vivant |

⚠ **Conséquence pratique à garder en tête** : tant que
`import-from-smartof.ts:695` n'est pas arbitré, **un import lancé par ce
chemin-là peut encore fabriquer un `PROD-xxxxxxxx`**. Le correctif de la passe 3
ne couvre que `packages/db`.

---

# Gates

| Gate | Résultat |
|---|---|
| `pnpm lint` | **0 erreur** (2 warnings préexistants : `parametres/page.tsx` alt-text, `use-autosave.ts` exhaustive-deps) |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | **0 erreur** |
| `pnpm test` | **3155 passés / 2 ignorés** — 202 shared + 179 db + 2774 web. Compte **inchangé**, comme attendu d'une tâche documentaire. |

**Passe 3** (12/09, après le dernier changement de code) :

| Gate | Résultat |
|---|---|
| `pnpm lint` | **0 erreur** (les 2 mêmes warnings préexistants, inchangés) |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | **0 erreur** |
| `pnpm test` | **3163 passés / 2 ignorés** — 202 shared + **187 db** + 2774 web |

Le total monte de **3155 → 3163**, soit exactement les **8 tests ajoutés** dans
`packages/db` (179 → 187). **Aucun test existant n'est tombé** : les comptes
`shared` (202) et `web` (2774) sont inchangés au test près.

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
| 10 | `5e3eee02` | `docs(260911-kwf)` — compte rendu de la passe 2 complété + STATE.md |

**Passe 3** — TDD RED → GREEN sur le ②, le reste en documentation :

| # | Commit | Sujet |
|---|---|---|
| 11 | `56947bb3` | `refactor(db)` — le code produit de l'import sort dans une fonction nommée (iso-comportement) |
| 12 | `017b94b4` | `test(db)` — la provenance d'un code produit, **5 tests RED sur 8** |
| 13 | `8db010ce` | `fix(db)` — un code que NOUS fabriquons suit la série, pas un hachage d'UID (**GREEN**) |
| 14 | `b7bbda27` | `docs(web)` — le séquenceur lit `PROD-00661` comme 661, le constat en commentaire |
| 15 | `d6b7c5b2` | `docs(state)` — le relevé de prod est NOMMÉ : 41 codes, en clair, avec sa commande |
| 16 | `37a469e3` | `docs(spec)` — D-18 a sa réponse, et ce n'était pas le moteur |
| 17 | `cfb3659c` | `docs(260911-kwf)` — compte rendu de la passe 3 |
| 18 | _celui-ci_ | `docs(state)` — la passe 3 entre dans le journal Roadmap Evolution |

**Pourquoi trois commits là où un aurait suffi** (11 → 12 → 13) : le commit 11
est une extraction **à iso-comportement**, qui ne fait que rendre la règle
testable sans jouer l'import. C'est ce qui permet au commit 12 de **rougir contre
le code d'origine** — et donc de prouver quelque chose. Écrire le test et le
correctif ensemble aurait rendu la rougeur invérifiable après coup.

Branche `docs/260911-decisions-par-surface`, **PR #61 ouverte, non fusionnée**.
État au 12/09 : `origin` porte les passes 1 **et 2** (jusqu'à `5e3eee02`) ; les
**commits de la passe 3, depuis `56947bb3`, ne sont PAS poussés** — c'est Laurent qui s'en charge.
Rien n'a touché `main` ni la PR #58.

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

**Passe 3 :**

- Fichiers annoncés, tous vérifiés présents sur le disque :
  `packages/db/scripts/lib/product-code.ts`,
  `packages/db/scripts/__tests__/product-code.test.ts`,
  `packages/db/scripts/import-smartof.ts`,
  `apps/web/src/server/actions/crud-edits.ts`, `.planning/STATE.md`,
  `.planning/specs/2026-09-01-chaine-diagnostic-proposition.md`.
- Commits annoncés retrouvés dans l'historique : `56947bb3`, `017b94b4`,
  `8db010ce`, `b7bbda27`, `d6b7c5b2`, `37a469e3`.
- **La rougeur est prouvée, pas affirmée** : `pnpm --filter @qualiof/db test`
  lancé AVANT le correctif → **5 échecs sur 8**, les cinq noms et les cinq
  valeurs reçues sont recopiés au §3.2 et dans le message de `017b94b4`. Lancé
  après → **187 verts**.
- **Aucune écriture en base**, ni prod ni local : `git grep` confirme qu'aucun
  `update`/`updateMany` n'a été ajouté, et la commande `excludedFromClientOutputs`
  vit **uniquement** dans ce compte rendu, en bloc ` ```bash ` marqué « NON
  EXÉCUTÉE ».
- **Aucun identifiant réécrit** : le `git diff` des quatre fichiers de code ne
  contient aucun littéral `PROD-` modifié ; les 41 codes n'apparaissent qu'en
  **données de test** et en **documentation**.
- **Aucune migration Prisma, aucun changement de schéma** : `git diff` sur
  `prisma/migrations/` et `prisma/schema.prisma` entre `5e3eee02` et HEAD est
  **vide**.
- `crud-edits.ts` : **14 lignes de commentaire ajoutées, 0 retirée**, aucune
  expression touchée — le séquenceur se comporte exactement comme avant.
- `apps/web/scripts/import-from-smartof.ts` : **non modifié**, vérifié au
  `git status` — signalé au §3.6 pour arbitrage.
  `apps/web/scripts/sync-smartof-1208.ts` : **non modifié** non plus.
- Le relevé des 41 codes dans `STATE.md` et celui du test sont **la même liste**,
  vérifié au `diff` de deux extractions triées : les 43 littéraux du test = les
  **41 du relevé** + les **2 numéros attendus** (`PROD-0676`, `PROD-0677`), aucun
  écart ailleurs. Le test asserte lui-même le 41 / 34 / 7 (8ᵉ test).
- Gates rejouées après le dernier changement de code : **lint 0 · tsc 0 · 3163
  passés / 2 ignorés** (202 shared + 187 db + 2774 web) = 3155 + 8.

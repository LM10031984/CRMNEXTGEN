---
quick_id: 260911-kwf
phase: quick-260911-kwf
plan: "01"
slug: pieds-de-page-deroules
branch: fix/260911-pieds-de-page-deroules
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - packages/db/scripts/lib/mentions-organisme.ts
  - packages/db/scripts/__tests__/mentions-organisme.test.ts
  - packages/db/scripts/extract-drive-catalog.ts
  - packages/db/scripts/import-drive-catalog.ts
  - packages/db/scripts/data/drive-programmes-catalog.json
  - .planning/STATE.md
requirements:
  - LOT1-01  # aucune mention d'organisme ne subsiste dans un déroulé de module
  - LOT1-02  # la pédagogie voisine (QCM/quiz/satisfaction pédagogiques) survit intacte
  - LOT1-03  # la garde anti-vidage de l'import protège la pédagogie, pas le boilerplate
  - LOT1-04  # STATE.md dit la vérité sur le chemin du dépôt et les worktrees
user_setup: []

must_haves:
  truths:
    - "Le programme composé de DIAG-0001 ne porte plus aucune mention d'organisme sous un module (ni QCM d'évaluation, ni questionnaire de satisfaction/clôture, ni la phrase sur l'expérience des formateurs)."
    - "La section « Modalités d'évaluation » du programme composé porte toujours ses deux lignes légitimes (QCM en fin de formation, questionnaire à chaud puis à froid)."
    - "Les étapes pédagogiques qui parlent d'évaluation, de quiz ou de satisfaction restent mot pour mot dans les déroulés."
    - "Le module faros:SA-ADM-M001#1 « LIVRABLE 001 » sort intact de l'extraction."
    - "Les 4 modules fantômes nés du pied de page sortent avec un déroulé VIDE et un warning qui les nomme, et l'import ne les re-protège pas."
    - "Un vrai déroulé écrit en base par Laurent (drive:047#20, 1540 caractères) reste protégé par la garde de l'import."
    - "Le chiffrage de DIAG-0001 est inchangé : 6 demi-journées, 48 h conventionnées, 8064.00 € HT, Σ devis = Σ proposition au centime."
    - "STATE.md dit que le dépôt vit sous ~/Projects/CRM Next gen, avec 4 worktrees réparés, et ne promet plus ~/dev/crm-next-gen."
  artifacts:
    - path: "packages/db/scripts/lib/mentions-organisme.ts"
      provides: "Le filtre, en fonctions PURES, partagé par l'extraction et l'import"
      contains: "export function estMentionOrganisme"
    - path: "packages/db/scripts/__tests__/mentions-organisme.test.ts"
      provides: "Les 6 familles de preuves exigées (formes retirées, pédagogie préservée, faros intact, modules vidés + warning, garde d'import, idempotence)"
    - path: "packages/db/scripts/data/drive-programmes-catalog.json"
      provides: "L'instantané régénéré — 76 programmes, 402 modules, 101 lignes de pied de page en moins"
  key_links:
    - from: "packages/db/scripts/extract-drive-catalog.ts"
      to: "packages/db/scripts/lib/mentions-organisme.ts"
      via: "retirerMentionsOrganisme() au point de fabrication de contentMd (parseProgramme, ~l.519)"
      pattern: "retirerMentionsOrganisme"
    - from: "packages/db/scripts/import-drive-catalog.ts"
      to: "packages/db/scripts/lib/mentions-organisme.ts"
      via: "doitProtegerLeContenu() en remplacement du calcul ecraserait (~l.444)"
      pattern: "doitProtegerLeContenu"
---

<objective>
Lot 1 du nettoyage de l'extraction Drive : **retirer les pieds de page du gabarit
Qualiopi avalés comme puces dans le `contentMd` des modules**.

Ces lignes ont déjà leur place légitime ailleurs — la section « Modalités
d'évaluation » du programme composé, portée par l'organisme. Dans un déroulé remis
à un financeur, c'est du doublon.

Mesuré sur l'instantané suivi par git (76 programmes, 402 modules, 3218 lignes de
déroulé) : **101 lignes dans 52 modules**, dont 81 en fin de module et 19 en plein
milieu.

Purpose : le programme composé de DIAG-0001 n'est pas remettable tant qu'un déroulé
de module répète les mentions d'organisme.

Output : un module pur partagé, l'extraction et l'import qui s'en servent, un
instantané régénéré et commité (le `git diff` EST la revue), le probe rejoué, et
l'entrée iCloud de STATE.md remise à la vérité du jour.
</objective>

<perimetre_verrouille>
**Ce lot et lui seul.** Interdits absolus (arbitrage Laurent du 11/09/2026) — aucune
tâche de ce plan n'y touche, même partiellement, même « tant qu'on y est » :

- ⛔ **(a) NE PAS normaliser les TITRES de modules** (point final, capitales
  erratiques, longueur). Laurent veut qu'on lui PROPOSE les titres réécrits avant de
  les appliquer → c'est le **lot 2**.
- ⛔ **(b) NE PAS découper les modules-journées** (`BIB-D012`, les 17 programmes en
  `bloc-unique`, ni les 4 modules fantômes de ce lot) → c'est le **lot 3**, le plus
  risqué, à faire en dernier.
- ⛔ **(c) NE PAS écrire de contenu pédagogique manquant** — c'est le chantier de
  Laurent.

**RÈGLE GRAVÉE** : la normalisation se fait à l'**EXTRACTION**, JAMAIS par une
correction en base — sinon elle est à refaire au prochain import (vérifié le 11/09 :
un point final retiré en base est revenu au premier `--apply`).

**PROD INTERDITE** : jamais `import:drive-catalog` ni `import:diag-catalog` sans le
suffixe `:local`. Tout push sur `main` déclenche `prisma migrate deploy` en prod
Supabase → **aucun merge sur main, PR seulement**.

**Branche** : `fix/260911-pieds-de-page-deroules`, déjà créée et active. Ne pas en
changer.
</perimetre_verrouille>

<context>
@CLAUDE.md
@.claude/commands/quick.md
@.claude/commands/chaine-diagnostic.md

@packages/db/scripts/extract-drive-catalog.ts
@packages/db/scripts/import-drive-catalog.ts
@packages/db/vitest.config.ts
</context>

<donnees_mesurees>
Investigation FAITE et mesurée sur les données réelles le 11/09/2026. Ne pas la
refaire ; s'en servir. Les comptes ci-dessous ont été revérifiés sur
`packages/db/scripts/data/drive-programmes-catalog.json` avant d'écrire ce plan.

**À RETIRER — 101 lignes, 52 modules.** Lignes qui sont une mention d'organisme **ET
RIEN D'AUTRE**. Formes exactes relevées, avec leur compte :

| n | forme exacte |
|---|--------------|
| 26 | `Questionnaire de satisfaction et clôture de la formation.` |
| 22 | `QCM évaluation des acquis ;` |
| 19 | `Questionnaire de satisfaction et clôture de la formation` |
| 18 | `QCM d'évaluation des acquis` (apostrophe **DROITE** U+0027) |
| 5 | `QCM évaluation des acquis` |
| 3 | `Tous les formateurs de l’équipe Start-Academy ont minimum 8 années d'expérience dans l'immobilier, notamment dans le domaine de la vente de biens, de formation d'agents et de coaching individuel.` — drive:016#3, drive:034#3, drive:039#3 (le cas « Gérer les objections » / BIB-D034 relevé par Laurent) |
| 2 | `QCM d’évaluation des acquis :` (apostrophe **COURBE** U+2019) |
| 1 | `QCM d’évaluation des acquis.` |
| 1 | `QCM d’évaluation des acquis` |
| 1 | `QCM d’évaluation des acquis et questionnaire de satisfaction.` (les deux familles, zéro pédagogie) |
| 1 | `Questionnaire de satisfaction et clôture de la formation :` |
| 1 | `Questionnaire de satisfaction` (nu) |
| 1 | `QCM final` (bloc de clôture de drive:062#2, entouré de « Clôture de la formation (30 min) » et « Questionnaire de satisfaction ») |

Le filtre doit tolérer : les **deux apostrophes** (`'` U+0027 et `’` U+2019), la
présence ou l'absence de « d' », la **ponctuation finale** (`.` `;` `:` ou rien), les
**espaces surnuméraires**.

**À NE PAS TOUCHER — un motif trop large les détruirait.** Ce sont des ÉTAPES
PÉDAGOGIQUES :

- `Évaluation de fin de session : Mini-questionnaire ou QCM rapide pour valider la compréhension des concepts.`
- `Évaluation de fin de session : QCM ou mini-évaluation pour valider la compréhension des points abordés.`
- `Évaluation de fin de session : Mini-QCM ou auto-évaluation pour valider la compréhension des procédures de déclaration et des obligations TRACFIN.`
- `Évaluation intermédiaire : QCM ou auto-évaluation` · `Évaluation intermédiaire : mini QCM ou étude de cas` · `Évaluation intermédiaire : simulation + mini QCM`
- `Quiz final interactif pour valider les acquis.` · `Quiz express : « Quel est ton profil de prospecteur ? »` · `Quiz interactif.` · `Quiz final.` · `Quiz de validation des connaissances`
- `Feedback personnalisé du formateur` · `Partage des productions + coaching du formateur`
- `Les formateurs proposeront des mises en situation professionnelles sur les techniques de prospection, les discours et la posture ainsi que des échanges sur les pratiques actuelles.` et `Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.` (drive:058#6) — MOYENS PÉDAGOGIQUES, hors des 3 familles de ce lot
- **TOUT le module `faros:SA-ADM-M001#1` « LIVRABLE 001 »** (855 lignes de déroulé) :
  il ENSEIGNE le montage du dossier AGEFICE/CFP, donc il parle légitimement
  d'attestation, d'émargement, du « nom du formateur ». Un filtre sur « attestation »
  ou « formateur » y détruirait le contenu réel. **Test explicite exigé : il sort
  intact.**
- `Remise des attestations` · `Remise des attestations de formation` · `Remise de l’attestation.` — mentions d'organisme probables mais **HORS des 3 familles nommées par Laurent**. Les LAISSER et les SIGNALER dans le compte rendu.

**3 LIGNES MIXTES — à LAISSER et à SIGNALER.** La mention y est soudée à de la
pédagogie dans la même phrase ; retirer la ligne entière détruirait du contenu, la
réécrire serait un arbitrage que Laurent n'a pas donné (il a dit : suppression pure,
aucun arbitrage nécessaire) :

- drive:024#11 et drive:028#6 : `Clôture et questionnaire de satisfaction. Feedback et Questions/Réponses` (×2)
- drive:055#10 : `Clôture de la formation : Résumé des points clés, remise des certificats de formation et évaluation de la satisfaction des participants.`

Aucun de ces 3 modules n'est au parcours de DIAG-0001 → le critère de fin reste
atteignable.

**LE PIÈGE VÉRIFIÉ, à traiter sinon le lot ne ferme pas.** Quatre modules n'ont QUE
les 2 lignes de pied de page comme déroulé → après filtrage leur `contentMd` est
**VIDE** : `drive:010#2`, `drive:014#4`, `drive:027#2`, `drive:038#3` (tous en
`parsePattern: 'liste-imbriquee'`, contenu vérifié identique, à la ligne près :
`- QCM évaluation des acquis ;` puis
`- Questionnaire de satisfaction et clôture de la formation.`).
Ce sont des modules FANTÔMES nés du pied de page : leur titre est en réalité le
dernier objectif de la liste précédente. **Le découpage est le lot 3 — NE PAS le
corriger ici.**

Or `import-drive-catalog.ts` (~l.444) porte la règle « un import ne VIDE jamais un
contenu écrit », calculée ainsi aujourd'hui : `ecraserait` est vrai quand le
`contentMd` en base est non vide et que le `contentMd` entrant est vide. Elle
garderait en base le pied de page, et le critère de fin échouerait après import — du
garbage protégeant du garbage.

**Correctif juste et minimal : cette protection protège la PÉDAGOGIE, pas le
boilerplate.** Si le contenu actuellement en base, passé par le même filtre, ne
laisse rien, il n'y a **rien à protéger** → laisser l'écriture passer. On ne réécrit
PAS la base à la main, on ne normalise pas en base : **on décide si la garde
s'applique.**

**Non-régression OBLIGATOIRE** : un vrai déroulé écrit par Laurent reste protégé —
cas réel `drive:047#20` « Atelier pratique : Simulation de réponse aux avis
clients », 1540 caractères en base, `contentMd` vide dans l'instantané (vérifié), qui
a déjà survécu à un `--apply` complet le 11/09.

Les modules sans déroulé sont **DÉJÀ écartés des sorties client** par le composeur
(« 104 module(s) écarté(s) : aucun déroulé pédagogique ») — donc vider est la vérité,
pas une régression. Vérifié aussi : aucun des 4 fantômes n'alimente DIAG-0001
(sources du parcours : BIB-D017, D034, D037, D008, D047, D012), donc le chiffrage ne
devrait pas bouger.
</donnees_mesurees>

<tasks>

<task type="auto" tdd="true">
  <name>Tâche 1 — RED : les tests du filtre, des préservations et de la garde d'import</name>
  <files>packages/db/scripts/__tests__/mentions-organisme.test.ts</files>
  <behavior>
Six familles de preuves, toutes RED au départ (le module `../lib/mentions-organisme.js`
n'existe pas encore, l'import échoue) :

1. **Chaque forme à retirer** — table-driven sur les 13 formes du tableau
   `donnees_mesurees`, avec les DEUX apostrophes, avec et sans « d' », avec
   ponctuation finale `.` `;` `:` et sans, plus une variante à espaces surnuméraires
   (`"  QCM   évaluation des acquis ;  "`) → `estMentionOrganisme()` rend `true`.
2. **Chaque ligne pédagogique à préserver** — table-driven sur la liste complète
   « À NE PAS TOUCHER » (les 3 « Évaluation de fin de session : … », les 3
   « Évaluation intermédiaire : … », les 5 « Quiz … », les 2 lignes de
   feedback/coaching du formateur, les 2 moyens pédagogiques de drive:058#6, les 3
   « Remise des attestations … ») **et sur les 3 lignes MIXTES** (drive:024#11,
   drive:028#6, drive:055#10) → `estMentionOrganisme()` rend `false`. Les 3 mixtes ont
   leur propre `it()` nommé « laissées et signalées », pour que la raison reste
   lisible quand le test tombera un jour.
3. **`faros:SA-ADM-M001#1` sort intact** — lire l'instantané commité (`readFileSync`
   d'un chemin dérivé de `import.meta.url`, aucun I/O réseau ni base), prendre ce
   module, appliquer `retirerMentionsOrganisme()` : zéro ligne retirée, `contentMd`
   identique au départ, et le déroulé porte toujours ses lignes légitimes qui parlent
   d'attestation, d'émargement et du « nom du formateur ».
4. **Modules entièrement faits de mentions** — sur fixture inline (les 2 lignes de
   pied de page) : `retirerMentionsOrganisme()` rend un `contentMd` vide et 2 lignes
   retirées, et `nEstQueDesMentions()` rend `true`. Puis, **au niveau DONNÉES sur
   l'instantané** (RED maintenant, GREEN après la tâche 2) :
   - aucune ligne de `contentMd`, tous modules confondus, n'est une mention — c'est LE
     test de non-retour ;
   - `drive:010#2`, `drive:014#4`, `drive:027#2`, `drive:038#3` ont un `contentMd`
     vide ;
   - chacun des programmes `drive:010`, `drive:014`, `drive:027`, `drive:038` porte un
     `warnings` qui NOMME le `sourceRef` du module vidé.
5. **La garde d'import** — `doitProtegerLeContenu(enBase, entrant)` :
   - vrai déroulé en base (fixture reprenant le texte de `drive:047#20`, ≥ 1000
     caractères) + entrant vide → `true` (**protégé**) ;
   - base ne portant que le boilerplate des 2 lignes + entrant vide → `false` (rien à
     protéger, l'écriture passe) ;
   - base non vide + entrant non vide → `false` (un remplacement reste permis, la
     règle n'a jamais été « ne jamais écraser ») ;
   - base vide + entrant vide → `false`.
6. **Idempotence** — repasser un `contentMd` déjà filtré ne change rien (même texte,
   zéro ligne retirée), y compris sur un module réel de l'instantané.
  </behavior>
  <action>
Créer **uniquement** le fichier de test, dans `packages/db/scripts/__tests__/`
(c'est là que vivent les tests de ce package : `vitest.config.ts` inclut
`scripts/**/__tests__/**/*.{test,spec}.ts`, environnement `node`, aucun I/O réel —
lire un JSON commité est permis, ouvrir une base ou le réseau ne l'est pas).

Importer depuis `../lib/mentions-organisme.js` (extension `.js` en ESM, comme le reste
du package) l'API suivante, qui n'existe pas encore — c'est le RED :

- `normaliserLigne(ligne: string): string`
- `estMentionOrganisme(ligne: string): boolean`
- `retirerMentionsOrganisme(contentMd: string | null | undefined)` → rend
  `{ contentMd: string; retirees: string[] }`
- `nEstQueDesMentions(contentMd: string | null | undefined): boolean`
- `doitProtegerLeContenu(enBase: string | null | undefined, entrant: string | null | undefined): boolean`

Écrire les tables avec `it.each` pour que l'échec NOMME la forme fautive — un
« 1 test failed » sur 13 formes ne sert à rien.

Ne créer AUCUN fichier d'implémentation dans cette tâche. Ne toucher ni
`extract-drive-catalog.ts`, ni `import-drive-catalog.ts`, ni l'instantané.

Commit : `test(pieds-de-page-deroules): le filtre des mentions d'organisme — tests RED`
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Projects/CRM Next gen/files-chaine" &amp;&amp; pnpm --filter @qualiof/db test 2>&amp;1 | tail -20   # DOIT échouer : ../lib/mentions-organisme.js introuvable</automated>
  </verify>
  <done>
Le fichier de test existe, couvre les 6 familles, et `pnpm --filter @qualiof/db test`
**échoue** en nommant le module manquant. Aucun autre fichier modifié. Commit RED posé.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Tâche 2 — GREEN : le filtre partagé, l'extraction, la garde d'import, l'instantané régénéré</name>
  <files>packages/db/scripts/lib/mentions-organisme.ts, packages/db/scripts/extract-drive-catalog.ts, packages/db/scripts/import-drive-catalog.ts, packages/db/scripts/data/drive-programmes-catalog.json</files>
  <action>
**① Le module pur partagé** — `packages/db/scripts/lib/mentions-organisme.ts`.
kebab-case, **fonctions pures**, **ZÉRO import prisma/next/fs**. Il est déjà couvert
par `tsc` (l'`include` de `packages/db/tsconfig.json` prend `scripts/**/*`) — ne pas
toucher aux tsconfig.

Principe, et c'est lui qui rend le lot sûr : **un ensemble FERMÉ de formes canoniques,
comparé à la ligne ENTIÈRE normalisée** — jamais une recherche de sous-chaîne. C'est
ce qui laisse vivre « Évaluation de fin de session : Mini-questionnaire ou QCM
rapide… » tout en retirant « QCM évaluation des acquis ; », et c'est ce qui fait
partir `QCM final` sans emporter `Quiz final.`.

`normaliserLigne()` : retirer la puce Markdown de tête (`- ` ou `* `), unifier les
apostrophes (courbe, modificatrice et droite → droite), remplacer les espaces
insécables, réduire les suites d'espaces à un seul, couper la ponctuation finale
(points, points-virgules, deux-points, virgules, espaces), passer en minuscules,
retirer les accents via `normalize('NFD')` puis suppression des diacritiques, `trim()`.

Les 7 formes canoniques (déjà normalisées, donc sans accent et sans ponctuation
finale) :

- `qcm evaluation des acquis`
- `qcm d'evaluation des acquis`
- `qcm final`
- `questionnaire de satisfaction`
- `questionnaire de satisfaction et cloture de la formation`
- `qcm d'evaluation des acquis et questionnaire de satisfaction`
- `tous les formateurs de l'equipe start-academy ont minimum 8 annees d'experience dans l'immobilier, notamment dans le domaine de la vente de biens, de formation d'agents et de coaching individuel`

`estMentionOrganisme()` = appartenance à cet ensemble (`Set`), sur la ligne entière.
`retirerMentionsOrganisme()` = découpe sur `\n`, écarte les lignes qui sont des
mentions, rend le Markdown recomposé **et la liste des lignes retirées** (c'est elle
qui alimente le warning). `nEstQueDesMentions()` = contenu non vide au départ ET plus
rien après filtrage. `doitProtegerLeContenu(enBase, entrant)` = `entrant` vide **ET**
`enBase` non vide **ET** `enBase` ne se réduit pas à des mentions.

Commenter **pourquoi** l'ensemble est fermé (le piège du motif large ; les 3 lignes
mixtes restent parce que la suppression pure y détruirait de la pédagogie et que
Laurent n'a donné aucun arbitrage de réécriture ; `faros:SA-ADM-M001#1` enseigne le
montage du dossier et parle légitimement d'attestation) et **pourquoi** la garde
change de sens (elle protège la pédagogie, pas le boilerplate). Ces commentaires sont
la moitié du livrable : le prochain qui lit ce fichier doit comprendre sans relire ce
plan.

**② L'extraction** — `extract-drive-catalog.ts`, dans `parseProgramme` (~l.519), au
point exact où `contentMd` est fabriqué à partir de `s.content` : passer ce Markdown
par `retirerMentionsOrganisme()`. Pour chaque module dont le déroulé était
**entièrement** fait de mentions, pousser un warning sur le programme qui **NOMME le
`sourceRef`** du module — formulation attendue, à reprendre telle quelle pour que le
test l'accroche : `drive:010#2` puis « déroulé entièrement fait de mentions
d'organisme — vidé (module fantôme né du pied de page, découpage au lot 3) ».
Ne **rien** changer d'autre : ni `NOT_A_MODULE`, ni `BODY_START`/`BODY_END`, ni les
titres, ni le découpage (interdits (a) et (b)).

**③ L'import** — `import-drive-catalog.ts` (~l.444) : remplacer le calcul de
`ecraserait` par un appel à `doitProtegerLeContenu(current.contentMd, m.contentMd)`.
Garder le commentaire existant (il est juste) et lui ajouter le pourquoi de la nuance.
Quand la garde NE s'applique PAS parce que la base ne portait que du boilerplate,
pousser une note dans le rapport pour que le module soit **nommé** — ne pas laisser
une écriture silencieuse là où l'ancien code protégeait. L'import ne **normalise rien**
en base et ne réécrit rien à la main : il décide, c'est tout.

**④ Régénérer l'instantané** : `pnpm --filter @qualiof/db extract:drive-catalog`.
Il lit le Drive monté sous
`~/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/…`. **Si le Drive n'est
pas lisible** (le script imprime « Drive introuvable »), **S'ARRÊTER et le dire**
plutôt que de committer un instantané tronqué. Vérifier le compte : **76 programmes ·
402 modules**. Relire le `git diff` du JSON : il doit ne montrer que des suppressions
de lignes de pied de page, les warnings ajoutés et `extractedAt` — **aucune**
disparition de module, **aucun** titre modifié.

**⑤ Committer le JSON séparément** — il est suivi par git, le `git diff` EST la revue :
`chore(pieds-de-page-deroules): instantané Drive régénéré — 101 lignes de pied de page en moins`

**⑥ Importer en LOCAL SEULEMENT** (base `qualiof_dev` sur `localhost:5432`, conteneur
`qualiof_postgres` déjà up ; `.env.local` présent à la racine du monorepo) :
`pnpm --filter @qualiof/db import:drive-catalog:local -- --apply`.
⛔ Jamais `import:drive-catalog` sans `:local`. Relever dans le rapport d'import :
`drive:047#20` doit apparaître en **contenu conservé**, et les 4 fantômes en contenu
mis à jour (non protégés).

**⑦ Rejouer le probe** : `pnpm --filter @qualiof/web probe:composition:local DIAG-0001`
(il réécrit `.planning/DIAG-0001-programme-compose.md`).

Contrôler dans le fichier produit, c'est le critère de fin :
- plus **AUCUNE** puce de mention sous un module (les deux paires relevées avant —
  sous un module de BIB-D017 et sous un module de BIB-D012 — doivent avoir disparu) ;
- l'objectif qui parle de « chaque moment de satisfaction rencontré » **reste** ;
- le contenu métier qui dit « au moment où le client verbalise sa satisfaction »
  **reste** ;
- la section « Modalités d'évaluation » garde ses deux lignes (« Une évaluation sous
  forme de QCM a lieu en fin de formation ; » et « Un questionnaire de satisfaction
  est remis à chaud, puis à froid ; ») — **c'est leur place légitime** ;
- le probe affiche toujours **6 demi-journées**, **48 h conventionnées**,
  **8064.00 € HT**, et **Σ devis = Σ proposition ✅ au centime**. **Si le chiffrage
  bouge, le DIRE FORT dans le compte rendu** — c'est un arbitrage commercial de
  Laurent, pas une conséquence à valider en silence (précédent du 11/09 : 5 → 6
  demi-journées).

**⑧ Gates, les trois, dans cet ordre** : `pnpm lint`, puis
`pnpm --filter @qualiof/web exec tsc --noEmit`, puis `pnpm test`. Référence AVANT,
tout vert depuis le nouveau chemin : lint 0, tsc 0, **2965 tests passés / 2 ignorés**
(10 db + 202 shared + 2753 web). Le compte doit **augmenter** du nombre de tests
ajoutés, et **aucun test existant ne doit tomber**.

Commit du code : `fix(pieds-de-page-deroules): les mentions d'organisme sortent des déroulés de modules`
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Projects/CRM Next gen/files-chaine" &amp;&amp; pnpm --filter @qualiof/db test &amp;&amp; pnpm lint &amp;&amp; pnpm --filter @qualiof/web exec tsc --noEmit &amp;&amp; pnpm test 2>&amp;1 | tail -15</automated>
    <automated>cd "/Users/laurentmarx/Projects/CRM Next gen/files-chaine" &amp;&amp; node -e "const j=JSON.parse(require('fs').readFileSync('packages/db/scripts/data/drive-programmes-catalog.json','utf8'));const m=j.programmes.flatMap(p=>p.modules);console.log(j.programmes.length+' programmes / '+m.length+' modules');if(j.programmes.length!==76||m.length!==402)throw new Error('compte changé — instantané suspect');"</automated>
    <automated>cd "/Users/laurentmarx/Projects/CRM Next gen/files-chaine" &amp;&amp; ! grep -nE "^- *(QCM (d.?.?)?.?valuation des acquis|QCM final|Questionnaire de satisfaction|Tous les formateurs de l)" .planning/DIAG-0001-programme-compose.md</automated>
  </verify>
  <done>
`pnpm --filter @qualiof/db test` passe (les 6 familles vertes), les trois gates sont
verts, le compte de tests a augmenté et aucun test existant n'est tombé.
L'instantané régénéré est commité à part (76 programmes / 402 modules) et importé en
LOCAL. Le programme composé de DIAG-0001 ne porte plus aucune mention d'organisme sous
un module, garde ses deux lignes de « Modalités d'évaluation », et le probe affiche
6 demi-journées / 48 h / 8064.00 € HT / Σ = Σ ✅ (ou l'écart est dit FORT dans le
compte rendu). Deux commits posés : le JSON, puis le code.
  </done>
</task>

<task type="auto">
  <name>Tâche 3 — DOC : l'entrée iCloud de STATE.md dit enfin la vérité du jour</name>
  <files>.planning/STATE.md</files>
  <action>
Réécrire le point « ### 3. Le dépôt vit sous iCloud, qui fabrique des copies de
fichiers » en tête de `.planning/STATE.md` (section « ⚠️ À savoir AVANT d'agir »,
~lignes 68-103). Il est **PÉRIMÉ et trompeur** : il dit « rien n'a été déplacé »,
annonce la destination `~/dev/crm-next-gen`, et décrit un bloquant déjà levé.

Nouveau titre qui dit l'état, pas l'alerte — p. ex. « ### 3. Le dépôt est SORTI
d'iCloud — il vit sous `~/Projects` ». Faits à consigner, tous vérifiés aujourd'hui :

- Le dépôt a été déplacé de `~/Documents/CRM Next gen` vers **`~/Projects/CRM Next gen`**
  le **11/09/2026**. Motif : `~/Documents` est synchronisé par iCloud, qui duplique les
  fichiers PENDANT qu'on les édite (83 copies « fichier 2.ts » relevées, byte pour
  byte) ; le coût immédiat était des gates rouges, le risque réel était `.git/`.
- Les **4 worktrees** pointent tous sur Projects, chacun sur sa branche : `files`
  (dépôt principal, `.git/` répertoire), `files-assiduite`, `files-chaine`,
  `files-signature` (les trois avec un `gitdir:` vers
  `/Users/laurentmarx/Projects/CRM Next gen/files/.git/worktrees/…`). Aucune métadonnée
  git ne contient plus l'ancien chemin. `fsck` propre.
- Note : la procédure `.planning/260911-sortir-le-depot-d-icloud.md` listait un 5ᵉ
  worktree `wt-numsecu` — il n'existe plus, `git worktree list` en rend 4.
- **Ce qui reste vrai** : la règle `.gitignore` `* [2-9].*` (posée le 02/09/2026) garde
  le dépôt git propre ; et un test de garde scanne le **DISQUE** et non l'index git —
  c'est pour cela que `apps/web/src/lib/__tests__/tva-exoneration.test.ts` tombait en
  local alors que la CI passait. **Il passe maintenant** (vérifié : 6 tests verts).
- **Résidus, aucun dangereux** : 46 copies « fichier 2.ext » subsistent hors sources
  (`.planning/`, `docs/`, `.claude/commands/signature 2.md`, et 18 dans
  `apps/web/.next/` qui sont des artefacts de build) ; **aucune suivie par git, aucune
  dans `.git/`**, aucune sous `apps/*/src` ni `packages/*/src`. Et 44 fichiers `.next`
  sont restés à l'ancien emplacement `~/Documents/CRM Next gen` (aucun dépôt git,
  aucune source). **Ne PAS les supprimer** dans cette tâche — les consigner comme
  ménage optionnel en attente du feu vert de Laurent.

Mettre aussi à jour le champ **`stopped_at`** du frontmatter, qui dit encore
« Procédure de sortie d'iCloud PRÉPARÉE et non exécutée — attend le feu vert » : elle
est EXÉCUTÉE, les 4 worktrees sont réparés, et ce qui reste est le chantier
d'extraction (lot 1 en cours, lots 2 et 3 à venir).

Ne rien changer d'autre dans STATE.md : ni les points 1 et 2 (prod / contenu local),
ni la section « PLANIFIÉ — nettoyage de l'extraction Drive », qui restent justes.

Commit séparé : `docs(state): le dépôt est sorti d'iCloud — l'entrée périmée corrigée`
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Projects/CRM Next gen/files-chaine" &amp;&amp; ! grep -n "dev/crm-next-gen\|non exécutée\|Bloquant à lever avant de bouger" .planning/STATE.md &amp;&amp; grep -c "Projects/CRM Next gen" .planning/STATE.md</automated>
    <automated>cd "/Users/laurentmarx/Projects/CRM Next gen/files-chaine" &amp;&amp; git worktree list | wc -l   # doit rendre 4, comme le dit désormais STATE.md</automated>
  </verify>
  <done>
STATE.md ne promet plus `~/dev/crm-next-gen`, ne parle plus d'une procédure « non
exécutée » ni d'un bloquant levé ; il nomme `~/Projects/CRM Next gen`, les 4
worktrees, le test de garde qui passe, et les résidus non dangereux en ménage
optionnel. `stopped_at` est à jour. Commit posé séparément des deux autres.
  </done>
</task>

</tasks>

<verification>
Dans l'ordre, après la tâche 2 :

1. `pnpm --filter @qualiof/db test` — les 6 familles vertes.
2. `pnpm lint` · `pnpm --filter @qualiof/web exec tsc --noEmit` · `pnpm test` — les
   trois gates. Référence AVANT : 2965 passés / 2 ignorés. Le compte monte, rien ne
   tombe.
3. `git diff` de `packages/db/scripts/data/drive-programmes-catalog.json` — que des
   suppressions de pieds de page, les warnings ajoutés, `extractedAt`. 76 programmes /
   402 modules.
4. Rapport d'import local : `drive:047#20` en **contenu conservé** ; les 4 fantômes
   **nommés** et mis à jour.
5. `.planning/DIAG-0001-programme-compose.md` : aucune puce de mention sous un module ;
   l'objectif « chaque moment de satisfaction rencontré » et le contenu « au moment où
   le client verbalise sa satisfaction » présents ; « Modalités d'évaluation » intacte
   avec ses deux lignes.
6. Probe : 6 demi-journées · 48 h conventionnées · 8064.00 € HT · Σ devis = Σ
   proposition ✅.
7. `git log --oneline` : 4 commits sur `fix/260911-pieds-de-page-deroules` (test RED,
   JSON, code, doc). Aucun merge sur `main`.
</verification>

<success_criteria>
- [ ] `.planning/DIAG-0001-programme-compose.md` ne porte **AUCUNE** mention
      d'organisme dans un déroulé de module.
- [ ] Les lignes pédagogiques voisines (QCM/quiz/satisfaction pédagogiques, moyens
      pédagogiques, feedback formateur) sont intactes, et `faros:SA-ADM-M001#1` aussi.
- [ ] Les 4 modules fantômes sortent vides, nommés par un warning, et l'import ne les
      protège plus.
- [ ] `drive:047#20` reste protégé par la garde — non-régression prouvée par un test.
- [ ] Chiffrage DIAG-0001 inchangé (6 demi-journées / 48 h / 8064.00 € HT / Σ = Σ), ou
      écart DIT FORT dans le compte rendu.
- [ ] Les 3 lignes mixtes et les « Remise des attestations … » sont **laissées ET
      signalées** dans le compte rendu.
- [ ] Trois gates verts, compte de tests en hausse, aucun test existant tombé.
- [ ] STATE.md dit la vérité sur le chemin du dépôt, les 4 worktrees et les résidus.
- [ ] Aucun interdit (a) (b) (c) entamé. Aucune commande d'import sans `:local`. Aucun
      merge sur `main`.
</success_criteria>

<output>
Compte rendu en trois lignes (format `/quick` §6) : ce qui change pour l'utilisateur,
ce qui a été mis de côté (les 3 lignes mixtes, les « Remise des attestations … », les
lots 2 et 3, le ménage des 46 + 44 résidus en attente du feu vert), ce qu'il reste à
vérifier à la main (la relecture du `git diff` du JSON et du programme composé par
Laurent).
</output>

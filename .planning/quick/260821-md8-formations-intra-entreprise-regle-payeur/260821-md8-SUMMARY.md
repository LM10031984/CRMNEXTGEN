---
quick_id: 260821-md8
phase: quick/260821-md8
plan: 01
subsystem: sessions / documents Qualiopi
tags: [regle-payeur, convention, analyse-besoin, intra-entreprise, qualiopi-ind4, tdd]
requires:
  - "@/lib/legal-forms (requiresContratIndividuel — source unique gelée le 12/08)"
  - "@/lib/docs/convention-coverage (quick 260820-j8w)"
  - "@/lib/closure/convention-core (quick 260817-mm0)"
provides:
  - "@/lib/sessions/payer-rule — isPersonneMoralePayeur, partitionByPayerRule, selectAnalyseBesoinTargets"
  - "@/lib/locations/format-lieu — formatLieuFormation"
  - "@/lib/docs/convention-coverage — GROUP_CONVENTION_ENTITY_TYPES, groupConventionAnyShapeWhere, isGroupConventionDoc"
  - "@/lib/convention-template — deriveSiren"
  - "apps/web/scripts/_audit-regle-payeur.ts — diagnostic lecture seule"
affects:
  - "prepareSession / prepareTrainingForSession / getSessionPreparationStatus"
  - "dispatchGenerateDoc (ANALYSE_BESOIN)"
  - "fiche session, dossier OPCO, bloc préparation pédagogique, timeline"
tech-stack:
  added: []
  patterns:
    - "Prédicat métier défini comme complément EXACT d'un prédicat existant, prouvé sur tout l'enum lu dans schema.prisma"
    - "Deux formes de stockage : une seule forme d'ÉCRITURE, plusieurs formes reconnues en LECTURE"
    - "Dénominateur de complétude = ce qui est LÉGITIMEMENT attendu, pas l'effectif"
key-files:
  created:
    - apps/web/src/lib/sessions/payer-rule.ts
    - apps/web/src/lib/locations/format-lieu.ts
    - apps/web/scripts/_audit-regle-payeur.ts
    - apps/web/src/lib/sessions/__tests__/payer-rule.test.ts
    - apps/web/src/lib/locations/__tests__/format-lieu.test.ts
    - apps/web/src/lib/__tests__/convention-rcs-siren.test.ts
    - apps/web/src/server/actions/__tests__/prepare-training.payer-rule.test.ts
    - apps/web/src/server/actions/__tests__/dispatch-generate-doc.analyse-besoin.test.ts
  modified:
    - apps/web/src/server/actions/prepare-training.ts
    - apps/web/src/server/actions/dispatch-generate-doc.ts
    - apps/web/src/server/actions/opco-submission.ts
    - apps/web/src/lib/closure/convention-core.ts
    - apps/web/src/lib/convention-template.ts
    - apps/web/src/lib/docs/convention-coverage.ts
    - apps/web/src/lib/sessions/build-prep-completion-items.ts
    - apps/web/src/components/sessions/preparation-pedagogique-block.tsx
    - apps/web/src/components/sessions/session-workflow-timeline.tsx
    - apps/web/src/app/app/sessions/[id]/page.tsx
decisions:
  - "La forme `organization` reste la seule forme d'ÉCRITURE ; `session` (scripts _gen-*) devient une forme reconnue en LECTURE et remplacée à la régénération, uniquement si la session est mono-commanditaire."
  - "L'analyse des besoins d'ENTREPRISE absente est AFFICHÉE comme manquante (indicateur 4) mais EXCLUE du compteur du bouton « Compléter », qui ne sait pas la produire — un compteur qui ne converge jamais use la confiance dans tous les autres."
  - "Le dénominateur de l'analyse des besoins n'est plus l'effectif mais le nombre d'auto-payeurs."
  - "Aucun document de production supprimé. La remédiation reste une étape séparée."
metrics:
  duration: "~2 h"
  tasks: 3
  tests_added: 98
  suite: "1345/1345 (baseline 1247)"
  completed: 2026-08-21
---

# Quick 260821-md8 : Règle « payeur personne morale » dans l'appli — Summary

**L'application applique désormais la règle métier du 12/08 par défaut : payeur personne morale ⇒ UNE convention de groupe, zéro document nominatif — et les conventions d'entreprise qu'elle produit sont complètes (représentant garanti, SIREN sur la ligne RCS, lieu dédoublonné).**

Jusqu'ici la règle ne vivait que dans des scripts ponctuels. Un clic « préparer la formation » sur une session intra-entreprise produisait encore des conventions et des analyses des besoins **par stagiaire**, en doublon des documents d'entreprise corrects. C'est exactement ce que le constat du 21/08 a filmé sur SES-0107 et SES-0108.

---

## Réponse à la question de Laurent

> **Après ce changement, la fiche session de SES-0108 (EXPERTA) affiche-t-elle exactement UNE convention et UNE analyse des besoins ?**

**Non — pas tant que les deux documents parasites déjà en base n'ont pas été supprimés.** Le code ne produira plus de doublon ; il ne rattrape pas le passé (aucune suppression automatique, règle projet « destructif = étape séparée »).

Voici ce que la fiche affiche **aujourd'hui, après ce changement**, vérifié en base cloud :

| Endroit de la fiche | Convention | Analyse des besoins |
|---|---|---|
| **Bloc « Préparation pédagogique »** | **1 / 1** ✅ (la couverture voit les deux formes, `organization` fait foi) | **« Analyse besoin entreprise 1/1 »** ✅ — la ligne « par stagiaire » est masquée (0 attendue) |
| **Matrice « Tous les documents »** (ligne Sophie AUGUSTIN) | **1 cellule** — mais elle pointe la convention du **script**, celle de l'appli est invisible dans la matrice | **1 cellule** — mais c'est l'analyse **NOMINATIVE parasite**, pas celle de l'entreprise |
| **En base** | **2 documents** ⚠ | **2 assets** ⚠ |

Autrement dit : l'œil voit une cellule par colonne, **mais la session porte bien deux conventions d'entreprise et deux analyses**, et l'analyse montrée dans la matrice est la mauvaise. Un auditeur qui ouvre le dossier de la session verra les deux.

### Ce qu'il faudrait supprimer — **liste exacte, non exécutée**

Relevé en base cloud le 2026-08-21 (lecture seule) :

**① Analyse des besoins nominative parasite — à supprimer sans hésitation**

```
PedagogicalAsset  79170d44-62a4-4d67-ab65-c1d2969b9a32
  kind=ANALYSE_BESOIN · participantId=dfd79dad-9dc0-4763-9828-89e131d75b0d (Sophie AUGUSTIN)
  généré le 2026-08-21 10:59 par le worker de clôture (clic « préparer »)
  pdfUrl : closure/db191440…/SES-0108/…/augustin-sophie-analyse_besoin-4881c86d.pdf
```

C'est le document que ce plan empêche désormais de naître. L'analyse d'entreprise correcte (`14d932be-d282-4a21-9a8b-53a80a406eac`, `analyses/SES-0108/experta-entreprise-355a5aad.pdf`, produite le 20/08 par `_gen-assalit-experta-analyses.ts`) **est déjà en base et doit être conservée**.

**② Doublon de convention d'entreprise — le choix appartient à Laurent**

```
Document 99cf7170-246d-4677-9af5-49916b86b7c6   entityType='organization'
  créé 2026-08-21 10:54 par l'APPLI (panneau « convention d'entreprise »)
  pdfUrl : conventions/SES-0108/entreprise-experta-663ab29a.pdf

Document d92de4d1-0ffd-4bff-abf5-2a3607066dc3   entityType='session'
  créé 2026-08-21 11:03 par le SCRIPT _gen-assalit-experta-docs.ts
  pdfUrl : conventions/SES-0108/experta-groupe-b5805921.pdf
```

⚠ **Les deux PDF ne sont PAS identiques.** Celui du script (le plus récent, 11:03) porte le **paragraphe « modalités OPCO EP »** et le **tampon Start Academy** — deux patchs que le script applique après rendu et que le gabarit de l'appli ne produit pas. C'est cette version-là qui part au portail OPCO EP.

Deux remédiations possibles, **opposées** :

- **Garder le script (recommandé pour SES-0107/0108, destinées à l'OPCO EP)** → supprimer `99cf7170…`. La couverture continue de fonctionner (la forme `session` est désormais lue). ⚠ Mais toute régénération future depuis l'appli recréerait la forme `organization` et supprimerait celle du script — donc **ne pas cliquer « régénérer la convention » sur ces deux sessions**.
- **Garder l'appli** → supprimer `d92de4d1…`, ou plus simplement **régénérer depuis le panneau** : le code converge maintenant tout seul (voir ci-dessous). Mais la convention perdrait le paragraphe OPCO EP et le tampon.

**③ Le même arbitrage vaut pour SES-0107 et SES-0106**, qui n'ont que la forme `session` (pas de doublon) : elles sont saines en l'état.

---

## Ce qui a été livré

### Tâche 1 — Règle payeur : détection, partition, convention de groupe automatique

`apps/web/src/lib/sessions/payer-rule.ts` répond désormais **seul** à « ce payeur relève-t-il de la convention de groupe ? ». `isPersonneMoralePayeur` est défini comme le **complément exact** de `requiresContratIndividuel` (source unique gelée le 12/08) — pas comme une seconde liste de formes juridiques, qui divergerait au premier ajout à l'enum. Un test le prouve **sur toutes les valeurs de `LegalForm` lues dans `schema.prisma`** : ajouter une forme sans trancher son régime fera échouer la suite.

`partitionByPayerRule` regroupe par commanditaire. Le format « groupe » **ne dépend pas de l'effectif** : la salariée seule d'EXPERTA relève de la convention, pas du contrat individuel.

Les deux orchestrateurs (`prepareSession` **et** `prepareTrainingForSession`) appellent maintenant `generateConventionEntrepriseCore` une fois par commanditaire personne morale, et `generateConventionForParticipant` **uniquement** pour les auto-payeurs. La convocation reste nominative dans tous les cas. `conventionsGenerated` compte les **inscrits couverts**, pas les appels.

**Découverte majeure traitée : deux formes de stockage rivales.** `convention-coverage.ts` reconnaît désormais `organization` (forme d'écriture, porte le commanditaire) **et** `session` (forme des scripts `_gen-*`, portée = session entière). Deux passes, `organization` d'abord : chaque inscrit n'est couvert qu'une fois. `generateConventionEntrepriseCore` remplace aussi la forme `session` à la régénération — **mais uniquement si la session n'a qu'un commanditaire personne morale** ; sinon elle est conservée et journalisée.

### Tâche 2 — Analyse des besoins : plus jamais de variante par stagiaire

`selectAnalyseBesoinTargets` (helper pur, ne supprime rien) décide qui reçoit quoi. `prepareSession` n'enfile plus aucun `ClosureJob` nominatif pour un salarié, et **ne crée plus de batch vide**. Le chemin manuel de la matrice Qualiopi (`dispatchGenerateDoc`) refuse la génération en nommant l'entreprise, en `{ ok: false, error }` — jamais en exception, le dispatch tournant dans des boucles UI.

Le statut de préparation distingue « par stagiaire » et « entreprise », **sans mélanger les compteurs**.

`apps/web/scripts/_audit-regle-payeur.ts` : diagnostic **100 % SELECT**, avec les identifiants exacts des résidus. Sa sortie EST la liste de remédiation.

### Tâche 3 — Les trois défauts du gabarit

- **(a) RCS/SIREN** — `deriveSiren` : la ligne RCS porte le **SIREN** (9 chiffres, le vrai numéro d'immatriculation), le **SIRET** a sa propre ligne `N° SIRET :`, comme dans le bloc « organisme de formation » juste au-dessus. Sans numéro exploitable, la ligne RCS disparaît entière — pas de « sous le numéro » orphelin. Le gabarit redérive le SIREN pour les appelants historiques (scripts `_gen-*`) qui ne passent que le SIRET.
- **(b) Représentant** — cascade champ fiche entreprise → **contact principal** → **REFUS** avant tout rendu PDF et toute écriture. « Représentée par , » est devenu impossible. Le message nomme l'entreprise et donne le lien `/app/organisations/{id}`. La cascade du chemin individuel (l'auto-entrepreneur signe lui-même) est **inchangée**.
- **(c) Lieu** — `formatLieuFormation`, **un seul helper pour les deux chemins** de génération. Plus de « EXPERTA — EXPERTA ». Le cas légitime « SARL XYZ — Agence Nice Centre, 12 rue X, 06000 Nice » est préservé : l'inclusion partielle ne joue **qu'entre raison sociale et nom du lieu**, sinon la ville « Nice » disparaîtrait parce qu'elle est contenue dans « Agence Nice Centre ».

---

## Test de puissance (gate obligatoire)

Trois branches cassées successivement, suite complète relancée à chaque fois, puis restaurées (`git diff` vide après chaque restauration).

| # | Branche cassée | Résultat | Après restauration |
|---|---|---|---|
| 1 | `payer-rule.ts` — `!` retiré de `isPersonneMoralePayeur` | 🔴 **42 tests rouges** | ✅ 1345/1345 |
| 2 | `convention-coverage.ts` — `'session'` retiré de `GROUP_CONVENTION_ENTITY_TYPES` | 🔴 **7 tests rouges** | ✅ 1345/1345 |
| 3 | `convention-core.ts` — garde « représentant absent » → repli sur chaîne vide | 🔴 **1 test rouge** | ✅ 1345/1345 |

**Branche 1** (extrait) — la règle payeur est bien testée aux deux bouts, pur ET orchestrateurs :

```
FAIL prepare-training.payer-rule > prepareSession > produit UNE convention de groupe et ZÉRO convention nominative (SES-0107)
FAIL prepare-training.payer-rule > prepareTrainingForSession > produit UNE convention de groupe et ZÉRO convention nominative (SES-0107)
FAIL prepare-training.payer-rule > prepareSession > traite une salariée seule comme un groupe (SES-0108 EXPERTA)
FAIL prepare-training.payer-rule > prepareSession > n'enfile AUCUNE analyse par stagiaire quand le payeur est une personne morale
FAIL dispatch-generate-doc.analyse-besoin > refuse une analyse nominative quand le payeur est une personne morale
FAIL payer-rule > isPersonneMoralePayeur > est EXACTEMENT complémentaire de requiresContratIndividuel sur tout l'enum
…42 au total
```

**Branche 2** :

```
FAIL convention-coverage > la forme `session` couvre TOUS les inscrits reçus (portée = session entière)
FAIL convention-coverage > avec les deux formes, chaque inscrit est couvert UNE fois et `organization` gagne
FAIL convention-coverage > isCoveredByGroupConvention voit aussi la convention produite par script
FAIL prepare-training.payer-rule > compte la convention produite par script (forme `session`) comme couvrante
FAIL prepare-training.payer-rule > interroge les deux entityType, pas seulement `organization`
…7 au total
```

**Branche 3** — **exactement** le test visé, aucun dommage collatéral :

```
FAIL convention-entreprise > représentant légal > REFUSE de générer sans représentant déterminable — aucun PDF, aucun document
Tests  1 failed | 1344 passed (1345)
```

> Note d'honnêteté : la première tentative de cassage de la branche 3 a produit une **erreur de syntaxe** (28 rouges dont un échec de chargement de suite). Un test qui rougit parce que le module ne compile plus ne prouve rien. La manipulation a été refaite proprement — remplacement de la garde par l'ancien comportement, `tsc` exit 0 — pour obtenir le rouge ci-dessus, qui lui est significatif.

---

## Diagnostic sur données réelles (lecture seule, cloud production)

`cd apps/web && pnpm dotenv -e ../../.env -- tsx scripts/_audit-regle-payeur.ts`

Gate d'écriture vérifié **avant** exécution : `grep -nE "\b(create|update|upsert|delete)(Many)?\(" … ` → **0 occurrence**.

```
TOTAUX
  sessions intra-entreprise auditées ....... 36
  sessions à DOUBLON de convention groupe .. 1
  conventions individuelles résiduelles .... 158
  analyses des besoins par stagiaire ....... 37
  analyses d'entreprise absentes ........... 33
  représentants légaux non renseignés ...... 14

Aucune suppression effectuée. La remédiation est une étape séparée, sur validation.
```

Les trois sessions du constat :

```
SES-0106 — OPTIMMO SARL (SARL, 11) · 11 inscrit(s)
  conventions groupe         organization=0 · session=1
  analyses par stagiaire     —
  analyse entreprise         présente
  représentant               OPTIMMO SARL → Gilles Blanchon

SES-0107 — ASSALIT SYNDIC (SAS, 8) · 8 inscrit(s)
  conventions groupe         organization=0 · session=1
  analyses par stagiaire     —
  analyse entreprise         présente
  représentant               ASSALIT SYNDIC → Gilles Blanchon

SES-0108 — EXPERTA (SAS, 1) · 1 inscrit(s)
  conventions groupe         organization=1 · session=1   ⚠ DOUBLON (2 conventions d'entreprise)
                               Document 99cf7170-246d-4677-9af5-49916b86b7c6  (forme organization)
                               Document d92de4d1-0ffd-4bff-abf5-2a3607066dc3  (forme session)
  conventions individuelles  —
  analyses par stagiaire     ⚠ 1 : Sophie AUGUSTIN [PedagogicalAsset 79170d44-62a4-4d67-ab65-c1d2969b9a32]
  analyse entreprise         présente
  représentant               EXPERTA → Gilles Blanchon
```

**Les chiffres à retenir, au-delà du cas EXPERTA** : **158 conventions nominatives** et **37 analyses par stagiaire** existent en base sur des salariés qui relèvent de la convention d'entreprise, **33 sessions intra-entreprise n'ont aucune analyse d'entreprise**, et **14 commanditaires n'ont pas de représentant légal renseigné** — ces derniers ne pourront plus produire de convention tant que la fiche entreprise n'est pas complétée (c'est le but : mieux vaut un refus explicite qu'une convention non opposable). Ce volume dépasse largement le cadre d'une quick : il appelle une décision de remédiation à part entière.

---

## Déviations par rapport au plan

### 1. [Rule 2 — fonctionnalité critique manquante] Deux consommateurs du « source unique » restaient aveugles à la forme `session`

- **Trouvé pendant :** tâche 1.
- **Problème :** le plan ne demandait de recâbler que `convention-core.ts` et `prepare-training.ts`. Or `apps/web/src/app/app/sessions/[id]/page.tsx` (fiche session) et `apps/web/src/server/actions/opco-submission.ts` (dossier OPCO) lisaient encore la seule forme `organization`. La fiche session n'aurait même **pas chargé** la convention de SES-0107/0108, et le dossier OPCO EP serait reparti **sans sa convention** — précisément le scénario que la convention de groupe devait servir. C'est le demi-déploiement d'une « source unique » qui avait produit les 5 findings Codex.
- **Correctif :** `{ entityType: { in: [...GROUP_CONVENTION_ENTITY_TYPES] }, type: 'CONVENTION' }` sur la fiche session ; `groupConventionAnyShapeWhere` sur le dossier OPCO.
- **Commit :** `4cd9c35`

### 2. [Rule 1 — bug] Le dénominateur de l'analyse des besoins rendait toute session intra-entreprise éternellement incomplète

- **Trouvé pendant :** tâche 2.
- **Problème :** conséquence directe de l'arrêt des analyses nominatives. `isPrepComplete` et `buildPrepCompletionItems` comparaient `analyseBesoinDone` à **l'effectif**. Sur SES-0108 le compteur serait resté figé à « 1 manquant » sur un document qu'on venait justement de décider de ne plus produire, et le bouton « Compléter (1) » n'aurait jamais convergé.
- **Correctif :** `SessionPreparationStatus.analyseBesoinAttendue` (= nombre d'auto-payeurs) devient le dénominateur, dans la source unique `build-prep-completion-items.ts` **et** dans `session-workflow-timeline.tsx` (qui portait une seconde implémentation du même calcul). Le passage de `SessionPreparationStatus` en type plus riche a fait office de filet : `tsc` a signalé les deux fixtures de test restées incomplètes.
- **Commit :** `6cb7501`

### 3. [Rule 2] Affichage honnête de l'analyse d'entreprise manquante, sans créer de faux positif

- **Trouvé pendant :** tâche 2.
- **Arbitrage :** le plan assume qu'aucun générateur d'analyse d'entreprise n'existe. La compter dans « X manquants » aurait créé un compteur qui ne converge **jamais** — le faux positif qui use la confiance dans tous les autres blockers (le plan cite lui-même `no_price` sur SES-0106). La cacher aurait masqué un trou à l'indicateur 4.
- **Choix retenu :** ligne dédiée « Analyse besoin entreprise » dans le bloc + mention explicite « à produire hors application : le bouton Compléter ne la génère pas encore » ; comptée comme manquante dans le badge X/Y et dans `isPrepComplete`, **exclue** de `countMissingPrep`.
- **Commit :** `6cb7501`

### 4. [Écart mineur] Fichiers de test non listés dans le plan

Le plan exigeait un test de puissance touchant « au moins un test de `prepare-training` sur le routage des conventions » sans lister le fichier correspondant. Créés : `prepare-training.payer-rule.test.ts`, `dispatch-generate-doc.analyse-besoin.test.ts`, `convention-rcs-siren.test.ts`. Deux fixtures existantes (`convention-entreprise.test.ts`, tests d'agrégation de prix) ont reçu un `representative` : elles testaient les prix, le représentant y était incident — et la nouvelle garde les refusait légitimement.

### 5. [Écart mineur] Le script de diagnostic imprime les identifiants

Le plan décrivait des colonnes de comptage. Sans les `id`, la sortie n'était pas actionnable alors qu'elle est explicitement « la liste de remédiation à soumettre ». Les `Document.id` / `PedagogicalAsset.id` sont imprimés pour les items signalés.

### 6. [Hors périmètre, non corrigé] Format postal du lieu

`formatLieuFormation` joint désormais code postal et ville par une **espace** (« 06000 Nice ») là où l'ancien code mettait une virgule (« 06000, Nice ») — c'est ce que spécifiait le cas de référence du plan, et le format postal français correct. Les conventions régénérées après ce jour porteront cette forme ; celles déjà émises ne sont pas retouchées.

---

## Écarts assumés du périmètre (rappel du plan)

- **Volet 2 (retrouvabilité)** et **volet 3 (prix au choix)** ne sont pas dans cette quick — découpage inchangé, cf. plan.
- **Le générateur d'analyse des besoins ENTREPRISE n'est pas construit.** Ce plan fait la moitié qui protège : il arrête la production de la mauvaise variante et affiche le manque. 33 sessions intra-entreprise sont concernées.
- **Aucun script `_gen-*` modifié.** `apps/web/src/server/actions/invoices.ts` **intact** (session parallèle).
- **Aucune migration Prisma** (`Document.entityType` est un String libre, `participantId` nullable, `Contact.isPrimary` et `Organization.siren` existaient déjà).
- **Aucune écriture en base** depuis l'exécution : les tests unitaires mockent Prisma, le seul script lancé est en lecture seule.

---

## Points d'attention pour la suite

1. **Ne pas régénérer la convention de SES-0107 / SES-0108 depuis l'appli** tant que le paragraphe « modalités OPCO EP » et le tampon ne sont pas dans le gabarit : la régénération remplacerait la version du script par une version sans ces éléments. Candidat naturel pour une prochaine quick.
2. **14 commanditaires sans représentant légal** ne peuvent plus produire de convention d'entreprise. C'est voulu, mais cela se manifestera comme une erreur au premier clic. Les fiches entreprise sont à compléter (ou un contact principal à désigner).
3. **La remédiation des 158 conventions nominatives + 37 analyses par stagiaire** attend un mot de Laurent, à partir de la sortie du script de diagnostic.

---

## Vérification

| Gate | Résultat |
|---|---|
| `pnpm build` (turbo, racine) | ✅ 1/1 |
| `pnpm lint` (turbo, racine) | ✅ 3/3 — 1 warning `jsx-a11y/alt-text` **pré-existant** dans `parametres/page.tsx`, hors périmètre |
| `pnpm test` (turbo, racine : db + shared + web) | ✅ 3/3 — **web 1345/1345** (baseline 1247, +98) |
| `pnpm exec tsc --noEmit` (apps/web) | ✅ exit 0 |
| grep « aucune liste de formes en dur » dans `payer-rule.ts` | ✅ 0 occurrence |
| grep « aucune écriture » dans `_audit-regle-payeur.ts` | ✅ 0 occurrence |
| Test de puissance 3/3 branches | ✅ 42 / 7 / 1 rouges, restaurées, suite verte |

## Commits

| Hash | Message |
|---|---|
| `ab1cd65` | test(260821-md8) : règle payeur personne morale — tests RED |
| `4cd9c35` | feat(260821-md8) : convention de groupe automatique dès que le payeur est une personne morale |
| `e124a91` | test(260821-md8) : analyse des besoins entreprise vs par stagiaire — tests RED |
| `6cb7501` | feat(260821-md8) : l'analyse des besoins n'est plus produite par stagiaire quand le payeur est une personne morale |
| `43d0d99` | test(260821-md8) : les 3 défauts du gabarit de convention — tests RED |
| `ad6896b` | feat(260821-md8) : corrige les 3 défauts du gabarit de convention |

## Self-Check: PASSED

- 8 fichiers créés vérifiés présents sur disque (+ ce SUMMARY).
- 6 commits vérifiés présents dans `git log`.
- Contraintes de périmètre vérifiées par `git diff --name-only` sur les 6 commits : **aucun script `_gen-*` modifié**, **`invoices.ts` intact** (0 fichier correspondant).
- Aucun résidu des tests de puissance : `git diff` vide sur les 3 fichiers cassés/restaurés.

## Known Stubs

Aucun stub introduit. Le seul manque fonctionnel — le générateur d'analyse des besoins d'entreprise — est **absent par décision explicite du plan**, et il est désormais **affiché** dans l'UI comme document manquant plutôt que masqué. Il est adressé par la quick « Générateur d'analyse des besoins ENTREPRISE » du découpage.

# Versement du catalogue Drive en PRODUCTION — relevé

_17/09/2026. Écrit **avant** l'écriture pour la partie « sortie de secours »,
complété après pour les preuves. Rien de ce fichier n'est rétroactif._

## 0 · La population, nommée par son contenu

Une base ne s'identifie jamais par son nom (§4 sexies). Relevé en lecture seule
(`db:query:prod`, transaction `READ ONLY` terminée par `ROLLBACK`) :

| Marqueur | Attendu — POINT-5 du 14/09 | Lu le 17/09 | |
|---|---|---|---|
| Tenant | `db191440-a144-48d1-93c1-767e6f647f2c` | identique | ✅ |
| Nom | Start Academy | Start Academy (**seul** tenant) | ✅ |
| Produits | 51 | 51 — dont **39 actifs**, 12 inactifs | ✅ |
| Modules | 86 | 86 | ✅ |
| Project ref | `gntlqyscahbgjrmsbzil` | identique | ✅ |
| Hôte | `aws-0-eu-west-1` | `aws-0-eu-west-1.pooler.supabase.com` | ✅ |

**Migrations** : 31 dans le dépôt, 31 appliquées, noms identiques au diff,
0 non terminée, 0 annulée. **Zéro migration en attente** — vérifié, pas supposé.

## 1 · La sortie de secours — écrite AVANT d'entrer

**La preuve structurelle, et elle sert deux fois.** Relevé en lecture seule
avant tout versement :

```
avec_sourceRef = 0 · codes BIB-* = 0 · supersededBy posés = 0
```

**Aucun produit préexistant ne porte de `sourceRef`.** Les 72 rayons et
400 modules versés en portent tous un. Conséquences :

1. **Aucun `update` n'a lieu** sur les 51 produits déjà en base — le chemin qui
   pourrait toucher les 39 publiés n'est jamais emprunté ;
2. **l'annulation est exacte** : ce que le versement a créé est exactement ce que
   `sourceRef IS NOT NULL` désigne, sans ambiguïté et sans date à croiser.

Le retour arrière, en une phrase :

```sql
-- ⚠ À exécuter SEULEMENT sur décision de Laurent. Les modules partent en
-- cascade (TrainingModule.productId → onDelete: Cascade).
DELETE FROM "TrainingProduct"
 WHERE "tenantId" = 'db191440-a144-48d1-93c1-767e6f647f2c'
   AND "sourceRef" IS NOT NULL;
```

Il ne touche aucun produit vendu, aucun produit publié, aucune session : les
rayons naissent vides de session, et les liens `supersededByProductId` partent
avec eux. Les entrées `AuditLog` correspondantes restent — une trace de ce qui a
eu lieu n'a pas à disparaître parce qu'on annule.

## 2 · Les gardes posées avant d'écrire

| Garde | Ce qu'elle empêche | Rougie une fois ? |
|---|---|---|
| **Barrière Faros** (`lib/barriere-faros.ts`) | verser une capsule asynchrone avec une modalité `PRESENTIEL` fausse sur une pièce Qualiopi | ✅ test ④ vert, ①②③ rouges à dessein |
| **Liens en phase 2** | un doublon de rayon non résolu, raconté en prose au lieu de bloquer | ✅ sonde `drive:021 → drive:999` : sortie 1, rien écrit |
| **Garde de cible** (`lib/garde-cible.ts`) | écrire dans une base qui n'est pas celle du relevé | ✅ sonde « 999 produits attendus » : ROLLBACK, sortie 1, rien écrit |

La garde de cible est une **enveloppe** (`transactionGardee`) et non un ordre à
placer en premier : un futur import ne peut pas l'oublier, il n'y a pas d'autre
façon d'ouvrir la transaction. 9 tests unitaires, dont le seul qui compte
vraiment : *le corps n'est pas appelé* quand un marqueur diffère.

## 3 · Le versement

**Transaction unique, ouverte le 2026-09-17T05:27:12.307Z, fermée à
05:27:57.819Z** — 45,5 s. Les deux phases dedans, et la garde de cible en
premier ordre.

```
✅ APPLIQUÉ — cible PRODUCTION
   72 créés · 0 mis à jour · 4 écartés
   400 modules · 0 rayon activé (D-19)
   ⛔ 2 rayon(s) Faros écarté(s) — barrière du 16/09 (modalité)
   🔗 lien posé en phase 2 : drive:020 → drive:008 (`BIB-D008`)
```

### Ce qui a été créé

| | |
|---|---:|
| Rayons de bibliothèque (`BIB-D*`, `sourceRef` = `drive:*`) | **72** |
| Modules | **400** |
| Rayons activés | **0** — `isActive: false` en dur (D-19) |
| Liens `supersededBy` posés en phase 2 | **7** |

### Ce qui a été écarté, et pourquoi

| Rayon | Motif |
|---|---|
| `drive:000` « Prompts IA » | aucun module extrait du dossier source — rien à importer |
| `drive:051` « Intégrer l'IA en entreprise » | idem |
| `faros:SA-ACQ-M003` « Trouver des vendeurs avant les autres » | **barrière Faros** — 1 module non versé |
| `faros:SA-ADM-M001` « AGEFICE — Sécuriser et transmettre sa demande » | **barrière Faros** — 1 module non versé |

Et **7 rayons sortent du chemin de composition** sans sortir de la base : 6 par
D-19 bis (`drive:030`→`PROD-0003`, `drive:046`→`PROD-0671`, `drive:053`→`PROD-053`,
`drive:055`→`PROD-055`, `drive:073`→`PROD-0673`, `drive:074`→`PROD-0662` — la
version vendue fait foi, le produit vendu n'est pas touché) et 1 par l'arbitrage
de Laurent du 11/09 (`drive:020`→`drive:008`), **posé en phase 2**.

Dans les 400 modules versés : **5 exclus des sorties client** (pige), **33 sans
aucun déroulé** (dont 4 modules fantômes nés du pied de page), **70 hors
composition** (appartenant aux 7 rayons écartés).

> Le 6ᵉ module « pige » du corpus était dans `faros:SA-ACQ-M003` : il n'est pas
> versé. Compte relevé deux fois, par l'importeur et par le détail
> module-par-module — 5 des deux côtés.

## 4 · Les cinq contrôles — avant / après

| # | Contrôle | Avant | Après | |
|---|---|---|---|---|
| 1 | **Idempotence** — rejeu complet | — | **0 créé · 72 mis à jour · 0 en échec**, lien `drive:020` **non re-posé** (« lien déjà posé, non recalculé ») | ✅ |
| 2 | **Le témoin** — codes sur `/catalogue` | **39** | **39**, `diff` vide sur la liste complète | ✅ |
| 3 | **Les routes** | — | `/catalogue` 200, titre + `<h1>` + 39 cartes · `/diagnostic` 200, titre + 1ʳᵉ question et ses 4 options | ✅ |
| 4 | **Produits** | 51 | **123** = 51 + 72 | ✅ |
| 5 | **Modules · actifs** | 86 · 39 | **486** = 86 + 400 · **39 actifs**, **0 rayon actif** | ✅ |

**Sur les routes** : un 200 ne suffit pas. Vérifié dans le HTML — zéro
occurrence de « Application error », « Internal Server Error », « Something went
wrong » ou d'une frontière d'erreur FR. Les 36 et 1 « marqueurs » d'un premier
grep trop large étaient des `text-slate-500` et un `fontWeight: 500`.

**Aucun `BIB-*` n'apparaît sur `/catalogue`** : la page filtre `isActive: true`,
l'import pose `isActive: false`. Le catalogue public n'a pas bougé d'un produit.

### La trace

`AuditLog`, tenant Start Academy, source `import-drive-catalog.ts` :
**72 naissances** (05:27:12.695 → 05:27:56.465) et **7 liens** en phase 2
(05:27:57.149 → 05:27:57.667). Tous **à l'intérieur** de la fenêtre de la
transaction : le journal n'a pas survécu à une écriture qui n'aurait pas eu lieu.
Les rejeux n'ont ajouté aucune entrée — un `update` de rejeu n'est pas une
naissance.

## 5 · Un défaut trouvé sur MOI, au rejeu

Le rapport du **second** passage rouvrait la section « ⚠️ À trancher — le même
programme importé deux fois » sur la paire `BIB-D008` / `BIB-D020`, en écrivant
« **Rien n'a été écarté.** Le choix t'appartient » — alors que le lien venait
d'être posé au run précédent.

Cause : le filtre ne connaissait que les liens résolus **pendant ce run-ci**, pas
ceux déjà en base. Un rapport qui redemande un arbitrage rendu est exactement la
famille qu'on traque.

**Corrigé** (`dejaEcartes`), rejoué, vérifié : 0 occurrence. Les données n'étaient
pas en cause — le lien était bien posé en base. C'était le récit qui mentait.

## 6 · Ce que ce relevé n'a pas fait

- **Les 12 rattachements douleur → module ne sont pas écrits.** Chantier séparé,
  protocole complet à part : dry-run → arbitrage de Laurent → application →
  idempotence.
- Aucune migration (31 avant, 31 après — l'import n'en demande aucune).
- Aucun produit publié : `isActive` reste `false` sur les 72 rayons.
- Rien sur Faros (écarté), rien sur l'AGEFICE, aucune PR, aucun commit.

---

# Second chantier — les 12 rattachements douleur → module

_Même journée, protocole séparé. La garde de cible a été branchée sur
`ecrire-rattachements.ts` **avant** l'écriture, et rougie sur ce chemin-là :
une garde réutilisée n'est pas une garde prouvée sur son nouveau chemin._

## 7 · La garde, sur son nouveau chemin

`ecrire-rattachements.ts` passe désormais par **`DIRECT_URL`**, comme l'import —
une seule voie d'écriture dans le dépôt, pas deux — et ouvre sa transaction par
la **même enveloppe** `transactionGardee`, pas une copie.

Sonde « 4242 modules attendus », contre la production :

```
⛔ ÉCHEC — la base d'écriture n'est PAS celle du relevé.
   modules — attendu : 4242 · lu : 486
   ROLLBACK. Rien n'a été écrit.                      → sortie 1
```

Sonde retirée, fichier vérifié identique, et signaux recomptés à **0** avant le
vrai run.

## 8 · L'écriture, et un défaut d'idempotence

| Passage | Résultat |
|---|---|
| 1ᵉʳ | **12 posés · 0 déjà en place · 0 en échec** |
| 2ᵉ | ⚠️ **3 posés** · 9 déjà en place · 0 en échec |
| 3ᵉ | **0 posé · 12 déjà en place · 0 en échec** |
| 4ᵉ | **0 posé · 12 déjà en place · 0 en échec** |

**L'idempotence ne tombe pas au premier rejeu, et ce n'est pas anodin.**

Cause mesurée : `signalsAvant` est capturé pendant la phase de LECTURE, avant la
transaction. Trois modules sont visés **deux fois** — `drive:008#1`,
`drive:034#2`, `drive:034#3` — par deux douleurs différentes, donc deux signaux
différents. Les deux écritures partent du même `signalsAvant`, et la seconde
écrase la première : `[...[], signalB]` remplace `[...[], signalA]`.

Un run ne pose donc que 9 des 12 signaux ; le rejeu récupère les 3 perdus. L'état
converge au 2ᵉ passage et ne bouge plus.

**Pourquoi personne ne l'avait vu** : le run local du 16/09 ne posait qu'**un**
signal. Le défaut ne s'allume qu'à partir de deux cibles identiques dans le même
lot — et c'est le versement complet qui l'a produit.

**État final vérifié en base**, 9 modules porteurs, 12 signaux :

| `sourceRef` | signaux |
|---|---:|
| `drive:006#1`, `drive:012#2`, `drive:017#1`, `drive:017#3`, `drive:037#2`, `drive:047#20` | 1 chacun |
| `drive:008#1`, `drive:034#2`, `drive:034#3` | **2 chacun** |

C'est exactement la cible voulue. **Le défaut est dans le CHEMIN, pas dans
l'état** — mais un chemin qui demande deux passages pour être juste est un
chemin qui sera lancé une fois. Non corrigé, sur consigne : je mesure et j'écris.

## 9 · Le contrôle du 16/09 — l'unicité de `drive:047#20`

Le relevé du 16/09 laissait ce contrôle **non fait** : « `drive:047#20`
n'apparaît pas du tout dans le parcours de DIAG-R001 — zéro occurrence n'est pas
une seule occurrence. »

Fait aujourd'hui, sur le cas qui prouve quelque chose : **base LOCALE, dossier
`DIAG-0001`**, où `drive:047#20` porte **2 signaux** (celui du 11/09 sur le
*moment* de la demande, celui du 16/09 sur le *ratio* du barème).

| | |
|---|---|
| La douleur « avis en ligne » est-elle déclenchée ? | **oui** — « Nombre d'avis en ligne = 4 » |
| `drive:047#20` programmé | **1 fois** (demi-journée 6, 90 min) |
| Verdict | ✅ **l'unicité tient malgré les deux signaux** |

Le rayon `BIB-D047` place bien **deux modules** au parcours — « Faire des avis
clients une source de mandats » (120 min, demi-journée 4) et « Répondre aux avis
clients en ligne » (90 min, demi-journée 6). Ce ne sont **pas** deux
programmations du même module : deux modules distincts répondent au même besoin.

**Côté production, le contrôle n'est pas mesurable** : la base n'y porte qu'un
diagnostic (`DIAG-0001` — un dossier DIFFÉRENT de son homonyme local, §5.4), et
il ne déclenche pas la douleur « avis ». Zéro occurrence n'est pas une seule
occurrence : je ne conclus rien de ce dossier-là.

## 10 · Le témoin, après les rattachements

**39 codes** sur `/catalogue`, `diff` vide contre le relevé d'ouverture. Un
signal se pose sur un module, pas sur un produit : rien ne pouvait publier — et
rien n'a publié.

---

# Mesure (1) — que réécrit exactement un ré-import ?

_Lecture seule, dans une transaction `SET TRANSACTION READ ONLY` : Postgres
refuse lui-même toute écriture. Aucune correction apportée, sur consigne._

## a · Les champs du lot « 72 mis à jour »

L'import réécrit, **à chaque passage**, tout son payload :

| | Champs réécrits |
|---|---|
| **Produit** (72) | `title` · `durationHours` · `modality` · `objectives` · `programMd` · `prerequisites` · `targetAudience` · `theme` · `isActive` · `fundingType` · `sourceRef` |
| **Module** (400) | `sourceRef` · `order` · `title` · **`contentMd`** · `durationMin` · `family` · `excludedFromClientOutputs` |

`supersededByProductId` en est sorti depuis aujourd'hui : il se pose en phase 2
et ne se recalcule jamais.

**Diff réel base ↔ payload, mesuré ce jour : AUCUN écart** — ni sur les
72 produits, ni sur les 400 modules. « 72 mis à jour » réécrit aujourd'hui les
mêmes valeurs. C'est un no-op en contenu, pas en ordres : 472 `UPDATE` partent
quand même.

## b · Oui, `contentMd` est dans le lot — et l'écrasement est RÉEL

`doitProtegerLeContenu(enBase, entrant)` commence par `if (!entrantVide) return
false`. **La garde ne protège que du VIDE.** Vérifié en appelant la fonction,
pas en lisant son intention :

| Cas | Verdict |
|---|---|
| un humain réécrit le déroulé · le Drive a SON texte | ⚠️ **ÉCRASÉ** |
| un humain réécrit le déroulé · le Drive est VIDE | 🛡 protégé |
| la base ne porte que du boilerplate · Drive vide | ⚠️ écrasé (et c'est voulu) |

**Conséquence.** Le jour où Laurent réécrit un déroulé d'un module qui a un texte
au Drive, le ré-import suivant le remplace — et le rapport annoncera « 72 mis à
jour », ce qui a l'air d'une bonne nouvelle. C'est la forme exacte du défaut
qu'on traque : *une perte rendue par une affirmation positive.*

## c · La forme du garde-fou — proposition, PAS une implémentation

> L'import range, à côté de chaque champ qu'il écrit, l'**empreinte de ce que
> LUI a écrit** — le dépôt connaît déjà ce motif (`Document.sourceFingerprint`,
> migration du 02/09).
> Au ré-import, il compare l'empreinte mémorisée au contenu en base : si elles
> diffèrent, **quelqu'un est passé après lui**, et il ne reprend pas la main sur
> ce champ — il le NOMME dans son rapport, comme il nomme déjà les contenus
> protégés.
> La règle passe de « l'import ne vide jamais un contenu écrit » à « **l'import
> ne réécrit que ce qu'il a lui-même écrit** » — la seconde contient la première.

⚠️ **Non écrit, et c'est délibéré** : ça demande une migration, et le troisième
chantier (verser les modules rédigés) doit être lu par Laurent avant d'être
écrit — ces textes partent dans des programmes remis à des dirigeants et à des
financeurs.

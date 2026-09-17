# Les gardes d'écriture — lost update et garde d'écrasement

_17/09/2026. **Rien en production, rien sur `main`, aucune PR.** La migration est
écrite et testée sur des bases jetables ; elle attend d'être lue._

---

## 1 · Le lost update des rattachements — le jumeau de `drive:020`

### Le défaut, nommé

`ecrire-rattachements.ts` lisait l'état d'un module (`signalsAvant`) pendant la
phase de DÉCISION, donc **hors** de la transaction, et écrivait
`[...signalsAvant, signal]` **dedans**.

Trois modules sont visés par deux douleurs différentes — `drive:008#1`,
`drive:034#2`, `drive:034#3`. Leurs deux écritures partaient du même
`signalsAvant`, et la seconde écrasait la première.

C'est le bug `drive:020` sous un autre nom : **une lecture prise hors de la
transaction, utilisée pour décider dedans.**

### La correction

L'unité d'écriture n'est plus la DÉCISION, c'est le **MODULE**. Dans la
transaction, pour chaque module : relecture fraîche, puis accumulation de tous
ses signaux d'un coup, avec **deux** dédoublonnages — contre l'existant, et
contre le lot lui-même. Un `UPDATE` et un `AuditLog` par module, plus par
décision.

Et le résumé annonce ce qui a été **fait**, mesuré dans la transaction, plus ce
qui était voulu : c'est ce décalage qui cachait le défaut — le script disait
« 12 posés » quand il en avait posé 9.

### La preuve — un seul passage, sur une base repartie de zéro

Base `qualiof_preuve` créée vide : `migrate deploy` (31 + 1 migrations), seed,
import du catalogue Drive (72 rayons · 400 modules · **0 signal**).

```
═══ PASSAGE 1 ═══
  12 signal(aux) posé(s) · 0 déjà en place · 0 en échec
  (compté DANS la transaction, pas déduit de la lecture)

═══ PASSAGE 2 ═══
  0 signal(aux) à poser · 12 déjà en place · 0 en échec
```

État vérifié en base après le **premier** passage — 9 modules, 12 signaux :

| `sourceRef` | signaux |
|---|---:|
| `drive:006#1`, `drive:012#2`, `drive:017#1`, `drive:017#3`, `drive:037#2`, `drive:047#20` | 1 |
| `drive:008#1`, `drive:034#2`, `drive:034#3` | **2** |

Identique à ce que la production porte — mais en **un** passage, pas deux.

6 tests unitaires sur la fonction pure (`accumulerSignaux`), dont celui qui
rejoue le lot complet : 12 signaux sur 9 modules, en un passage.

**La production n'a pas été retouchée** : elle est déjà juste (9 modules,
12 signaux, vérifié). C'est le chemin qui était réparable, pas l'état.

---

## 2 · Le balayage — la même forme ailleurs

**Ce que j'ai cherché**, pour qu'on sache ce que ce relevé ne dit pas : une
LECTURE prise hors de la transaction, dont la valeur sert à CALCULER une
écriture faite dedans. 40 fichiers portent une transaction interactive.

### Confirmés — même forme, vérifiés à la lecture du code

| Fichier | Ce qui s'y passe | Sort |
|---|---|---|
| `apps/web/scripts/ecrire-rattachements.ts` | le cas d'origine | ✅ **corrigé** |
| `apps/web/scripts/ecrire-modules-rediges.ts` | `diagnosticSignals: [...signaux, opts.signal]` (l. 160 et 267), où `signaux` vient d'une lecture faite avant. **Et il n'y a AUCUNE transaction, ni aucun `AuditLog`, dans tout le fichier.** | ⛔ **non corrigé** |

> `ecrire-modules-rediges.ts` est le script du **troisième chantier**. Il relit
> le produit juste avant chaque écriture, donc la fenêtre de course est étroite
> — mais sans transaction, un échec à mi-parcours laisse des modules écrits et
> d'autres non, sans journal pour dire lesquels. À traiter **avant** de verser
> les modules rédigés, pas après.

### Nommés, non corrigés — décision prise sur une lecture extérieure

`invoices.ts` (l. 1163-1167) et `preinscription-reminders.ts` (l. 77-88) lisent
`reminderCount` hors transaction pour décider **s'il faut envoyer** et **à quel
niveau**, puis incrémentent par `{ increment: 1 }`.

Le compteur lui-même est atomique : **pas de lost update**. C'est la DÉCISION
qui est prise sur une lecture extérieure — deux exécutions simultanées peuvent
toutes deux franchir le garde et envoyer deux relances. Le risque est réel mais
d'une autre nature, et il croise la consigne en vigueur : la catégorie
« relances factures » reste décochée tant que Railway est en plan Hobby.

### Ce que le balayage ne prouve PAS

31 fichiers sur 40 portent une lecture avant leur transaction. **C'est un
criblage, pas un verdict** : la plupart lisent pour valider une entrée, puis
écrivent des valeurs qui ne dépendent pas de l'état lu. J'ai vérifié à la
lecture du code `sessions.ts` et `qualiopi-matrix.ts` (les deux plus chargés) —
ils écrivent depuis l'entrée validée, pas depuis un état antérieur. Les 27
autres **n'ont pas été lus un par un**.

---

## 3 · La garde d'écrasement

### La règle

L'import range l'empreinte de ce qu'**il** a écrit. Au passage suivant il
compare l'empreinte mémorisée au contenu en base : si elles diffèrent, un humain
a écrit après lui, et il ne reprend pas la main.

« L'import ne vide jamais un contenu écrit » devient « **l'import ne réécrit que
ce qu'il a lui-même écrit** » — la seconde contient la première.

### La migration — `20260917120000_module_empreinte_import`

```sql
ALTER TABLE "TrainingModule" ADD COLUMN "contentMdFingerprint" TEXT;
```

**Additive et nullable.** Aucune donnée existante n'est lue, écrite ni déplacée.
Les 486 modules de production passeraient à `NULL`, et c'est le bon état de
départ : `NULL` veut dire « l'import n'a rien à protéger ici », et il stampe au
prochain passage. Aucun index — cette colonne n'est jamais un critère de
recherche ; elle est lue après que le module a été retrouvé par son `sourceRef`,
qui est indexé.

`NULL` ne veut **pas** dire « protégé ». Confondre les deux aurait gelé tout le
catalogue existant.

**Contrôle de dérive** : `check:schema` sur une base jetable →
*« Aucune dérive : le schéma est exactement ce que les migrations produisent. »*

⚠️ **Non poussée.** Tout push sur `main` déclenche `prisma migrate deploy` sur la
prod Supabase. Elle est appliquée sur la base locale de dev et l'a été sur deux
bases jetables, supprimées depuis.

### Les trois conditions

**Il refuse et il nomme.** À l'écran :

```
⛔ 1 module(s) modifiés par un humain — NON RÉÉCRITS
   drive:017#1 « Maîtriser les techniques de découverte vendeur » — le déroulé…
```

En tête de rapport, dans « En un coup d'œil », et dans sa propre section avant
le détail — pas en note au milieu de 959 lignes.

**Il ne devine jamais.** Une vraie correction du Drive sur un module retouché à
la main donne deux versions légitimes qu'aucune règle ne peut départager — le
même arbitrage qu'entre deux rayons (D-19 bis). Le script nomme la paire avec
les deux tailles (« 111 car. en base, 257 au Drive ») et s'arrête là.

**Rougie avant d'être crue.** Sur la base `qualiof_preuve`, après que
l'empreinte a été posée sur les 400 modules :

| | |
|---|---|
| un humain réécrit `drive:017#1` | `UPDATE 1` |
| ré-import | ⛔ **1 module non réécrit** · le texte humain intact |
| ré-import encore | ⛔ **1 module non réécrit** — la protection ne s'use pas |

L'empreinte n'est **pas** rafraîchie quand le script refuse : sinon le passage
suivant croirait la base redevenue la sienne et écraserait. Tout le reste du
module (titre, ordre, durée) est mis à jour normalement — c'est le déroulé, et
lui seul, qui est laissé intact.

9 tests unitaires, dont « refuse ENCORE au passage suivant » et « ÉCRIT au tout
premier passage » — une garde qui refuserait le cas normal finirait débranchée.

### Portée, dite en toutes lettres

Elle couvre `TrainingModule.contentMd`, **et rien d'autre**. C'est là que vit le
travail rédactionnel et c'est la seule perte irréversible : les titres passent
déjà par un registre d'arbitrages explicite (`TITRES_TRANCHES`), et `order`,
`durationMin`, `family`, `excludedFromClientOutputs` se dérivent de la source
sans qu'un humain y écrive.

**Le `programMd` des rayons n'est PAS couvert** — un rayon n'est pas vendable et
personne ne l'édite aujourd'hui. Le jour où ça change, cette garde est la forme
à reprendre.

---

## 4 · Ce qui n'a pas été fait

- **Rien en production.** La colonne n'y existe pas ; l'import n'y a pas
  retourné.
- **Rien sur `main`**, aucune PR. La migration attend d'être lue.
- `ecrire-modules-rediges.ts` **n'est pas corrigé** — même forme, sans
  transaction ni journal. À traiter avant le troisième chantier.
- Le document de lecture des modules rédigés : il vient après la garde. Verser
  avant de protéger, c'est perdre le travail au prochain import.

---

# 5 · Après la fusion de PR A — la séquence, écrite d'avance

_Pour que la session suivante n'ait pas à la reconstruire. **Rien de tout ceci
n'est lancé** au 17/09._

## Ce que la fusion déclenche toute seule

`.github/workflows/deploy.yml` : tout push sur `main` lance
`prisma migrate deploy` contre la prod Supabase (`DATABASE_URL` + `DIRECT_URL`
en secrets). **La migration part donc à la fusion, sans que personne la lance.**

Elle est seule dans le diff de PR A — vérifié après rebase : aucun autre fichier
sous `prisma/migrations/`. Elle n'est plus « la première de toute la chaîne »
comme ce relevé le disait ce matin : `#92` a déployé
`20260917080000_product_pricing_mode` dans la journée et lui a pris ce titre.
Notre migration reste néanmoins la première que CETTE chaîne de travail produit.

**Attendu : 32 → 33 migrations.**

> #### Corrigé le 17/09/2026 (après-midi) — ce paragraphe annonçait « 31 → 32 »
>
> C'était exact le matin, quand la branche a été écrite : la production portait
> alors 31 migrations. Ça ne l'est plus. Laurent a fusionné `#92` dans la
> journée, qui a déployé `20260917080000_product_pricing_mode` — la production
> en porte **32**. Notre migration est donc la **33ᵉ**.
>
> Vérifié après rebase : `20260917120000` trie bien **après** `20260917080000`,
> donc `migrate deploy` l'applique dans le bon ordre et ne rejoue pas la leur.
>
> **Pourquoi la phrase d'origine est citée et non effacée** : un relevé qui
> réécrit ses chiffres en silence devient un document juste aujourd'hui et faux
> sur son propre passé (§4 sexdecies). Celui qui relira cette séquence doit
> pouvoir savoir ce que son auteur avait sous les yeux — et que le compte a
> bougé parce qu'une autre PR est passée entre-temps, ce qui est précisément le
> genre de chose qu'on veut voir.

## ① Vérifier le déploiement — avant de toucher à quoi que ce soit

| # | Contrôle | Attendu |
|---|---|---|
| a | migrations appliquées | **33**, dont `20260917120000_module_empreinte_import` |
| b | la colonne existe | `TrainingModule.contentMdFingerprint`, nullable, **486 NULL** |
| c | **le témoin** | `/catalogue` → **39 codes**, `diff` vide |
| d | les routes | `/catalogue` et `/diagnostic` → 200 **avec leur contenu** : titre, `<h1>`, 39 cartes pour l'un ; 1ʳᵉ question et ses 4 options pour l'autre |

```bash
pnpm --filter @qualiof/db run db:query:prod <fichier.sql>   # a et b
curl -s https://qualiof.vercel.app/catalogue \
  | grep -oE '<span class="shrink-0 text-xs font-mono[^"]*">[^<]+</span>' \
  | sed -E 's/.*">([^<]+)<.*/\1/' | sort -u | wc -l          # c → 39
```

Un 200 ne suffit pas : chercher dans le HTML l'absence de « Application error »,
« Internal Server Error » et de frontière d'erreur FR. ⚠️ Un grep sur « 500 » ou
« digest » rend des faux positifs (`text-slate-500`, `fontWeight: 500`) — c'est
arrivé le 17/09.

**Un écart, même de 1, sur le témoin : on s'arrête et on écrit à Laurent.**

## ② L'import complet — pour stamper les 486 modules

C'est l'étape ① du piège d'ordre (§4 sexies bis). Tant qu'elle n'a pas tourné,
les empreintes sont `NULL` et le versement des modules rédigés **sera refusé** —
par la garde, pas par une consigne.

Protocole complet, sans raccourci :

1. **dry-run** — `pnpm --filter @qualiof/db import:drive-catalog`
   Attendu : `0 créés · 72 mis à jour · 4 écartés · 400 modules`, cible PRODUCTION
   imprimée avec ses marqueurs. **0 module « modifié par un humain »** : personne
   n'a encore rien écrit.
2. ⛔ **STOP** — montrer le dry-run à Laurent. Rien ne s'écrit avant son go.
3. **apply** — `-- --apply`. La garde de cible relit les marqueurs en premier
   ordre ; une transaction, les deux phases dedans.
4. **idempotence** — rejouer : `0 créés · 72 mis à jour · 0 en échec`, et
   **aucun lien re-posé**.
5. **témoin** — `/catalogue` toujours à **39**.
6. **la preuve qui compte** : `contentMdFingerprint` non nul sur les **400**
   modules de rayon. C'est ce qui rend le versement suivant possible.

## ③ Seulement ensuite — les modules rédigés

Après lecture et arbitrage de Laurent sur
`.planning/260917-modules-rediges-a-relire.md`, et pas avant.

`ecrire:modules -- --apply` refusera de tourner tant que ② n'a pas tourné, en
nommant les cibles sans empreinte et en rappelant l'ordre. **C'est voulu.**

## Ce qui reste ouvert après tout ça

- **PR B ne se fusionne pas.** Elle porte les trois conditions de levée de la
  barrière Faros. Elle reviendra verte le jour où ce travail sera fait.
- `invoices.ts` et `preinscription-reminders.ts` décident d'envoyer une relance
  sur une lecture prise hors transaction — nommé, non corrigé (§2 de ce relevé).
- 27 des 40 fichiers portant une transaction n'ont pas été lus un par un.

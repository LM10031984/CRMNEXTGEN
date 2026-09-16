# La modalité déclarée à l'AGEFICE — relevé avant arbitrage

_16/09/2026. Lecture seule : aucune écriture en base, locale ou prod ; aucune
migration ; aucun fichier de `Formation Faros` touché._

## Ce que ce relevé a cherché

Les trois défauts de `splitDureeByModality`, et **de quoi dimensionner les deux
arbitrages** que la correction demande : que faire de `MIXTE`, et que faire du
`default`.

---

## 1 · Population

| Surface | Comment | Résultat |
|---|---|---|
| Lectures de `product.modality` | `grep` sur `apps/web/src`, hors `session.modality` et tests | **3** : `app/produits/page.tsx:231`, `app/produits/[id]/page.tsx:187`, `app/catalogue/page.tsx:300` |
| Pièces qui lisent la modalité | appelants de `splitDureeByModality` | `session.modality` **des deux côtés** (`agefice-generator.ts:232`, `agefice-attendance-generator.ts:162`) |
| Sessions en **PRODUCTION** | `db:query:prod`, `READ ONLY` + `ROLLBACK`, marqueur §4 sexies vérifié (`Start Academy` + 51 produits) | **373 sessions · 364 participants · 100 % `PRESENTIEL`** |
| Modules portant une répartition horaire | idem, `presentielCollectifHours` / `distancielSyncHours` / `distancielAsyncHours` | **0 sur 86** — les trois colonnes sont nulles partout |

---

## 2 · Ce que les mesures changent

### ① Les trois défauts sont entièrement LATENTS en production

**373 sessions sur 373 sont `PRESENTIEL`.** Toutes les pièces AGEFICE jamais
produites sont donc passées par la branche `PRESENTIEL`, qui est juste. Aucun
dossier parti à l'AGEFICE ne porte une heure inventée.

Ce n'est pas une raison de ne rien faire — c'est une raison de ne pas se
tromper de récit : **la mine est réelle, elle n'a pas explosé.** Elle s'amorce à
la première session non présentielle.

### ② Il n'existe AUCUNE source pour une répartition MIXTE

`TrainingModule` porte quatre colonnes d'heures par modalité. **Elles sont nulles
sur les 86 modules de la production.** Aucune session, aucun produit, aucun
module ne dit comment se répartissent les heures d'un parcours mixte.

La conséquence est nette, et elle ferme une option avant qu'on la propose :
**on ne peut pas « lire la vraie répartition », elle n'est écrite nulle part.**
Le `Math.round(total / 2)` actuel n'approxime pas une donnée connue — il en
invente une.

### ③ La portée du défaut `product.modality` était surévaluée

Corrigé dans le message d'échec du test faros ②. Programme, convention,
convocation, factures et les deux générateurs AGEFICE lisent **tous**
`session.modality`. `product.modality` n'est lu que par deux badges d'admin et
`/catalogue`, qui filtre `isActive: true` quand l'import pose `isActive: false`.
**Zéro pièce atteinte.**

---

## 3 · État du chantier au moment de l'arbitrage

| Étape | État |
|---|---|
| 1 · Tests RED sur les deux rendus | ✅ 9 tests, rouges |
| 2 · Déduplication | ✅ `lib/agefice/duree-par-modalite.ts`, source unique — **les 9 tests restent rouges**, la fusion n'a rien masqué |
| 3 · `ELEARNING` → `foadAsync`, et `MIXTE` | ⏸ **attend l'arbitrage** |
| 4 · Le `default` | ⏸ **attend l'arbitrage** |

Gates : `lint` et `tsc` à `exit=0`. `pnpm test` porte **12 rouges assumés**
(3 barrière Faros + 9 modalité AGEFICE) sur 3 879, consignés dans
`.planning/quick/260916-faros-barriere/deferred-items.md`.

---

## 4 · Ce que ce relevé n'a pas cherché

- **Pourquoi** les 373 sessions sont toutes présentielles : est-ce l'offre réelle
  de Start Academy, ou un défaut de saisie hérité de l'import SmartOF
  (`import-smartof-sessions.ts` pose `Modality.PRESENTIEL` en dur à deux
  endroits) ? La question n'est pas neutre — si c'est un défaut de saisie, une
  session réellement mixte aurait déjà été déclarée présentielle.
- Les dossiers AGEFICE **déjà déposés** : je n'ai pas vérifié ce que portent les
  PDF archivés dans MinIO, seulement ce que le code produirait aujourd'hui.

---

## 5 · Arbitrage rendu le 16/09/2026 (soir)

_On cite, on ne remplace pas. Le §3 disait des étapes 3 et 4 : « ⏸ **attend
l'arbitrage** ». Elles sont tranchées._

### Le `default` ne devient pas plus prudent — il DISPARAÎT

L'arbitrage a écarté mes deux propositions, et il avait raison de les écarter :
elles cherchaient toutes deux le bon comportement d'une branche **inatteignable**.
`TrainingSession.modality` est un enum **fermé et non nullable**
(`schema.prisma:582`, idem `:403` pour `TrainingProduct`), et les deux appelants
passent ce champ. Le paramètre était pourtant typé `string | null | undefined` :
**la branche `default` n'existait que parce que la signature avait ouvert un
ensemble fermé.**

Le `case 'BLENDED'` en était la preuve — cette valeur n'est dans aucun enum.
C'était du code mort invité par le typage.

Ce qui remplace le `default` n'est pas une branche : c'est un **contrôle
d'exhaustivité** (`const _exhaustif: never`). Une cinquième valeur de `Modality`
casse `tsc` **au build**, pas la génération devant un commercial.

> La leçon, et elle vaut au-delà d'ici : **avant de choisir le comportement d'un
> cas, vérifier qu'il peut se produire.** J'ai proposé deux options pour une
> branche que le type interdit.

### Les quatre cases, et celle que rien n'alimente

| Case AGEFICE | Alimentée par |
|---|---|
| Présentiel individuel | **rien** — voir ci-dessous |
| Présentiel collectif | `PRESENTIEL` |
| FOAD synchrone | `DISTANCIEL` — du distanciel **en direct** |
| FOAD asynchrone | `ELEARNING` — à son rythme |

`DISTANCIEL` et `ELEARNING` ne tombent pas dans la même case : l'AGEFICE
distingue le synchrone de l'asynchrone. Les confondre déclarerait au financeur
une nature de prestation autre que celle vendue.

**`presIndiv` vaut 0 pour les quatre modalités.** Ce n'est pas un oubli de la
correction : aucune prestation en présentiel individuel n'existe au catalogue,
et rien ne renseigne cette case. **Noté comme non alimentée, pas inventé** —
inscrit au différé avec `MIXTE`.

### `MIXTE` refuse, et son successeur est nommé

Le refus dit ce qui manque et quoi faire — **sans porter la mesure**. « 0 module
sur 86 » est un relevé daté ; un message d'erreur ne peut pas porter de date,
donc il ne porte pas de mesure. Le champ de répartition sur la session est
différé, condition de levée écrite : **la première session MIXTE vendue**.

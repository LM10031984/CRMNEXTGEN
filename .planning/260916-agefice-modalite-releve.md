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

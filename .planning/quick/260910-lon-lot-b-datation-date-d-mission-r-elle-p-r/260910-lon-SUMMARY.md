---
phase: quick/260910-lon
plan: 01
type: execute
subsystem: facturation
tags: [datation, numerotation, chronologie, qualiopi, e-invoicing]
requires:
  - "lot A (scripts/audit-invoice-chronology.ts) — l'inventaire du 10/09/2026"
  - "lot 1 e-invoicing — InvoiceLine, qui donne un domicile à la période"
provides:
  - "resolveInvoiceIssueDate (arité 0) — la facture se date du jour d'établissement"
  - "resolveInvoiceDueDate — l'échéance, ancrée sur l'émission"
  - "sequencePrefixOf + chronologyWarning — la sentinelle du §4"
  - "l'invariante chronologique §4, exécutable"
affects:
  - "lot 2 /facture-electronique (Factur-X) — la date figée dans le XML est désormais juste"
tech-stack:
  added: []
  patterns:
    - "la transaction rend un couple { invoice, alert } plutôt que d'affecter une variable extérieure"
    - "sentinelle lue DANS la transaction, après le numéro et avant le create"
key-files:
  created:
    - apps/web/src/lib/invoice-chronology.ts
    - apps/web/src/lib/__tests__/invoice-chronology.test.ts
    - apps/web/src/lib/__tests__/numbering.chronology.test.ts
    - apps/web/src/lib/__tests__/invoice-template.periode.test.ts
  modified:
    - apps/web/src/lib/invoice-dates.ts
    - apps/web/src/lib/__tests__/invoice-dates.test.ts
    - apps/web/src/server/actions/invoices.ts
    - apps/web/src/server/actions/__tests__/invoices-audit.test.ts
    - apps/web/src/lib/einvoice/invoice-snapshot.ts
    - apps/web/scripts/audit-invoice-chronology.ts
    - apps/web/src/components/invoices/create-invoice-button.tsx
    - apps/web/src/components/invoices/create-sponsor-invoice-button.tsx
    - apps/web/src/components/dossiers-opco/emit-invoice-button.tsx
decisions:
  - "D-1 : le paramètre sessionEndDate est retiré, la fonction reste — elle est le domicile nommé de la règle et de son histoire"
  - "D-2 : la sentinelle se calcule dans la transaction d'émission et informe après coup — pas de pré-vol, pas de modale"
  - "D-3 : le filet ne réutilise pas les helpers du script du lot A — src/ ne doit pas dépendre de scripts/"
metrics:
  tasks_completed: 3
  tasks_total: 4
  commits: 3
  files_changed: 13
  tests_added: 32
---

# Quick 260910-lon : Lot B — datation des factures

Une facture se date désormais du jour où on l'établit, la période réelle de
formation vivant sur la ligne et dans le bloc désignation ; la numérotation
redevient chronologique par construction, une invariante testée le dit, et une
sentinelle informe si elle est malgré tout franchie.

## Ce qui change pour l'utilisateur

**Avant.** Le numéro était attribué à l'instant du clic, la date venait de la
fin de session : deux horloges. Facturer en septembre une session de juin
produisait `FAC-000021` daté du 12 juin juste après `FAC-000020` daté du
3 septembre. L'inventaire du 10/09/2026 a mesuré **5 ruptures sur 31 pièces**.

**Après.** Une session terminée en juin, facturée en septembre, porte une date
d'émission de septembre. La période réelle de la formation reste lisible à deux
endroits : sur la ligne (`InvoiceLine.label`, depuis le lot 1) et dans le bloc
désignation du PDF (« Dates : du 01/06/2026 au 03/06/2026 »). Le délai de
paiement continue de courir depuis le jour d'émission réel — une facture
rattrapée ne naît pas en retard, le cron de relances ne part pas tout seul.

La facturation à l'inscription (wizard étape 5, session non terminée) est
**inchangée** : elle datait déjà du jour, elle date toujours du jour.

## Tâches réalisées

| # | Tâche | Commit |
|---|---|---|
| 1 | RED — les tests qui disent la règle cible | `c56b768` |
| 2 | GREEN — la règle de datation, et son histoire écrite | `851f79f` |
| 3 | GREEN — le filet, qui informe et ne bloque pas | `de80c13` |
| 4 | Checkpoint — gates + relecture d'un PDF | **pour Laurent** (voir plus bas) |

## Discipline RED→GREEN : la preuve du rouge

Le plan (P-1) avertissait qu'aucune assertion de **valeur** sur
`resolveInvoiceIssueDate` ne pouvait être rouge : l'ancienne implémentation
`(sessionEndDate, now = new Date()) => …` rendait l'argument reçu, donc
`resolveInvoiceIssueDate(CLIC) === CLIC` passait déjà. Le rouge a donc été porté
par trois faits structurels. Sorties capturées avant le GREEN :

```
× resolveInvoiceIssueDate > n'a PLUS de paramètre « fin de prestation »
  → expected 1 to be +0                        (Function.length : le paramètre existe encore)

× invoices.ts > aucun appel `resolveInvoiceIssueDate(session.endDate)` ne subsiste
  → expected '...' not to match /resolveInvoiceIssueDate\(\s*session\./

× invoices.ts > l'échéance est ancrée sur l'émission
  → expected '...' not to match /dueDate: new Date\(Date\.now\(\) \+ d…/

× resolveInvoiceDueDate > compte 30 jours depuis l'émission qu'on lui passe
  → TypeError: resolveInvoiceDueDate is not a function      (l'export n'existe pas)

FAIL src/lib/__tests__/invoice-chronology.test.ts
  → Failed to load url ../invoice-chronology. Does the file exist?   (le module n'existe pas)

Test Files  3 failed (3)
     Tests  12 failed | 2 passed (14)
```

Les 2 tests verts au rouge sont exactement les deux assertions de valeur que
P-1 annonçait comme tautologiques : elles sont là pour **se lire**, pas pour
prouver le changement. Chaque échec s'explique par une absence réelle — aucun
n'est une faute de frappe.

Après GREEN : `72 passed` sur les cinq fichiers de la vérification tâche 2,
`58 passed` sur ceux de la tâche 3.

## Décisions appliquées

**D-1 — le paramètre part, la fonction reste.** `resolveInvoiceIssueDate()` au
point d'appel doit se lire « il y a une règle ici, va la lire ». L'en-tête du
fichier porte l'histoire complète, comme la spec §7 le demandait : ce que la
règle du 13/08/2026 était, ses **deux motifs réels** (la mention manuscrite de
Laurent ; éviter la contradiction « Date » en haut / « Fait à … le … » en bas),
pourquoi elle est révisée (5 ruptures mesurées + le Factur-X qui va figer cette
date dans un XML d'État), et pourquoi ses deux motifs sont **éteints, pas
contournés** (l'app émet la pièce ; les deux dates valent désormais le même
jour). La garde anti-date-future disparaît avec le paramètre — elle n'a plus
d'objet, et le commentaire le dit.

**D-2 — la sentinelle informe après coup.** Lue dans la transaction, après
`getNextInvoiceNumber` et avant `tx.invoice.create` (P-4 : après le create, le
« prédécesseur » serait la pièce qu'on vient d'écrire). Pas de pré-vol, pas de
modale de confirmation. La transaction rend un couple `{ invoice, alert }`
plutôt que d'affecter une variable extérieure : une transaction peut être
rejouée, une écriture hors de son périmètre ne se rejoue pas proprement.

**Note honnête, écrite dans le module :** avec la règle corrigée, cette alerte
**ne peut plus se déclencher en usage normal** — toute pièce est datée
d'aujourd'hui, donc jamais antérieure à une pièce passée. C'est une sentinelle,
pas un contrôle courant. Elle ne parlera que si une date a été posée à la main
en base ou si quelqu'un réintroduit une datation dérivée. Son silence permanent
est le résultat attendu, pas le signe d'un code mort.

**D-3 — pas de réutilisation des helpers du lot A.** `sequencePrefixOf` duplique
les ~4 lignes de `parseSequenceNumber` plutôt que d'importer un fichier de
`scripts/` qui charge `prisma` au premier niveau. L'en-tête du nouveau module le
dit : même arithmétique, deux consommateurs distincts (inventaire hors ligne vs
sentinelle dans le chemin d'écriture).

## Déviations par rapport au plan

**Une seule, et c'est un défaut de mon test, pas du code.**

**[Rule 1 — Bug] Le filtre du test structurel `issueDate:` était trop naïf**
- **Trouvé pendant :** tâche 2, à la vérification
- **Problème :** mon test parcourait toutes les lignes `issueDate:` du fichier
  en excluant seulement `invoice.issueDate`. Il attrapait donc `issueDate: true`
  (un `select` Prisma, l. 829) et échouait dessus. Le code d'émission, lui,
  était juste.
- **Correction :** le test cible maintenant les corps des deux fonctions
  `createInvoiceFromParticipant` et `createInvoiceForSponsorGroup`, avec le même
  mécanisme de découpe que `invoices-audit.test.ts`. Il vérifie en plus que
  l'émission est calculée **une seule fois avant la transaction**, ce que la
  version naïve ne disait pas.
- **Vérifié au passage :** `createCreditNote` (l. 982) écrit
  `issueDate: new Date()` — l'avoir était **déjà** daté du jour et n'a jamais
  tiré sa date de la session. Conforme au point 4 du plan (l'avoir ne porte pas
  de période, elle vit sur la facture d'origine qu'il nomme). Laissé intact.
- **Commit :** `851f79f`

**Relâchement délibéré, prévu au plan (P-2), pas une régression.**
`invoices-audit.test.ts` l. 121 et 126 assertaient la chaîne EXACTE
`return { ok: true, … number: invoice.number }`, accolade fermante comprise.
Le `warning` optionnel faisait tomber le `}`. Les deux regex tolèrent désormais
`number: invoice\.number[,}]`, avec un commentaire de six lignes qui dit
pourquoi : un champ optionnel est **additif**, il ne casse aucun appelant, et
les quatre champs historiques restent vérifiés. Le test garde son rôle
d'anti-régression de signature.

## Gates

| Gate | Résultat |
|---|---|
| `pnpm lint` | ✅ vert (2 warnings préexistants, hors périmètre : `parametres/page.tsx` alt-text, `use-autosave.ts` exhaustive-deps) |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | ⚠️ 2 erreurs, **identiques au baseline pris avant toute modification** — voir ci-dessous |
| `pnpm test` | ✅ 261 fichiers, **2441 tests passés** + 2 skipped (baseline : 258 fichiers / 2409 tests) |

**Sur `tsc` — un point à consigner, deux choses distinctes.**

1. **Le bruit `.next/` (préexistant, non touché — règle de sécurité 5).**
   `.next/types/link.d 2.ts` : `TS6200` + `TS1038`. Artefacts Finder dupliqués
   (le « 2 » dans le nom de fichier). Présents avant mes modifications, présents
   après, à l'identique. **Zéro erreur dans `src/` ou `scripts/`.**

2. **Un client Prisma périmé, corrigé sans toucher à aucune base.**
   Au baseline, `tsc` sortait **9 erreurs supplémentaires** dans `src/`
   (`signatoryName`, `signatoryEmail`, `signatoryTitle`, `signatoryOrder`,
   `signedPdfUrl` inconnus de `@prisma/client`). Le client généré était en
   retard sur `schema.prisma` — vestige du merge de `main`. Résolu par
   `pnpm --filter @qualiof/db exec prisma generate`, qui **ne touche aucune
   base** (quick.md §4 l'autorise explicitement : « il ne fait que régénérer le
   client TypeScript »). Aucune migration, aucun `db push`, aucune commande
   contre `DATABASE_URL`.

**Aucun test n'échouait avant mes modifications** — le baseline était
258/258 fichiers verts. Aucun test n'échoue après. Rien n'a été « réparé au
passage ».

## Garde-fous respectés

- ✅ **`docs/comptabilite/note-chronologie-factures-2026.md` NON MODIFIÉ.**
  Vérifié : `git diff --name-only HEAD~3..HEAD | grep docs/comptabilite` → vide.
  Action **post-merge**, voir ci-dessous.
- ✅ **Aucune écriture en base.** `git diff HEAD~3..HEAD | grep -E '\.update\(|\.updateMany\(|\.upsert\(|\.delete\(|\.deleteMany\(|\$executeRaw'` → aucune.
  Les deux seuls `.create(` ajoutés sont les `tx.invoice.create` existants,
  renommés `created` parce que la transaction rend maintenant un couple.
- ✅ **Aucune migration Prisma.** `git status --porcelain packages/db/prisma/migrations/` → vide. Aucun champ nouveau n'était nécessaire.
- ✅ **Aucune commande contre `DATABASE_URL`.** Aucun script exécuté contre la prod Supabase.
- ✅ **`prisma db push` jamais lancé.**
- ✅ **Lot C intact.** Les 5 ruptures du parc restent telles quelles. Aucun backfill, aucun script de reprise.
- ✅ **`apps/web/tsconfig.tsbuildinfo` laissé non stagé** (artefact tracké, modifié par les runs `tsc`).
- ✅ **13 fichiers touchés, exactement ceux que le plan déclarait.**

## Vérification du plan

```
# Plus aucun appel ne passe session.endDate — les 2 appelants de production :
apps/web/src/server/actions/invoices.ts:271:  const emission = resolveInvoiceIssueDate();
apps/web/src/server/actions/invoices.ts:572:  const emission = resolveInvoiceIssueDate();

# La période vit toujours dans le label de ligne :
invoice-snapshot.ts:346:  const periode = debut && fin ? (debut === fin ? `le ${debut}` : `du ${debut} au ${fin}`) : null;
invoice-snapshot.ts:355:      periode,

# Aucune migration, aucun script de reprise : OK
```

---

# ⏸ Tâche 4 — checkpoint pour Laurent

Les trois gates sont passées (ci-dessus). Il reste **la relecture d'un PDF à
l'œil**, que la spec §7 exige explicitement : « Le lot B touche le gabarit de
facture : regarder un PDF produit, pas seulement les tests. » Ce n'est pas
automatisable — c'est un jugement visuel.

## 1. Un PDF sur une session DÉJÀ TERMINÉE — le cas qui change

Émets une facture depuis l'app sur une session dont la date de fin est passée,
puis ouvre le PDF. Dans cet ordre :

| # | Où regarder | Attendu |
|---|---|---|
| 1 | En-tête, bloc de droite, `Date:` | **Le jour d'aujourd'hui** — plus la fin de session. C'est le changement. |
| 2 | Bloc désignation, `Dates :` | La **période réelle de la formation**, inchangée (`du JJ/MM/AAAA au JJ/MM/AAAA`, ou `le JJ/MM/AAAA` si journée unique). |
| 3 | `Date d'échéance` | Aujourd'hui + 30 jours. **Jamais une date déjà passée.** |
| 4 | Le numéro | Le suivant de la séquence, sans trou. |
| 5 | Lisibilité d'ensemble | `Date` (émission) et `Dates` (formation) coexistent maintenant **avec des valeurs différentes** sur la même page. Avant ce lot, elles se recouvraient. |

**Sur le point 5 — je n'ai rien tranché, délibérément.** `invoice-template.ts`
n'a pas été modifié : la spec §3 situe la date d'émission exactement sous le
libellé « Date », et changer un libellé de gabarit de facture est ta décision,
pas la mienne. **Si l'ambiguïté `Date` / `Dates` gêne à l'œil, dis-le** — c'est
une ligne à changer, mais elle t'appartient.

## 2. Facturation à l'inscription — la garde à ne pas casser

Émets une facture depuis **le wizard étape 5**, sur une session **non terminée**.

- Attendu : `Date:` = aujourd'hui — comportement strictement **inchangé** (il
  retombait déjà sur le jour courant via la garde anti-date-future).
- La ligne doit porter la période **prévisionnelle** de la session.

## 3. La sentinelle — ne cherche pas à la voir parler

En usage normal elle ne se déclenchera pas, et c'est le but (cf. D-2). Sa
couverture est unitaire (12 tests). **Ne fabrique pas une rupture en base pour
la voir** — ce serait justement l'écriture manuelle qu'on cherche à détecter.

---

# ⚠️ Action POST-MERGE — à ne PAS faire maintenant

`docs/comptabilite/note-chronologie-factures-2026.md` §4 (~l. 91-93) dit
aujourd'hui que la correction « n'est pas encore déployée à la date de la
présente note ».

C'est une **pièce opposable** : elle doit dire le vrai. Son encadré de statut se
met à jour une fois le lot B **déployé** — c'est-à-dire **mergé sur `main` et
parti en production** — et **pas** au moment du commit sur une branche
(spec §7, ⚠ explicite). Le fichier n'a donc **pas** été touché dans ce lot.

**À faire après le merge et le déploiement**, pas avant.

# Mis de côté

1. **Redondance cosmétique du gabarit** — `invoice-template.ts` l. 293-295
   affiche trois fois « Formation : {titre} » dans le bloc désignation (une fois
   l. 279 en `formation-line`, puis deux fois de suite l. 293 et 294, la seconde
   avec la durée). Antérieure à ce lot et sans rapport avec lui. **Non corrigée**,
   conformément au point 5 du plan — signalée, c'est tout.

2. **Le libellé « Date » de l'en-tête** — laissé tel quel (voir point 5 du
   checkpoint ci-dessus). À trancher par Laurent après relecture du PDF.

3. **Les 2 warnings ESLint préexistants** (`parametres/page.tsx` alt-text,
   `use-autosave.ts` exhaustive-deps) — hors périmètre, non touchés.

4. **Le bruit `tsc` des artefacts Finder dupliqués** dans `.next/` — hors
   périmètre par consigne explicite, non touché.

## Self-Check: PASSED

Fichiers créés — tous présents :
- `apps/web/src/lib/invoice-chronology.ts` ✓
- `apps/web/src/lib/__tests__/invoice-chronology.test.ts` ✓
- `apps/web/src/lib/__tests__/numbering.chronology.test.ts` ✓
- `apps/web/src/lib/__tests__/invoice-template.periode.test.ts` ✓

Commits — tous présents dans `git log` :
- `c56b768` ✓ · `851f79f` ✓ · `de80c13` ✓

Contraintes — toutes vérifiées :
- note comptable non touchée ✓ · zéro écriture en base ✓ · zéro migration ✓
- `tsconfig.tsbuildinfo` non stagé ✓ · 13 fichiers, ceux du plan ✓

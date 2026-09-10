---
phase: quick-260910-jut
plan: 01
subsystem: einvoice / facturation
tags: [tva, vatex, en16931, facture-electronique, refactor]
requires:
  - InvoiceLine.vatExemptionReasonCode (colonne posée au lot 1, inchangée)
  - InvoiceLine.vatExemptionReasonText (idem)
provides:
  - MENTION_EXONERATION_TVA (source unique de la mention d'exonération)
  - CODE_VATEX_EXONERATION_TVA (VATEX-EU-132-1I)
  - garde anti-duplication par scan des sources
affects:
  - facture, avoir, convention, programme, proposition, devis, page catalogue
tech-stack:
  added: []
  patterns:
    - "constante fiscale isolée dans son propre module, hors catalogue-constants"
    - "garde de non-duplication écrite en test (readFileSync) plutôt qu'en consigne"
key-files:
  created:
    - apps/web/src/lib/tva-exoneration.ts
    - apps/web/src/lib/__tests__/tva-exoneration.test.ts
  modified:
    - apps/web/src/lib/einvoice/invoice-snapshot.ts
    - apps/web/scripts/backfill-invoice-lines.ts
    - packages/db/prisma/schema.prisma
    - .planning/specs/2026-09-02-facturation-electronique-pa.md
    - .planning/handoff/2026-09-03-facture-lot1.md
decisions:
  - "D-2 tranchée le 10/09/2026 par Laurent, sans expert-comptable : VATEX-EU-132-1I"
  - "Code ET texte posés, alors que BR-E-10 n'exige que l'un des deux"
  - "Repli écrit d'avance : si le validateur refuse le code au lot 2, on garde le texte seul"
metrics:
  commits: 2
  tests_added: 9
  files_unified: 13
  migrations: 0
  completed: 2026-09-10
---

# Quick 260910-jut : D-2 tranchée, mention TVA unifiée — Summary

Le code VATEX `VATEX-EU-132-1I` est désormais posé sur chaque ligne de facture
exonérée, et la mention fiscale qui existait en huit formulations n'a plus qu'une
seule source, gardée par un test.

## Ce qui change pour un utilisateur

**Une seule phrase, partout.** La facture, la convention, le programme, la
proposition, le devis et la page catalogue affichent tous exactement
`TVA non applicable en vertu de l'article 261-4-4° du CGI`, caractère pour
caractère. Avant, un même client pouvait lire quatre formulations différentes
selon le document reçu.

**Le seul changement visible côté client** est sur la **proposition** et le
**devis**, qui passent de la formulation longue
(« TVA non applicable — article 261-4-4° a du Code général des impôts (activité
de formation professionnelle exonérée). ») à la formulation courte retenue.

**Le PDF de facture est inchangé au caractère près** : la formulation retenue est
exactement celle qu'il imprimait déjà (`invoice-template.ts:313`, octets vérifiés
au `hexdump` — apostrophe droite U+0027, degré U+00B0).

**Invisible mais structurant** : toute facture ou tout avoir émis à partir de
maintenant porte, sur chaque ligne exonérée, le code `VATEX-EU-132-1I` en plus du
texte. Une ligne à TVA non nulle (catégorie S) ne porte ni l'un ni l'autre.

## Les 31 InvoiceLine déjà en base : inchangées, volontairement

Elles portent l'ancienne phrase (`TVA non applicable, art. 261-4-4° du CGI.`) et
`vatExemptionReasonCode = null`. **Aucun `UPDATE`, aucun script de backfill,
aucun `--fix` n'a été écrit.** C'est l'instantané figé de pièces émises, et le
code de commerce interdit de le réécrire — une facture émise s'annule par avoir,
elle ne se corrige pas.

Ce qui rassure : **leur PDF, lui, portait déjà la bonne phrase.** Le décalage
existant n'était pas entre le document et la loi, mais entre la *ligne en base*
(l'ancien `MENTION_TVA`, avec virgule et point) et le *PDF* (la phrase longue).
Après ce lot, les deux disent la même chose pour toute nouvelle pièce ; pour les
anciennes, le PDF fait foi et il était déjà correct.

`backfill-invoice-lines.ts` pose bien le code, mais il ne crée des lignes que
pour les factures qui en ont **zéro** (`lines: { none: {} }`) — ce n'est pas une
réécriture. Son en-tête le dit maintenant explicitement, pour que le prochain
lecteur n'ait pas à le déduire du `where`.

## Le repli D-2, écrit là où on le relira

Le validateur de la plateforme tranche au lot 2 (`POST /validation_reports`,
étape obligatoire avant `POST /invoices`). **S'il refuse le code, on garde le
texte seul** — on ne cherche pas un autre code, on ne bricole pas.

Cette phrase est écrite à trois endroits volontairement : en commentaire dans
`invoice-snapshot.ts` (au point où le code est posé), dans la spec §175, et dans
le handoff §6. Elle évite qu'un successeur repasse une demi-journée sur la liste
VATEX.

Justification du code retenue et consignée : l'art. 261-4-4°a du CGI transpose
l'art. 132-1-i de la directive TVA (formation professionnelle dispensée par un
organisme reconnu), que la liste VATEX de l'EN 16931 code `VATEX-EU-132-1I`. La
règle **BR-E-10** n'exige que **l'un des deux** (code *ou* texte) : on met les
deux, le texte restant lisible par un humain là où le code ne l'est pas.

## À retenir pour plus tard (D-J5)

`Tenant.vatExemptionText` reste prioritaire sur la constante — c'est un override
légitime par organisme. Le champ n'est **pas** exposé dans `/app/parametres`
aujourd'hui (vérifié : aucun `vatExemptionText` dans `app/app/parametres/`).

**Le jour où l'écran Paramètres exposera ce champ, son placeholder devra
afficher `MENTION_EXONERATION_TVA`, pas une variante écrite à la main.** C'est
exactement l'erreur qui a produit les huit formulations.

Le **code VATEX**, lui, n'est surchargeable par personne : ni colonne, ni champ
tenant, ni paramètre. Un OF à un autre régime porterait une autre catégorie que
`E`, ce que `vatCategoryFor()` sait déjà faire.

## La preuve du problème : la garde, au rouge

Discipline RED→GREEN respectée en deux temps.

**RED 1 — le module n'existe pas** (`vitest run src/lib/__tests__/tva-exoneration.test.ts`) :

```
FAIL  src/lib/__tests__/tva-exoneration.test.ts
Error: Failed to load url ../tva-exoneration (resolved id: ../tva-exoneration).
       Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

**RED 2 — le module existe, la garde parle.** Le plan annonçait 10 fichiers
fautifs ; le scan en a trouvé **13** :

```
AssertionError: expected [ …(13) ] to deeply equal []

  src/components/dossiers-opco/emit-invoice-button.tsx:114  (TVA non applicable — art. 261-4-4° CGI)
  src/components/quotes/quote-header-editor.tsx:124  placeholder="Paiement à 30 jours fin de mois.&#10;Formation exonérée de TVA (art. 261-4-4° CGI)."
  src/lib/catalogue-constants.ts:12  export const MENTION_TVA = "TVA non applicable, art. 261-4-4° du CGI.";
  src/lib/convention-template.ts:353  <p>Le prix de l'action de formation s'élève à …
  src/lib/einvoice/__tests__/invoice-snapshot.test.ts:166  vatExemptionText: 'TVA non applicable, art. 261-4-4° du CGI.',
  src/lib/einvoice/__tests__/invoice-snapshot.test.ts:205  expect(line!.vatExemptionReasonText).toBe('TVA non applicable, art. 261-4-4° du CGI.');
  src/lib/invoice-template.ts:313  <div class="row">T.V.A. non applicable ou exonérée<br>TVA non applicable en vertu de l'article 261-4-4° du CGI</div>
  src/lib/programme-template.ts:541  <span style="…">— TVA non applicable en vertu de l'article 261-4-4° du CGI.</span>
  src/lib/proposition/quotes.ts:38  'TVA non applicable — article 261-4-4° a du Code général des impôts (activité de formation professionnelle exonérée).';
  src/lib/proposition/templates/proposition-template.ts:322  … (TVA non applicable — article 261-4-4° a du CGI, activité de formation exonérée) …
  src/lib/qualiopi-bilan-stats.ts:32  prixTTC: number; // somme priceHT × participants (TVA non applicable selon CGI 261-4-4°)
  src/server/actions/quote-from-rdv.ts:54  /** 0 par défaut : formation professionnelle exonérée de TVA. */
  scripts/_create-optimmo-152h.ts:463  vatRate: new Prisma.Decimal(0), // TVA non applicable art. 261-4-4° CGI (régime constaté)
```

**RED 3 — le code VATEX** (`vitest run src/lib/einvoice/__tests__/invoice-snapshot.test.ts`) :

```
 × lignes de facture > exonéré ⇒ catégorie E, le CODE VATEX et le texte (D-2 tranchée le 10/09/2026)
   → expected null to be 'VATEX-EU-132-1I' // Object.is equality
 × lignes de facture > le code ne dépend PAS du texte : un override tenant ne le déplace pas
   → expected null to be 'VATEX-EU-132-1I' // Object.is equality
 × ligne d'avoir > exonéré ⇒ MÊME code et MÊME texte qu'une ligne de facture
   → expected null to be 'VATEX-EU-132-1I' // Object.is equality
      Tests  3 failed | 33 passed (36)
```

## Décompte de tests

| | Fichiers | Tests |
|---|---|---|
| Avant | 242 | 2 252 |
| Après | 243 | 2 261 passés, 2 skippés |

+9 tests : 6 dans `tva-exoneration.test.ts` (5 de valeur + la garde), 3 dans
`invoice-snapshot.test.ts` (code indépendant du texte, avoir exonéré, avoir taxé).
`invoice-snapshot.test.ts` passe de 33 à 36 tests. Aucun test supprimé, aucun
test existant cassé.

## Gates

| Gate | Résultat |
|---|---|
| `pnpm lint` | ✅ vert (3/3 tasks) — 2 warnings préexistants sans rapport (`parametres/page.tsx` alt-text, `use-autosave.ts` exhaustive-deps) |
| `pnpm --filter @qualiof/web exec tsc --noEmit` | ⚠️ **2 erreurs préexistantes, aucune dans le code source** — voir ci-dessous |
| `pnpm test` | ✅ vert — 2 261 passés, 2 skippés, 243 fichiers |

**Sur `tsc`** — les deux seules erreurs pointent `.next/types/link.d 2.ts`
(TS6200 + TS1038) : un doublon Finder d'artefact de build, daté du **3 septembre
12:19**, dans un répertoire gitignoré (`.gitignore:6 .next/`). Il ne peut pas
provenir de ce lot, et **aucune erreur ne concerne un fichier source suivi par
git**. Non corrigé, conformément à la consigne. Le nettoyage serait
`rm "apps/web/.next/types/link.d 2.ts"` — geste à faire à froid, hors de ce lot.

## Écarts par rapport au plan

**1. [Rule 3 — bloquant] `quote-from-rdv.ts:54` reformulé, alors que le plan le
plaçait hors périmètre.**
Le plan listait ce commentaire parmi ceux qui « sont exacts et le restent ». Mais
il contient `formation professionnelle exonérée de TVA`, qui matche la seconde
regex de la garde (`/exonérée de TVA/`) : la garde ne pouvait pas passer au vert
sans le traiter. Même traitement que les sites #9 et #10 du plan, pour la même
raison. Reformulé en
`0 par défaut : formation professionnelle exonérée (art. 261-4-4° CGI).` —
commentaire JSDoc, zéro changement de comportement.
Alternative écartée : ajouter une exception nominative dans la garde, ce qui
l'aurait affaiblie pour épargner une ligne de commentaire.

**2. La garde trouve 13 fichiers, pas 10.** Le relevé `grep` du plan comptait 10
sites ; le scan complet en trouve 13 (`invoice-snapshot.test.ts` compte pour deux
lignes, et `quote-from-rdv.ts` s'ajoute). Aucun n'a été laissé de côté.

**3. `catalogue/page.tsx` — le point final ajouté dans le template.**
L'ancien `MENTION_TVA` se terminait par un point, et les deux usages du catalogue
sont des phrases complètes. Rendu à l'identique via `{MENTION_EXONERATION_TVA}.`
— c'est exactement D-J4 (la constante ne ponctue pas, l'appelant si).

**4. `proposition/quotes.ts` — une constante privée `MENTION_PONCTUEE`.**
`buildQuoteNotes` utilisait `VAT_EXEMPTION_NOTE` à deux endroits, dans un bloc de
notes où toutes les autres lignes se terminent par un point. Plutôt que de
répéter `` `${MENTION_EXONERATION_TVA}.` `` deux fois, une constante *locale*
(non exportée) porte la version ponctuée. La source reste unique ; seule la
ponctuation est locale, conformément à D-J4.

## Ce qui a été mis de côté

- **Les 31 lignes en base** — cf. section dédiée. Décision, pas oubli.
- **Aucune migration Prisma.** Les seuls changements de `schema.prisma` sont des
  commentaires `///` (deux blocs). `prisma format` passé,
  `git status --short packages/db/prisma/migrations` **vide**. `prisma db push`
  n'a jamais été appelé, et aucune commande n'a touché `DATABASE_URL`.
- **Le PDF de facture ne lit toujours pas `InvoiceLine.vatExemptionReasonText`.**
  `invoice-template.ts` continue d'interpoler la constante. Brancher le rendu sur
  le snapshot gelé, c'est le chantier E-1, pas celui-ci.
- **`T.V.A. non applicable ou exonérée`** (`invoice-template.ts:313`) laissé tel
  quel : c'est le libellé de rubrique normalisé d'une facture française, pas la
  mention. Il ne matche pas la garde (points d'abréviation) — D-J10.
- **`invoice-dates.ts` et `audit-invoice-chronology.ts`** : pas touchés (autre
  spec, autre lot).
- **`apps/web/tsconfig.tsbuildinfo`** : modifié par les runs `tsc`, laissé
  **non stagé** comme demandé.
- **`.planning/STATE.md` et `ROADMAP.md`** : non modifiés, Laurent s'en charge.

## À vérifier à la main

Rien de bloquant. Deux regards utiles au prochain rendu :

1. **Un devis et une proposition PDF** — c'est la seule surface où le texte
   change visiblement pour un client (formulation longue → courte).
2. **Le placeholder « Notes / mentions bas de devis »** dans l'éditeur de devis :
   l'entité HTML `&#10;` est devenue un vrai `\n` (une entité n'est décodée que
   dans un attribut JSX *littéral*, jamais dans une expression `{…}`) — le saut
   de ligne doit toujours s'afficher.

## Commits

| # | Hash | Message |
|---|---|---|
| 1 | `5af0740` | `refactor(tva): une seule phrase d'exonération, une seule constante` |
| 2 | (ce commit) | `feat(einvoice): D-2 tranchée — code VATEX-EU-132-1I sur les lignes exonérées` |

---
phase: quick-260910-jut
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/tva-exoneration.ts
  - apps/web/src/lib/__tests__/tva-exoneration.test.ts
  - apps/web/src/lib/catalogue-constants.ts
  - apps/web/src/app/catalogue/page.tsx
  - apps/web/src/server/actions/invoices.ts
  - apps/web/src/lib/invoice-template.ts
  - apps/web/src/lib/convention-template.ts
  - apps/web/src/lib/programme-template.ts
  - apps/web/src/lib/qualiopi-bilan-stats.ts
  - apps/web/src/lib/proposition/quotes.ts
  - apps/web/src/lib/proposition/templates/proposition-template.ts
  - apps/web/src/lib/proposition/__tests__/quotes.test.ts
  - apps/web/src/components/quotes/quote-header-editor.tsx
  - apps/web/src/components/dossiers-opco/emit-invoice-button.tsx
  - apps/web/scripts/backfill-invoice-lines.ts
  - apps/web/scripts/_create-optimmo-152h.ts
  - apps/web/src/lib/einvoice/invoice-snapshot.ts
  - apps/web/src/lib/einvoice/__tests__/invoice-snapshot.test.ts
  - packages/db/prisma/schema.prisma
  - .planning/specs/2026-09-02-facturation-electronique-pa.md
  - .planning/handoff/2026-09-03-facture-lot1.md
autonomous: true
requirements:
  - UNIF-TVA-01      # une seule source pour la mention d'exonération (demande Laurent, 10/09/2026)
  - SPEC-20260902-D2 # §219 — trancher D-2 : code VATEX de l'art. 261-4-4°a
  - SPEC-20260902-175 # §175 — cas TVA : catégorie E + mention + code
  - SPEC-20260902-70 # §70 — commentaire du champ vatExemptionReasonCode dans le schéma de la spec
must_haves:
  truths:
    - "Une seule définition de la mention d'exonération existe dans le code applicatif ; un test échoue si quelqu'un en réécrit une en dur ailleurs."
    - "Une facture émise porte, sur chaque ligne exonérée, le code `VATEX-EU-132-1I` ET le texte `TVA non applicable en vertu de l'article 261-4-4° du CGI`."
    - "Une ligne à TVA non nulle (catégorie S) ne porte NI code NI texte d'exonération."
    - "Un avoir exonéré porte le même code et le même texte qu'une facture."
    - "Le PDF de facture, la convention, le programme, la proposition, le devis et la page catalogue affichent tous exactement la même phrase, caractère pour caractère."
    - "`Tenant.vatExemptionText` renseigné prend le pas sur la constante ; le code VATEX, lui, n'est surchargeable par personne dans ce lot."
    - "Les 31 `InvoiceLine` déjà en base sont inchangées : aucun UPDATE, aucun script de correction n'existe dans le lot."
    - "La spec ne dit plus que D-2 est ouverte, et le repli (texte seul si le validateur Super PDP refuse le code) est écrit là où on le relira."
  artifacts:
    - path: "apps/web/src/lib/tva-exoneration.ts"
      provides: "Source unique de la mention d'exonération et du code VATEX"
      exports: ["MENTION_EXONERATION_TVA", "CODE_VATEX_EXONERATION_TVA"]
      min_lines: 30
    - path: "apps/web/src/lib/__tests__/tva-exoneration.test.ts"
      provides: "Valeurs exactes + garde anti-duplication qui scanne les sources"
      contains: "MENTION_EXONERATION_TVA"
    - path: "apps/web/src/lib/einvoice/invoice-snapshot.ts"
      provides: "buildTrainingLines / buildCreditNoteLine posent le code VATEX sur les lignes E"
      contains: "CODE_VATEX_EXONERATION_TVA"
    - path: ".planning/specs/2026-09-02-facturation-electronique-pa.md"
      provides: "D-2 tranchée, §70/§175/§219 à jour, justification BR-E-10 et repli consignés"
      contains: "VATEX-EU-132-1I"
  key_links:
    - from: "apps/web/src/server/actions/invoices.ts"
      to: "apps/web/src/lib/tva-exoneration.ts"
      via: "import MENTION_EXONERATION_TVA (repli quand Tenant.vatExemptionText est vide)"
      pattern: "MENTION_EXONERATION_TVA"
    - from: "apps/web/src/lib/einvoice/invoice-snapshot.ts"
      to: "apps/web/src/lib/tva-exoneration.ts"
      via: "import CODE_VATEX_EXONERATION_TVA posé sur vatExemptionReasonCode"
      pattern: "vatExemptionReasonCode: CODE_VATEX_EXONERATION_TVA"
    - from: "apps/web/src/lib/__tests__/tva-exoneration.test.ts"
      to: "apps/web/src + apps/web/scripts"
      via: "scan du système de fichiers, échoue sur toute réécriture en dur"
      pattern: "readFileSync"
---

# Quick 260910-jut — D-2 tranchée : code VATEX sur les lignes exonérées + mention TVA unifiée

**Date :** 2026-09-10
**Demandeur :** Laurent
**Mode :** quick — un seul plan, trois tâches, **deux commits**
**Spec :** `.planning/specs/2026-09-02-facturation-electronique-pa.md` (§70, §175, §219)
**Branche :** `feat/facture-electronique-lot1` (déjà en place, arbre propre)


## La décision, déjà prise — ne pas la rediscuter

**D-2 est TRANCHÉE par Laurent le 10/09/2026**, sans passer par l'expert-comptable.

Sur toute ligne de facture de catégorie **E** :

| Champ | Valeur |
|---|---|
| `vatExemptionReasonCode` | `VATEX-EU-132-1I` |
| `vatExemptionReasonText` | `TVA non applicable en vertu de l'article 261-4-4° du CGI` (sans point final) |

**Pourquoi ce code.** L'art. 261-4-4°a du CGI transpose l'art. 132-1-i de la directive
TVA (formation professionnelle dispensée par un organisme reconnu). La liste VATEX de
l'EN 16931 code cette exonération `VATEX-EU-132-1I`.

**Pourquoi les deux.** La règle **BR-E-10** de l'EN 16931 n'exige que **l'un des deux**
(code *ou* texte). On met les deux : c'est permis, et le texte reste lisible par un humain
là où le code ne l'est pas.

**Le repli, écrit maintenant pour que personne ne le redécouvre.** Le validateur Super PDP
tranchera au lot 2 (`POST /validation_reports`, étape obligatoire avant `POST /invoices`,
cf. handoff du 03/09). **S'il refuse le code, on garde le texte seul** — on ne cherche pas
un autre code, on ne bricole pas. Cette phrase doit se retrouver **en commentaire dans
`invoice-snapshot.ts`** et **dans la spec**, pas seulement ici.

Aucune alternative n'est à proposer. Aucun expert-comptable n'est à consulter.


## Le second chantier : une phrase, huit orthographes

La même mention fiscale existe aujourd'hui en **au moins huit formulations** dans le dépôt.
Relevé vérifié par `grep` le 10/09 :

| # | Fichier | Ce qui est écrit |
|---|---|---|
| 1 | `lib/catalogue-constants.ts:12` | `TVA non applicable, art. 261-4-4° du CGI.` |
| 2 | `lib/convention-template.ts:353` | `TVA non applicable en vertu de l'article 261-4-4° du CGI` |
| 3 | `lib/invoice-template.ts:313` | `TVA non applicable en vertu de l'article 261-4-4° du CGI` |
| 4 | `lib/programme-template.ts:541` | `— TVA non applicable en vertu de l'article 261-4-4° du CGI.` |
| 5 | `lib/proposition/quotes.ts:38` | `TVA non applicable — article 261-4-4° a du Code général des impôts (activité de formation professionnelle exonérée).` |
| 6 | `lib/proposition/templates/proposition-template.ts:322` | `TVA non applicable — article 261-4-4° a du CGI, activité de formation exonérée` |
| 7 | `components/quotes/quote-header-editor.tsx:124` | placeholder `Formation exonérée de TVA (art. 261-4-4° CGI).` |
| 8 | `components/dossiers-opco/emit-invoice-button.tsx:114` | `(TVA non applicable — art. 261-4-4° CGI)` |

Deux hits de plus, en **commentaires**, qui deviennent faux ou trompeurs après ce lot :

| # | Fichier | Pourquoi il doit bouger |
|---|---|---|
| 9 | `lib/qualiopi-bilan-stats.ts:32` | contient la phrase en dur dans un commentaire → ferait échouer la garde |
| 10 | `scripts/_create-optimmo-152h.ts:463` | idem |

Et trois commentaires qui **mentent** dès que D-2 est tranchée : l'en-tête de
`invoice-snapshot.ts` (« convention 3 »), `packages/db/prisma/schema.prisma:2164-2165`
(« NON tranchée … Ne pas inventer »), `packages/db/prisma/schema.prisma:74`
(« Défaut applicatif : MENTION_TVA de `lib/catalogue-constants.ts` » — module qui ne
portera plus rien).

**Objectif : une seule constante exportée, aucune chaîne en dur ailleurs, prouvé par un test.**


## Décisions de conception, verrouillées avant d'écrire une ligne

**D-J1 — Un module dédié, pas `catalogue-constants.ts`.** Ce fichier est documenté comme
« textes standards pour la page publique /catalogue ». Une mention fiscale portée par les
factures, conventions, programmes, propositions et devis n'y est plus à sa place. Nouveau
module : **`apps/web/src/lib/tva-exoneration.ts`**.

**D-J2 — Aucun ré-export de compatibilité.** `MENTION_TVA` **disparaît** de
`catalogue-constants.ts`. Pas de `export { MENTION_EXONERATION_TVA as MENTION_TVA }` :
le but est qu'il n'y ait qu'une source et qu'un seul nom. `catalogue/page.tsx` importe
désormais depuis deux modules — c'est le prix, et il est juste : le délai d'accès et
l'accessibilité PSH sont bien des textes de catalogue, la mention TVA non.

**D-J3 — Deux exports, aux noms explicites.**

```ts
/** Mention légale, SANS point final : l'appelant ponctue selon sa phrase (cf. D-J4). */
export const MENTION_EXONERATION_TVA =
  "TVA non applicable en vertu de l'article 261-4-4° du CGI";

/** Code VATEX EN 16931. Non surchargeable par tenant dans ce lot. */
export const CODE_VATEX_EXONERATION_TVA = 'VATEX-EU-132-1I';
```

Apostrophe **droite** `'` (U+0027), degré `°` (U+00B0) — exactement les octets déjà présents
dans `invoice-template.ts:313`, vérifiés au `hexdump`. Pas d'apostrophe typographique `’` :
elle diverge de la chaîne déjà imprimée sur les 31 factures émises.

**D-J4 — La constante ne porte pas de point final.** Les appelants qui terminent une phrase
ajoutent le `.` **dans leur template**, jamais dans la constante. Une variante de
ponctuation reste une variante ; centraliser les mots suffit, et un point collé dans la
constante casserait la parenthèse de la convention (`(… du CGI.)`).

**D-J5 — `Tenant.vatExemptionText` reste, et reste prioritaire.** C'est un override
légitime par organisme. `null` / vide ⇒ repli sur `MENTION_EXONERATION_TVA`. Le champ n'est
**pas** exposé dans `/app/parametres` aujourd'hui (vérifié : aucun `vatExemptionText` dans
`app/app/parametres/`) — donc rien à changer là-bas ; le seul placeholder utilisateur qui
porte une variante écrite à la main est celui de `quote-header-editor.tsx`, et il passe à
la constante. **À consigner dans le SUMMARY** : le jour où l'écran Paramètres exposera le
champ, son placeholder devra afficher `MENTION_EXONERATION_TVA`, pas une variante.

**D-J6 — Le code VATEX n'est pas surchargeable.** Pas de colonne, pas de champ tenant, pas
de paramètre. Il est constant dans ce lot. Un OF au régime différent porterait une autre
catégorie que E, ce que `vatCategoryFor` sait déjà faire.

**D-J7 — Aucune migration Prisma.** `vatExemptionReasonCode` et `vatExemptionReasonText`
existent déjà (`schema.prisma:2166-2167`). Les seuls changements du schéma sont des
commentaires `///`, qui ne touchent pas la base et ne produisent **aucune** migration.
`prisma db push` reste interdit (`.claude/commands/quick.md` §4) : il n'y a de toute façon
rien à pousser.

**D-J8 — Les 31 lignes déjà en base ne bougent pas.** Elles portent l'ancienne phrase et
`code = null`. C'est l'instantané figé de pièces émises ; le code de commerce interdit de
les réécrire. **Aucun script de correction, aucun UPDATE, aucun `--fix`.** Le fait est
consigné dans le SUMMARY, pas corrigé.

> Observation à consigner aussi, parce qu'elle rassure : la phrase retenue est **déjà celle
> imprimée sur les PDF** de ces 31 factures (`invoice-template.ts:313`). Le décalage
> existant est donc entre la *ligne en base* (ancien `MENTION_TVA`, avec virgule et point)
> et le *PDF* (phrase longue). Après ce lot, les deux disent la même chose pour toute
> nouvelle pièce ; pour les anciennes, le PDF fait foi et il était déjà correct.

**D-J9 — La garde anti-duplication est un test, pas une consigne.** Un test qui scanne
`apps/web/src` et `apps/web/scripts` et échoue si `/TVA non applicable/` ou
`/exonérée de TVA/` apparaît ailleurs que dans le module et son propre test. Une consigne
dans un commentaire se re-viole en six mois ; un test rouge, non.

**D-J10 — `T.V.A. non applicable ou exonérée` reste tel quel.** Cette chaîne de
`invoice-template.ts:313` est le **libellé de rubrique** normalisé d'une facture française,
pas la mention. Elle ne matche pas la garde (points d'abréviation). On la laisse.


## Hors périmètre — à ne pas toucher

- `apps/web/src/lib/invoice-dates.ts` : lot B de l'**autre** spec (datation / numérotation).
- Toute réécriture de données existantes (cf. D-J8).
- Toute migration Prisma (cf. D-J7).
- Le rendu de facture ne passe **pas** encore par `InvoiceLine.vatExemptionReasonText` :
  `invoice-template.ts` continue d'interpoler la constante. Brancher le PDF sur le snapshot
  gelé, c'est le chantier E-1, pas celui-ci.
- Les commentaires qui citent simplement « art. 261-4-4° » sans reproduire la phrase
  (`invoice-template.ts:16/89/181`, `quotes.ts:341`, `quote-from-rdv.ts:54`) : ils sont
  exacts et le restent.
- `.planning/quick/260530-eoy-…/PLAN.md` et les autres archives de planification : ce sont
  des documents datés, ils gardent la formulation de leur époque.


## Tâches

### Tâche 1 — La constante unique et tous ses appelants (RED d'abord) → **commit 1**

**Fichiers créés**
- `apps/web/src/lib/tva-exoneration.ts`
- `apps/web/src/lib/__tests__/tva-exoneration.test.ts`

**Fichiers modifiés** — les 10 sites du relevé + `catalogue-constants.ts` +
`invoice-snapshot.test.ts` (fixture d'override).

**Comportement attendu, écrit en test AVANT l'implémentation**

1. `MENTION_EXONERATION_TVA` vaut **exactement**
   `"TVA non applicable en vertu de l'article 261-4-4° du CGI"` — comparaison stricte
   `toBe`, pas `toContain`.
2. Elle ne se termine **pas** par un point (`expect(MENTION.endsWith('.')).toBe(false)`) —
   c'est D-J4, et c'est le genre de détail qu'un « nettoyage » réintroduit.
3. Elle ne contient **aucun** caractère HTML-spécial (`&`, `<`, `>`, `"`) : c'est ce qui
   autorise les templates à l'interpoler sans `escapeHtml`. Si un jour quelqu'un y met une
   esperluette, ce test le lui dit avant que Gotenberg ne rende du HTML cassé.
4. Elle utilise l'apostrophe **droite** U+0027 et pas U+2019
   (`expect(MENTION).not.toContain('’')`).
5. `CODE_VATEX_EXONERATION_TVA` vaut `'VATEX-EU-132-1I'`.
6. **Garde anti-duplication.** Scan récursif de `apps/web/src` et `apps/web/scripts`
   (extensions `.ts` / `.tsx`, en sautant `node_modules`, `.next`, `dist`, `.turbo`) :
   les regex `/TVA non applicable/` et `/exonérée de TVA/` ne doivent apparaître que dans
   `src/lib/tva-exoneration.ts` et `src/lib/__tests__/tva-exoneration.test.ts`. Le message
   d'échec **liste les fichiers fautifs avec leur numéro de ligne** — un test de garde qui
   dit juste « false !== true » ne sert à personne.

   Précédent maison pour la lecture-source en test : `app/app/veille/__tests__/page.smoke.test.ts`
   (`readFileSync` + `__dirname`). L'environnement Vitest est `node` par défaut
   (`apps/web/vitest.config.ts`), donc `node:fs` est disponible sans bascule jsdom.
   Racine : `path.resolve(__dirname, '..', '..', '..')` depuis
   `apps/web/src/lib/__tests__/` = `apps/web`.

**Action**

Écrire le fichier de test d'abord — il doit être **ROUGE** : le module n'existe pas et la
garde trouve 10 fichiers fautifs. Capturer cette sortie, elle sert de preuve dans le SUMMARY.

Puis créer `tva-exoneration.ts`. En-tête à la densité de ses voisins : ce que porte le
module, **pourquoi il n'est pas dans `catalogue-constants.ts`**, la règle de ponctuation
(D-J4), la priorité de `Tenant.vatExemptionText` (D-J5), et le fait que le code n'est pas
surchargeable (D-J6). Le « pourquoi ce code » et le repli vont dans `invoice-snapshot.ts`
(tâche 2), pas ici : ce module dit *quoi*, pas *comment on l'a choisi*.

Puis migrer les appelants, un par un :

| Fichier | Remplacement exact |
|---|---|
| `lib/catalogue-constants.ts` | **supprimer** `MENTION_TVA` (la ligne 12 et rien d'autre) |
| `app/catalogue/page.tsx` | retirer `MENTION_TVA` de l'import `@/lib/catalogue-constants`, ajouter `import { MENTION_EXONERATION_TVA } from '@/lib/tva-exoneration'`, remplacer les 2 usages (l. 326 et 385) |
| `server/actions/invoices.ts` | l. 22 import → `@/lib/tva-exoneration` ; l. 119 `tenant?.vatExemptionText?.trim() \|\| MENTION_EXONERATION_TVA` |
| `scripts/backfill-invoice-lines.ts` | l. 35 import → `'../src/lib/tva-exoneration'` ; l. 200 et 263 |
| `lib/invoice-template.ts` | l. 313 : `…ou exonérée<br>${MENTION_EXONERATION_TVA}</div>` — le libellé de rubrique reste (D-J10). **Rendu inchangé au caractère près** : c'est déjà cette phrase |
| `lib/convention-template.ts` | l. 353 : `(<em>${MENTION_EXONERATION_TVA}</em>)` |
| `lib/programme-template.ts` | l. 541 : `— ${MENTION_EXONERATION_TVA}.` (le `.` reste dans le template, D-J4) |
| `lib/proposition/quotes.ts` | **supprimer** `VAT_EXEMPTION_NOTE` (l. 36-38) ; l. 125 et 127 utilisent `MENTION_EXONERATION_TVA` |
| `lib/proposition/__tests__/quotes.test.ts` | l. 8 : importer `MENTION_EXONERATION_TVA` depuis `@/lib/tva-exoneration` au lieu de `VAT_EXEMPTION_NOTE` depuis `../quotes` ; l. 125 s'aligne |
| `lib/proposition/templates/proposition-template.ts` | l. 322 : `<span class="muted">(${MENTION_EXONERATION_TVA})</span>` |
| `components/quotes/quote-header-editor.tsx` | l. 124 : `placeholder={\`Paiement à 30 jours fin de mois.\n${MENTION_EXONERATION_TVA}.\`}` — ⚠ **le `&#10;` doit devenir `\n`** : une entité HTML n'est décodée que dans un attribut JSX *littéral*, pas dans une expression `{…}` |
| `components/dossiers-opco/emit-invoice-button.tsx` | l. 114 : `({MENTION_EXONERATION_TVA})` — la phrase s'allonge dans un `text-xs`, c'est voulu |
| `lib/qualiopi-bilan-stats.ts` | l. 32 : reformuler le commentaire sans reproduire la phrase (ex. `// somme priceHT × participants (exonération art. 261-4-4°, cf. MENTION_EXONERATION_TVA)`) |
| `scripts/_create-optimmo-152h.ts` | l. 463 : idem, commentaire sans la phrase |
| `lib/einvoice/__tests__/invoice-snapshot.test.ts` | l. 166 : la fixture `vatExemptionText` teste le **chemin d'override tenant** — lui donner une chaîne clairement distincte, ex. `'Mention propre à cet OF — override tenant'`, et aligner l'assertion l. 205. Ne pas y remettre la constante : ce serait tester deux fois le repli et jamais l'override |

**Vérifier**

`pnpm --filter @qualiof/web test src/lib/__tests__/tva-exoneration.test.ts` passe, garde
comprise. Puis `pnpm --filter @qualiof/web test src/lib/proposition src/lib/einvoice`
pour les deux suites directement touchées.

**Fini quand**

Le seul endroit du code applicatif où la phrase est écrite est `tva-exoneration.ts` ; la
garde le prouve ; `grep -rn "MENTION_TVA" apps packages --include='*.ts*'` ne renvoie plus
rien (hors `node_modules`).

**Commit 1**

```
refactor(tva): une seule phrase d'exonération, une seule constante

La mention de l'art. 261-4-4° existait en huit formulations : deux ponctuations
sur la facture et le catalogue, deux longueurs sur la proposition et le devis,
un placeholder écrit à la main. Rien ne garantissait qu'un client lise la même
phrase sur sa convention et sur sa facture.

`lib/tva-exoneration.ts` la porte désormais seul, avec le code VATEX qui vient
au commit suivant. `catalogue-constants.ts` ne la définit plus et n'en ré-exporte
rien : une source, un nom. Un test scanne les sources et échoue si quelqu'un en
réécrit une en dur.

Le rendu du PDF de facture est inchangé au caractère près — la formulation
retenue est celle qu'il imprimait déjà.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QLQM6dFq4PpUVwuvSiksGu
```


### Tâche 2 — Le code VATEX sur les lignes de catégorie E (RED d'abord)

**Fichiers**
- `apps/web/src/lib/einvoice/invoice-snapshot.ts`
- `apps/web/src/lib/einvoice/__tests__/invoice-snapshot.test.ts`
- `apps/web/scripts/backfill-invoice-lines.ts`
- `packages/db/prisma/schema.prisma` (commentaires `///` uniquement — D-J7)

**Comportement attendu, écrit en test AVANT l'implémentation**

1. `buildTrainingLines` avec `vatRate: 0` ⇒ chaque ligne porte
   `vatCategory === 'E'`, `vatExemptionReasonCode === 'VATEX-EU-132-1I'` (assertion sur la
   constante importée), et le texte attendu.
2. `buildTrainingLines` avec `vatRate: 20` ⇒ `vatCategory === 'S'`,
   `vatExemptionReasonCode === null` **et** `vatExemptionReasonText === null`. Une ligne
   taxée qui porterait un motif d'exonération est une contradiction que BR-E-* refuse.
3. `buildCreditNoteLine` exonéré ⇒ **mêmes** code et texte qu'une ligne de facture. Un avoir
   ne s'exonère pas autrement que la pièce qu'il corrige.
4. `buildCreditNoteLine` à `vatRate: 20` ⇒ code et texte `null`.
5. Le code ne dépend **pas** de `vatExemptionText` : avec un override tenant, le code reste
   `VATEX-EU-132-1I` (c'est D-J6, et c'est exactement ce qu'un futur « paramétrable ? »
   viendra tenter).
6. Renommer le test l. 197 : `(D-2 ouverte)` → `(D-2 tranchée le 10/09/2026)`. Un titre de
   test qui affirme le contraire de la décision est une désinformation qui survit au diff.

**Action**

Test rouge d'abord (l'assertion `toBeNull()` actuelle l. 206 tombe). Puis :

- `invoice-snapshot.ts` : importer `CODE_VATEX_EXONERATION_TVA`, poser
  `vatExemptionReasonCode: vatCategory === 'E' ? CODE_VATEX_EXONERATION_TVA : null` dans
  `buildTrainingLines` (l. ~347) **et** `buildCreditNoteLine` (l. ~376). Aligner sur la
  même condition que le texte : les deux champs vivent ou meurent ensemble.
- **Réécrire la « convention 3 » de l'en-tête** (l. 32-34). Elle dit aujourd'hui
  « `vatExemptionReasonCode` RESTE NULL … on n'invente pas un code fiscal ». Elle doit dire :
  D-2 tranchée le 10/09/2026 par Laurent ; le code retenu et **pourquoi** (261-4-4°a du CGI
  = transposition de l'art. 132-1-i de la directive TVA) ; que **BR-E-10 n'exige que l'un des
  deux** et qu'on met les deux ; et **le repli** — si le validateur Super PDP refuse le code
  au lot 2, on garde le texte seul, on ne cherche pas un autre code. C'est la phrase qui
  évite qu'un successeur repasse une demi-journée sur la liste VATEX.
- `backfill-invoice-lines.ts` l. 260-261 : remplacer le commentaire « D-2 non tranchée : pas
  de code VATEX inventé » et poser le code quand `vatCategory === 'E'`. **Ce n'est pas une
  réécriture** (D-J8) : le script ne crée des lignes que pour les factures qui en ont
  **zéro**. Ajouter une phrase dans l'en-tête du script disant explicitement qu'il ne touche
  jamais une ligne existante, pour que le prochain lecteur n'ait pas à le déduire du `where`.
- `schema.prisma` : l. 2164-2165, le commentaire de `vatExemptionReasonCode` devient
  « Code VATEX EN 16931 — D-2 tranchée le 10/09/2026 : `VATEX-EU-132-1I` (art. 261-4-4°a
  CGI = art. 132-1-i directive TVA). Non surchargeable par tenant. » ; l. 73-74, le
  commentaire de `Tenant.vatExemptionText` pointe désormais `lib/tva-exoneration.ts`.
  **Ne rien changer d'autre** dans le schéma : `///` ne produit pas de migration, une
  colonne, oui.

**Vérifier**

```
pnpm --filter @qualiof/web test src/lib/einvoice
pnpm --filter @qualiof/db exec prisma format
git diff --stat packages/db/prisma/migrations   # doit être VIDE
```

**Fini quand**

Une facture ou un avoir produit aujourd'hui porte code **et** texte sur ses lignes E ; une
ligne S ne porte ni l'un ni l'autre ; aucune migration n'est apparue ; le repli est écrit
dans `invoice-snapshot.ts`.


### Tâche 3 — Spec, handoff, les trois gates → **commit 2**

**Fichiers**
- `.planning/specs/2026-09-02-facturation-electronique-pa.md`
- `.planning/handoff/2026-09-03-facture-lot1.md`
- `.planning/quick/260910-jut-…/260910-jut-PLAN.md` et `…-SUMMARY.md` (ils partent **dans
  le commit 2**, pas dans un commit de doc à part : Laurent en demande deux, pas trois —
  même geste que `b87685b` pour le lot A)

**Action**

1. **§70** (bloc Prisma de la spec) — le commentaire `// code VATEX (à fixer, voir D-2)`
   devient `// VATEX-EU-132-1I (D-2 tranchée le 10/09/2026)`. **§71** aligne le texte
   d'exemple sur la formulation retenue.
2. **§137** — « `vatExemptionText String?` (défaut `MENTION_TVA` de `catalogue-constants.ts`) »
   pointe maintenant `MENTION_EXONERATION_TVA` de `lib/tva-exoneration.ts`. Laisser une
   référence morte dans la spec, c'est envoyer le prochain lecteur dans un fichier qui ne
   contient plus rien.
3. **§175** (cas TVA) — réécrire le point 3 : catégorie **E**, texte
   `TVA non applicable en vertu de l'article 261-4-4° du CGI`, code `VATEX-EU-132-1I`,
   justification (transposition art. 132-1-i), **BR-E-10 n'exige que l'un des deux, on met
   les deux**, et le repli au lot 2 si le validateur refuse le code. Supprimer
   « ne pas inventer un code » : il est fixé.
4. **§219** (tableau des décisions) — la ligne D-2 passe de « ouverte » à
   **`~~D-2~~ … TRANCHÉE le 10/09/2026 par Laurent`**, dans la forme exacte déjà utilisée
   pour D-3 à la ligne 220 (barré + gras + date + colonne de droite `Laurent, 10/09/2026`).
   Mentionner que la décision a été prise **sans passer par l'expert-comptable**, puisque la
   question initiale le prévoyait — sinon la trace laisse croire qu'un avis a été rendu.
5. **Handoff §6, ligne D-2** — même bascule. Et le paragraphe « un choix qui n'est pas un
   écart mais une abstention » (l. 145-147) n'est plus vrai : le corriger ou le dater.
6. Rédiger `260910-jut-SUMMARY.md` dans le répertoire du quick. Il doit porter, en propre :
   - ce qui change pour un utilisateur (une seule phrase partout ; devis et proposition
     passent de la formulation longue à la courte — **seul changement visible côté client**) ;
   - **les 31 `InvoiceLine` en base restent telles quelles**, avec le pourquoi (pièce émise,
     code de commerce) et le constat que leur PDF, lui, portait déjà la bonne phrase ;
   - le repli D-2 (texte seul si Super PDP refuse le code au lot 2) ;
   - la note D-J5 : si `/app/parametres` expose un jour `vatExemptionText`, son placeholder
     doit afficher la constante ;
   - la sortie ROUGE de la garde (les 10 fichiers listés), qui est la preuve du problème ;
   - le décompte de tests avant / après.

**Vérifier — les trois gates, dans cet ordre, toutes vertes**

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Un test déjà rouge avant la modif se signale explicitement et se consigne — il ne se
« répare » pas au passage (`.claude/commands/quick.md` §5).

**Commit 2**

```
feat(einvoice): D-2 tranchée — code VATEX-EU-132-1I sur les lignes exonérées

Les lignes de catégorie E portent désormais le code en plus du texte. L'art.
261-4-4°a du CGI transpose l'art. 132-1-i de la directive TVA, que la liste VATEX
de l'EN 16931 code VATEX-EU-132-1I. BR-E-10 n'exige que l'un des deux ; on met
les deux, le texte restant lisible là où le code ne l'est pas.

Repli écrit d'avance : le validateur Super PDP tranche au lot 2 et, s'il refuse
le code, on garde le texte seul. C'est en commentaire dans invoice-snapshot.ts
pour que personne ne le redécouvre.

Décision Laurent du 10/09/2026, sans passer par l'expert-comptable. Spec §70,
§137, §175 et §219 à jour, handoff aligné.

Les 31 lignes déjà en base ne sont pas touchées : une pièce émise ne se réécrit
pas. Aucune migration — les deux colonnes existent depuis le lot 1.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QLQM6dFq4PpUVwuvSiksGu
```


## Vérification d'ensemble

| # | Contrôle | Commande / geste |
|---|---|---|
| 1 | Une seule définition de la phrase | `grep -rn "TVA non applicable" apps packages --include='*.ts' --include='*.tsx' \| grep -v node_modules` ⇒ uniquement `tva-exoneration.ts` et son test |
| 2 | `MENTION_TVA` a disparu | `grep -rn "MENTION_TVA" apps packages --include='*.ts*' \| grep -v node_modules` ⇒ vide |
| 3 | Le code est posé | `grep -n "CODE_VATEX_EXONERATION_TVA" apps/web/src/lib/einvoice/invoice-snapshot.ts apps/web/scripts/backfill-invoice-lines.ts` |
| 4 | Aucune migration | `git status --short packages/db/prisma/migrations` ⇒ vide |
| 5 | Aucune écriture sur l'existant | `git diff` ne contient ni `updateMany` ni `update(` sur `invoiceLine` |
| 6 | Les trois gates | `pnpm lint` · `pnpm --filter @qualiof/web exec tsc --noEmit` · `pnpm test` |
| 7 | Deux commits, dans l'ordre | `git log --oneline -2` ⇒ `feat(einvoice): …` au-dessus de `refactor(tva): …` |

## Critères de réussite

- Une facture ou un avoir émis après ce lot porte, sur chaque ligne exonérée,
  `vatExemptionReasonCode = 'VATEX-EU-132-1I'` et
  `vatExemptionReasonText = "TVA non applicable en vertu de l'article 261-4-4° du CGI"`.
- Une ligne à TVA non nulle ne porte ni code ni motif.
- La phrase n'est écrite qu'une fois dans le code, et un test échoue si ce n'est plus vrai.
- La spec et le handoff disent que D-2 est tranchée, par qui, quand, pourquoi ce code, et
  ce qu'on fait si le validateur le refuse.
- Zéro migration, zéro ligne de facture existante modifiée.
- `pnpm lint`, `tsc --noEmit`, `pnpm test` : les trois vertes.
- Deux commits, dans l'ordre imposé, messages en français.

## Sortie

`.planning/quick/260910-jut-d-2-tranch-e-code-vatex-sur-les-lignes-e/260910-jut-SUMMARY.md`

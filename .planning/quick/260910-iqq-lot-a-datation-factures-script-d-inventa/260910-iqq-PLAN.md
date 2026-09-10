---
phase: quick-260910-iqq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit-invoice-chronology.ts
  - apps/web/scripts/__tests__/audit-invoice-chronology.test.ts
  - apps/web/package.json
autonomous: true
requirements:
  - SPEC-20260910-4  # l'invariante chronologique à mesurer
  - SPEC-20260910-5  # l'état des lieux à produire avant de décider de l'historique
  - SPEC-20260910-7A # lot A — mesurer, aucun changement de comportement
must_haves:
  truths:
    - "Laurent lance une commande et obtient, pour chaque séquence de numéros, la liste des factures dont la date d'émission recule par rapport à la précédente."
    - "Chaque rupture est listée avec son numéro, sa date d'émission, sa date de création et l'écart en jours."
    - "Les avoirs (AVO-) ne sont jamais comparés aux factures (FAC-) : deux séquences, deux chaînes."
    - "Les factures sans date d'émission sont comptées à part et ne sont jamais présentées comme des ruptures."
    - "Le script ne peut pas écrire dans la base : aucune primitive d'écriture Prisma n'existe dans le fichier."
    - "Le résumé se termine par la phrase chiffrée « X ruptures sur N pièces » réutilisable telle quelle dans le mail à Lagean."
  artifacts:
    - path: "apps/web/scripts/audit-invoice-chronology.ts"
      provides: "Inventaire lecture seule des ruptures de chronologie + helpers purs exportés"
      exports: ["parseSequenceNumber", "diffInDays", "auditSequence"]
    - path: "apps/web/scripts/__tests__/audit-invoice-chronology.test.ts"
      provides: "Preuve sur fixtures que la détection dit vrai (rupture, séquences disjointes, issueDate nulle, tri numérique)"
    - path: "apps/web/package.json"
      provides: "Script pnpm invoices:audit-chronology"
      contains: "invoices:audit-chronology"
  key_links:
    - from: "apps/web/scripts/audit-invoice-chronology.ts"
      to: "prisma.invoice / prisma.tenant"
      via: "findMany en lecture seule"
      pattern: "prisma\\.(invoice|tenant)\\.findMany"
    - from: "apps/web/package.json"
      to: "scripts/audit-invoice-chronology.ts"
      via: "dotenv -e ../../.env -- tsx"
      pattern: "invoices:audit-chronology"
---

# Quick 260910-iqq — Lot A : inventaire des ruptures de chronologie des factures

**Date :** 2026-09-10
**Demandeur :** Laurent
**Mode :** quick — un seul plan, deux tâches
**Spec :** `.planning/specs/2026-09-10-datation-numerotation-factures.md` (§4, §5, §7 lot A)

## Pourquoi ce script existe

La règle actuelle date une facture de la **fin de prestation** (`resolveInvoiceIssueDate`,
décision du 13/08/2026), pendant que le **numéro** est attribué à l'instant du clic. Deux
horloges : facturer en septembre une session de juin produit `FAC-000021` daté du 12 juin
juste après `FAC-000020` daté du 3 septembre. L'effet de bord était assumé et documenté
dans `invoice-dates.ts` ; ce qui ne l'était pas, c'est son coût de conformité.

Avant de corriger quoi que ce soit (lot B) et avant de poser la question de l'historique à
l'expert-comptable (lot C, bloqué sur D-1), il faut **savoir combien de ruptures existent**.
La spec §5 le dit : le parc fait 31 pièces au 10/09/2026, le nombre de ruptures n'est pas
mesuré, et seul le poste de Laurent peut interroger la base Supabase de production.

**Ce plan produit l'instrument de mesure. Il ne corrige rien.**

## L'invariante mesurée (§4, mot pour mot)

> Pour un tenant et un préfixe donnés, l'ordre des numéros suit l'ordre des `issueDate` :
> `number(n) > number(n-1)` ⟹ `issueDate(n) >= issueDate(n-1)`.

Une **rupture** est donc un couple de numéros consécutifs dans une même séquence où
`issueDate(n) < issueDate(n-1)`.

## Décisions de conception, verrouillées avant d'écrire une ligne

**D-A1 — Lecture seule, sans échappatoire.** Le script tourne sur la base Supabase de
**production** (`DATABASE_URL` du `.env` racine pointe le pooler Supabase, et il n'y a pas
de `.env.local` dans ce worktree : toute exécution est une lecture de prod). Aucun
`create` / `update` / `upsert` / `delete` / `createMany` / `updateMany` / `deleteMany` /
`$executeRaw` dans le fichier. Uniquement `findMany`. Contrairement à
`audit-pricing-overrides.ts`, **il n'y a pas de mode `--apply`** — et si l'argument est
passé (réflexe de la main, les scripts voisins en ont un), le script **refuse de démarrer**
avec un message explicite plutôt que de l'ignorer en silence.

**D-A2 — Groupement par (tenantId, préfixe), préfixe extrait du numéro.** Les séquences
`FAC-` et `AVO-` sont indépendantes (CGI art. 289, cf. l'en-tête de `numbering.ts`) :
comparer `AVO-000001` à `FAC-000009` n'a aucun sens. Le préfixe est **lu sur le numéro
lui-même** (tout ce qui précède le dernier `-`), pas seulement déduit de
`Tenant.invoicePrefix` / `Tenant.creditNotePrefix` : si une pièce historique porte un
préfixe qui n'est plus celui configuré, elle doit apparaître dans le rapport, pas
disparaître du périmètre. Les préfixes du Tenant servent à **nommer** les séquences
(« factures », « avoirs ») ; toute autre séquence est reportée sous « séquence hors
paramétrage » — signalée, jamais silencieuse.

**D-A3 — Tri sur la partie numérique.** `parseInt` de ce qui suit le dernier `-`. Le
zero-padding à 6 chiffres rend aujourd'hui le tri lexicographique équivalent ; s'appuyer
dessus est fragile (un `FAC-9` non padé, un import, un jour à 7 chiffres). Un numéro dont
la partie droite n'est pas un entier va dans un seau « hors format », listé à part et exclu
de la chaîne — on ne peut pas l'ordonner, on ne va pas l'inventer.

**D-A4 — `issueDate` est nullable (`DateTime?`).** Une pièce sans date d'émission ne peut
ni valider ni violer l'invariante. Elle est **comptée et listée à part**, exclue de la
chaîne, et la comparaison enjambe : `n` se compare au dernier numéro **inférieur portant
une date**. Jamais de rupture fantôme, jamais de crash sur `null`.

**D-A5 — Deux écarts, parce que la spec est lue au pied de la lettre et que les deux
parlent.** La spec demande « numéro, date d'émission, date de création et écart en jours ».
Le rapport affiche donc :
- `Antidatée de` = `createdAt − issueDate` en jours (de combien la pièce a été datée en
  arrière de son établissement réel) ;
- `Recul / préc.` = `issueDate(n-1) − issueDate(n)` en jours (l'amplitude de la rupture
  elle-même, > 0 par construction).

Les deux se calculent sur des jours calendaires : les deux bornes sont ramenées à minuit
UTC avant la soustraction, sinon l'heure de création introduit des demi-journées qui
n'ont aucun sens sur une pièce comptable.

**D-A6 — Un inventaire, pas une gate.** Sortie `exit 0` même avec des ruptures : ce script
ne casse aucune CI, il informe. Les helpers de détection sont **purs et exportés**,
`main()` est gardé par `const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href`
— convention déjà en place dans `scripts/match-treso-agefice.ts` et `scripts/dedupe.ts`,
qui permet au test unitaire d'importer les helpers sans déclencher l'accès BDD.

## Contrats à écrire (l'exécutant n'a pas à les deviner)

```ts
/** Une pièce, réduite à ce que l'invariante regarde. */
export type ChronologyRow = {
  number: string;
  issueDate: Date | null;
  createdAt: Date;
  status: string; // InvoiceStatus, affiché pour que Lagean distingue un brouillon d'une pièce émise
};

/** Une rupture : le numéro fautif ET son prédécesseur, sinon le rapport n'est pas relisable. */
export type ChronologyBreak = {
  number: string;
  issueDate: Date;
  createdAt: Date;
  status: string;
  antidatedDays: number;      // createdAt − issueDate
  previousNumber: string;
  previousIssueDate: Date;
  backwardDays: number;       // previousIssueDate − issueDate, toujours > 0
};

export type SequenceReport = {
  prefix: string;
  label: string;              // 'factures' | 'avoirs' | 'séquence hors paramétrage'
  counted: number;            // pièces entrées dans la chaîne (numéro exploitable + date)
  withoutIssueDate: string[]; // numéros sans issueDate
  malformed: string[];        // numéros dont la partie droite n'est pas un entier
  breaks: ChronologyBreak[];
};

/** `FAC-000021` → { prefix: 'FAC', seq: 21 }. `F-202601-214` → { prefix: 'F-202601', seq: 214 }. Sinon null. */
export function parseSequenceNumber(number: string): { prefix: string; seq: number } | null;

/** Jours calendaires entre deux dates, bornes ramenées à minuit UTC. Entier signé. */
export function diffInDays(later: Date, earlier: Date): number;

/** Le cœur : trie par `seq` croissant, parcourt la chaîne, renvoie les reculs. */
export function auditSequence(prefix: string, label: string, rows: ChronologyRow[]): SequenceReport;
```

## Tâches

### Tâche 1 — Les helpers purs et leurs tests (RED d'abord)

**Fichiers**
- `apps/web/scripts/audit-invoice-chronology.ts` (nouveau — pour l'instant : en-tête + helpers exportés)
- `apps/web/scripts/__tests__/audit-invoice-chronology.test.ts` (nouveau)

**Comportement attendu, écrit en test AVANT l'implémentation**
1. Séquence conforme (`FAC-000001` au 03/06, `FAC-000002` au 12/06) → `breaks` vide.
2. Le cas de la spec : `FAC-000020` daté du 2026-09-03, `FAC-000021` daté du 2026-06-12 et
   créé le 2026-09-10 → **1 rupture**, `backwardDays === 83`, `antidatedDays === 90`,
   `previousNumber === 'FAC-000020'`.
3. Séquences indépendantes : `AVO-000001` daté du 2026-01-05 et `FAC-000009` daté du
   2026-08-01, passés dans **deux appels distincts** de `auditSequence` → 0 rupture de part
   et d'autre. Un test de non-régression sur `parseSequenceNumber` garantit que `AVO` et
   `FAC` ne tombent jamais dans le même seau.
4. `issueDate` nulle : `FAC-000002` sans date, entre `FAC-000001` (03/06) et `FAC-000003`
   (12/06) → `withoutIssueDate === ['FAC-000002']`, `breaks` vide, `counted === 2`
   (la chaîne enjambe, `FAC-000003` se compare à `FAC-000001`).
5. Tri numérique, pas lexicographique : `FAC-9` daté du 2026-08-01 et `FAC-000010` daté du
   2026-08-02 → 0 rupture (un tri chaîne aurait mis `FAC-000010` avant `FAC-9` et inventé
   une rupture).
6. Numéro hors format : `FACTURE-JUIN` → `malformed === ['FACTURE-JUIN']`, aucun crash,
   aucune rupture.
7. `diffInDays` ignore l'heure : `2026-06-12T23:30:00Z` → `2026-06-13T00:10:00Z` vaut 1 jour.

**Action**
Écrire d'abord le fichier de test (il doit être **rouge** : `auditSequence` n'existe pas
encore), puis les helpers dans `audit-invoice-chronology.ts` jusqu'au vert. `auditSequence`
trie sur `seq`, tient un curseur « dernière pièce datée vue » et n'émet une rupture que
lorsque `issueDate(n) < issueDate(curseur)`.

L'en-tête du fichier suit la densité de ses voisins récents (`backfill-invoice-lines.ts`,
`audit-pricing-overrides.ts`) : ce que le script mesure, l'invariante §4 citée, **et la
règle qui commande tout le reste écrite noir sur blanc — « ce script ne modifie jamais la
base ; il tourne sur la prod Supabase ; il n'a pas de `--apply` et n'en aura pas »**.

**Verify**
```bash
pnpm --filter @qualiof/web test scripts/__tests__/audit-invoice-chronology.test.ts
```
(passer par le script `test` du package et non par `vitest` nu : il enveloppe la commande
dans `dotenv -e ../../.env`, et le module importe `prisma` au chargement — sans
`DATABASE_URL`, le client Prisma refuse de s'instancier avant même le premier test.)

**Done** — les 7 cas passent ; `auditSequence` n'importe rien de Prisma (helpers purs).

### Tâche 2 — Le rapport console, la CLI et le script pnpm

**Fichiers**
- `apps/web/scripts/audit-invoice-chronology.ts` (complété : `main()` + garde `isMain`)
- `apps/web/package.json` (un script, à côté de `invoices:backfill-lines`)

**Action**

*Arguments.* `--tenant=<uuid>` (optionnel, borne à un tenant — même convention que
`backfill-invoice-lines.ts`). `--apply` → message `« Ce script n'écrit jamais : il n'a pas
de mode --apply. »` puis `exit 1` (D-A1).

*Lecture.* `prisma.tenant.findMany({ select: { id, name, invoicePrefix, creditNotePrefix } })`
puis, par tenant, `prisma.invoice.findMany({ where: { tenantId }, select: { number, issueDate, createdAt, status } })`.
Rien d'autre ne touche la base. Groupement des lignes par préfixe via `parseSequenceNumber`,
puis un `auditSequence` par (tenant, préfixe), avec le libellé résolu depuis les préfixes du
Tenant (fallbacks `FAC` / `AVO` cohérents avec les `@default` du schema et avec `numbering.ts`).

*Affichage.* Reprendre les conventions de `audit-pricing-overrides.ts` : bandeau `━`,
tableau à colonnes via un helper `row(cells, widths)` avec `padEnd`, bloc `━━━ RÉSUMÉ ━━━`.
Une section par séquence, en-têtes :

```
Numéro │ Statut │ Date d'émission │ Date de création │ Antidatée de │ Précédent │ Émis le │ Recul / préc.
```

Dates en `fr-FR` (`Intl.DateTimeFormat`, convention du dépôt). Une séquence sans rupture
affiche une ligne verte plutôt qu'un tableau vide.

*Résumé, calibré pour le mail à Lagean (§6).* Par séquence : pièces examinées, ruptures,
sans date d'émission, hors format. Puis, en clair et sur une ligne, la phrase que Laurent
recopie : `« X ruptures sur N pièces »`. Dernière ligne : rappel que la sortie peut être
redirigée dans un fichier pour être jointe au mail. `exit 0` quoi qu'il arrive (D-A6).

*Script pnpm*, aligné sur son voisin immédiat :
```json
"invoices:audit-chronology": "dotenv -e ../../.env -- tsx scripts/audit-invoice-chronology.ts"
```

**Verify**
```bash
# 1. Le garde-fou lecture seule — doit ne RIEN trouver (grep sort en 1, donc le ! renvoie 0)
! grep -nE '\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|--apply.*APPLY *=' apps/web/scripts/audit-invoice-chronology.ts

# 2. Les tests de la tâche 1 tiennent toujours
pnpm --filter @qualiof/web test scripts/__tests__/audit-invoice-chronology.test.ts

# 3. Types — 0 erreur hors artefacts de build
pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -v '^\.next/' | grep -c 'error TS'
# doit afficher 0
```

**Done** — `cd apps/web && pnpm exec dotenv -e ../../.env -- tsx scripts/audit-invoice-chronology.ts`
imprime le rapport du parc réel (31 pièces attendues au 10/09/2026) et se termine par
« X ruptures sur N pièces ». Si la base Supabase n'est pas joignable depuis l'environnement
d'exécution, la tâche est quand même **Done** dès lors que les points 1 à 3 du Verify
passent — Laurent lance alors `pnpm invoices:audit-chronology` depuis son poste, c'est
précisément le scénario prévu par la spec §5.

## Gates de sortie

- `pnpm lint`
- `pnpm --filter @qualiof/web exec tsc --noEmit` → **0 erreur hors `.next/`**. ⚠ Ce worktree
  contient des artefacts dupliqués par le Finder (`.next/types/link.d 2.ts`) qui font sortir
  `tsc` en 2 **avant toute modification** : mesuré le 10/09, 0 erreur une fois `.next/`
  filtré. Ne pas prendre ce bruit préexistant pour une régression, ne pas le « corriger »
  non plus (hors périmètre) — un `rm -rf apps/web/.next` local suffit à le faire taire.
- `pnpm test` (suite complète, aucun test existant ne doit bouger)
- Relecture du diff : **zéro ligne** hors des trois fichiers listés en `files_modified`.

## Ce que ce plan ne fait pas (lots B et C — « rien d'autre »)

- Ne touche pas à `apps/web/src/lib/invoice-dates.ts` ni à `resolveInvoiceIssueDate` :
  la règle de datation reste celle du 13/08 jusqu'au lot B.
- Ne touche pas à `lib/numbering.ts`, ni au gabarit de facture, ni à `InvoiceLine.label`,
  ni à aucune server action.
- N'ajoute aucune alerte UI.
- N'écrit aucun test d'invariante sur la fonction de numérotation (lot B) — les tests de ce
  plan portent sur le détecteur de l'inventaire, pas sur le générateur de numéros.
- Ne régularise rien : aucune écriture, aucun avoir, aucune renumérotation. Le lot C
  n'existe pas tant que D-1 n'est pas tranchée par Lagean.

## Après ce plan

Lancer le script sur la prod, joindre la sortie à la question §6 posée à Lagean, et
attendre sa réponse écrite avant d'ouvrir le lot C. Le lot B (correction pour l'avenir)
peut démarrer sans attendre : il ne dépend que du lot A et du lot 1 e-invoicing, déjà mergé.

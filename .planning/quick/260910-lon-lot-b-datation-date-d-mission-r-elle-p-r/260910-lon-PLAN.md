---
phase: quick/260910-lon
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [LOTB-01, LOTB-02, LOTB-03, LOTB-04, LOTB-05]
files_modified:
  - apps/web/src/lib/invoice-dates.ts
  - apps/web/src/lib/__tests__/invoice-dates.test.ts
  - apps/web/src/lib/__tests__/numbering.chronology.test.ts
  - apps/web/src/lib/__tests__/invoice-template.periode.test.ts
  - apps/web/src/lib/invoice-chronology.ts
  - apps/web/src/lib/__tests__/invoice-chronology.test.ts
  - apps/web/src/server/actions/invoices.ts
  - apps/web/src/server/actions/__tests__/invoices-audit.test.ts
  - apps/web/src/lib/einvoice/invoice-snapshot.ts
  - apps/web/scripts/audit-invoice-chronology.ts
  - apps/web/src/components/invoices/create-invoice-button.tsx
  - apps/web/src/components/invoices/create-sponsor-invoice-button.tsx
  - apps/web/src/components/dossiers-opco/emit-invoice-button.tsx

must_haves:
  truths:
    - "Une session terminée en juin, facturée en septembre, porte une date d'émission de septembre."
    - "La période réelle de formation reste lisible sur la facture, sur la ligne et dans le bloc désignation du PDF."
    - "Les numéros et les dates d'émission montent ensemble : aucun numéro plus grand ne porte une date plus ancienne."
    - "Le délai de paiement continue de courir depuis le jour d'émission réel — une facture rattrapée ne naît pas en retard."
    - "Si une émission crée malgré tout une rupture, l'utilisateur en est informé et la facture est quand même émise."
    - "Le fichier qui porte la règle explique ce qu'était la décision du 13/08/2026, pourquoi elle avait été prise et pourquoi elle est révisée."
  artifacts:
    - path: "apps/web/src/lib/invoice-dates.ts"
      provides: "resolveInvoiceIssueDate (arité 0) + resolveInvoiceDueDate + l'historique de la décision"
      exports: ["resolveInvoiceIssueDate", "resolveInvoiceDueDate"]
    - path: "apps/web/src/lib/invoice-chronology.ts"
      provides: "sequencePrefixOf + chronologyWarning — le filet, pur et testable"
      exports: ["sequencePrefixOf", "chronologyWarning"]
    - path: "apps/web/src/lib/__tests__/numbering.chronology.test.ts"
      provides: "L'invariante §4 de la spec, exécutable"
  key_links:
    - from: "apps/web/src/server/actions/invoices.ts"
      to: "apps/web/src/lib/invoice-dates.ts"
      via: "issueDate = resolveInvoiceIssueDate(), dueDate = resolveInvoiceDueDate(dueDays, emission)"
      pattern: "resolveInvoiceIssueDate\\(\\)"
    - from: "apps/web/src/server/actions/invoices.ts"
      to: "apps/web/src/lib/invoice-chronology.ts"
      via: "lecture du prédécesseur dans la transaction, avant le create"
      pattern: "chronologyWarning\\("
    - from: "les trois boutons d'émission"
      to: "le champ warning du retour d'action"
      via: "toast.warning(r.warning)"
      pattern: "r\\.warning"
---

<objective>
Lot B de la spec `2026-09-10-datation-numerotation-factures.md` : la date
d'émission d'une facture devient le jour où elle est réellement établie, et
non plus la fin de la prestation.

**Pourquoi.** Le numéro est attribué à l'instant du clic, la date venait de la
fin de session : deux horloges différentes. L'inventaire du 10/09/2026 a mesuré
5 ruptures sur 31 pièces. Le lot 2 de `/facture-electronique` va figer cette
date dans un XML transmis à une plateforme d'État — mieux vaut que la règle
soit juste avant.

**Ce que ça libère.** Le lot 1 e-invoicing a donné des lignes aux factures. La
période de formation a donc enfin un endroit où vivre (`InvoiceLine.label`,
livré) — c'est précisément parce qu'elle n'en avait pas que la date d'émission
avait été détournée pour la porter.

**Sortie.** La numérotation redevient chronologique par construction, une
invariante testée le dit, un filet informe si elle est malgré tout franchie.
</objective>

<context>
@.planning/specs/2026-09-10-datation-numerotation-factures.md
@.claude/commands/quick.md
@apps/web/src/lib/invoice-dates.ts
@apps/web/src/lib/numbering.ts
@apps/web/src/lib/einvoice/invoice-snapshot.ts
@apps/web/src/server/actions/invoices.ts
@apps/web/scripts/audit-invoice-chronology.ts
</context>

<ce_qui_a_ete_verifie_avant_ce_plan>

Lis ceci avant d'écrire une ligne : ces points sont **vérifiés**, ne les
réinstruis pas et ne les réimplémente pas.

**1. `resolveInvoiceIssueDate` n'a que deux appelants de production.**
`invoices.ts:283` (facture individuelle) et `invoices.ts:545` (facture
groupée). Rien d'autre, hors tests et commentaires.

**2. La période de formation est DÉJÀ portée par la ligne — rien à
implémenter.** `buildTrainingLines` (`invoice-snapshot.ts:344-357`) construit
`periode` (`le X` / `du X au Y`) et l'assemble dans `label`. C'est déjà
verrouillé par un test : `invoice-snapshot.test.ts:195-198` assert que le label
contient `01/06/2026` et `03/06/2026`. La facture **groupée** passe par la même
fonction : elle est couverte aussi.

**3. Le gabarit PDF porte DÉJÀ la période — rien à implémenter non plus.**
`invoice-template.ts:296` rend `<strong>Dates :</strong> ${datesLabel}` dans le
bloc désignation, et `datesLabel` est construit lignes 224-228 depuis
`formationDateDebut`/`formationDateFin`. Ce que le lot B change, ce n'est pas
le gabarit, c'est la **valeur** que reçoit `d.issueDate`.

⚠ Conséquence : ce qui reste à faire sur le point 2 du périmètre, ce n'est pas
d'écrire du code, c'est de **verrouiller par un test** ce qui n'est aujourd'hui
protégé par rien côté gabarit — car après ce lot, le bloc désignation devient
le **seul** endroit de la facture où la période apparaît. Avant, l'en-tête
« Date » la portait implicitement.

**4. L'avoir ne porte pas de période, et c'est normal.**
`buildCreditNoteLine` produit `Avoir sur facture FAC-XXXX — motif`. La période
vit sur la facture d'origine, que l'avoir nomme. Hors périmètre.

**5. Le gabarit contient une redondance cosmétique préexistante**
(`invoice-template.ts:293-295` affiche trois fois « Formation : titre »).
**Ne la corrige pas** — elle est antérieure et sans rapport. Signale-la dans le
compte rendu, c'est tout.

</ce_qui_a_ete_verifie_avant_ce_plan>

<decisions>

**D-1 — On RETIRE le paramètre `sessionEndDate`. Signature :
`resolveInvoiceIssueDate(now: Date = new Date()): Date`.**

Trois options pesées :

| Option | Coût | Pourquoi elle est écartée / retenue |
|---|---|---|
| Garder `sessionEndDate`, l'ignorer | 0 fichier appelant touché | ✗ Un paramètre que personne ne lit est une promesse fausse : le prochain lecteur voit `resolveInvoiceIssueDate(session.endDate)` au point d'appel et croit que la fin de session commande la date. C'est exactement le piège dont on sort. |
| Supprimer la fonction, écrire `new Date()` en ligne | 2 appelants touchés | ✗ Efface la trace de la décision du 13/08 et de sa révision. Or la spec demande explicitement de la conserver et de l'expliquer. |
| **Retirer le paramètre, garder la fonction** | **2 appelants touchés** | ✓ **Retenue.** La fonction reste le domicile nommé de la règle et de son histoire ; `issueDate: resolveInvoiceIssueDate()` au point d'appel dit « il y a une règle ici, va la lire ». Et le coût est nul en pratique : les deux appelants doivent être édités de toute façon, leurs commentaires en place (« Datée de la fin de formation ») devenant faux. |

**La garde anti-date-future disparaît avec le paramètre.** Elle n'a plus
d'objet : `now` n'est jamais dans le futur. Ce n'est pas un oubli, c'est une
conséquence — à dire dans le commentaire d'en-tête.

**D-2 — L'alerte douce se calcule DANS la transaction d'émission, et informe
après coup. Pas de pré-vol, pas de modale de confirmation.**

La spec écrit « si une émission **créerait** une rupture ». Un pré-vol
supposerait une lecture supplémentaire hors transaction, puis un dialogue qui —
puisqu'il ne bloque pas — se réduirait à un « continuer » de pure friction.
La lecture du prédécesseur se fait donc dans la même transaction, juste avant
le `create`, et la phrase revient dans le retour de l'action. Même information,
un aller-retour en moins, et l'état lu est celui sur lequel la pièce s'écrit.

Note honnête : **avec la règle corrigée, cette alerte ne peut plus se déclencher
en usage normal** — toute nouvelle pièce est datée d'aujourd'hui, donc jamais
antérieure à une pièce passée. C'est une sentinelle, pas un contrôle courant :
elle ne parlera que si une date a été posée à la main en base ou si quelqu'un
réintroduit une règle de datation dérivée. C'est précisément ce qu'on veut
détecter, et c'est ce que le commentaire du module doit dire.

**D-3 — Le filet ne réutilise pas les helpers de `scripts/audit-invoice-chronology.ts`.**

Ils sont purs et exportés, mais le module les hébergeant importe `prisma` au
premier niveau et constitue le livrable du lot A, déjà passé sur la production.
Faire dépendre `src/` d'un fichier de `scripts/` inverse la dépendance. On
duplique donc les ~4 lignes de normalisation à minuit UTC dans
`lib/invoice-chronology.ts`, **en le disant dans l'en-tête du nouveau module** :
même arithmétique, deux consommateurs distincts (inventaire hors ligne vs
sentinelle dans le chemin d'écriture).

</decisions>

<pieges_identifies>

**P-1 — Le test de datation ne peut PAS être rendu RED par une assertion de
valeur. Ne perds pas une heure à essayer.**

L'implémentation actuelle est `(sessionEndDate, now = new Date()) => !sessionEndDate ? now : (sessionEndDate > now ? now : sessionEndDate)`.
Si tu l'appelles avec la nouvelle forme — un seul argument, une date passée —
elle rend cet argument. `expect(resolveInvoiceIssueDate(CLIC)).toEqual(CLIC)`
**passe déjà aujourd'hui**. Idem pour `resolveInvoiceIssueDate()` sous
`vi.setSystemTime`. Toute assertion de valeur en un seul argument est une
tautologie qui te fera croire au vert.

Le RED honnête tient en trois faits, tous vérifiables :
- `expect(resolveInvoiceIssueDate.length).toBe(0)` — `Function.length` compte
  les paramètres avant le premier défaut : 1 aujourd'hui, 0 après. C'est la
  seule façon d'écrire « ce paramètre n'existe plus » comme un fait exécutable.
- les points d'appel : `expect(INVOICES_SRC).not.toMatch(/resolveInvoiceIssueDate\(\s*session\.endDate/)`
  — deux occurrences aujourd'hui, zéro après. Le dépôt a déjà ce style de test
  structurel (`server/actions/__tests__/invoices-audit.test.ts` lit tout le
  source de `invoices.ts`) : suis-le, ne l'invente pas.
- `resolveInvoiceDueDate` et `lib/invoice-chronology.ts` n'existent pas : tout
  fichier de test qui les importe est RED par l'import.

**P-2 — Ajouter `warning` au retour casse un test structurel existant.**

`invoices-audit.test.ts:121` et `:126` assertent la chaîne EXACTE
`return { ok: true, invoiceId: invoice.id, documentId: doc.id, number: invoice.number }`.
Ajouter un champ fait tomber le `}` final et le regex ne matche plus. Ce test
est une anti-régression de signature ; ajouter un champ optionnel est additif et
ne casse aucun appelant. **Relâche les deux regex** pour tolérer la suite
(`number: invoice\.number[,}]`) — délibérément, en une ligne de commentaire dans
le test. Ne le supprime pas, ne le contourne pas.

**P-3 — Deux commentaires deviennent factuellement faux et doivent être repris.**

- `apps/web/src/lib/einvoice/invoice-snapshot.ts:476-477` : « la DATE
  D'ÉMISSION (`resolveInvoiceIssueDate` retombe sur le jour courant **quand la
  session n'est pas terminée**) ». Elle vaut désormais toujours le jour courant.
  Le raisonnement du bloc (pourquoi la date est hors empreinte) reste juste :
  seule la parenthèse est à corriger.
- `apps/web/scripts/audit-invoice-chronology.ts:13-18` : décrit la règle du
  13/08 **au présent** comme cause des ruptures. C'est le seul motif autorisé de
  toucher ce fichier (livrable du lot A, déjà passé sur la prod). Mets la cause
  au passé et dis que le lot B l'a corrigée. **Ne touche à rien d'autre dans ce
  fichier** : ni les helpers, ni le rendu, ni la garde `--apply`.

**P-4 — Ordre dans la transaction.** La lecture du prédécesseur doit se faire
**après** `getNextInvoiceNumber` et **avant** `tx.invoice.create`. Après le
`create`, le prédécesseur lu serait la pièce qu'on vient d'écrire.

**P-5 — `emission` est calculée une fois et sert aux deux dates.** Aujourd'hui
`dueDate` utilise `Date.now()` et `issueDate` un `new Date()` distinct : deux
instants à quelques millisecondes. Calcule `const emission = resolveInvoiceIssueDate()`
avant la transaction, passe-la à `resolveInvoiceDueDate(dueDays, emission)`.
L'échéance devient alors littéralement ancrée sur l'émission dans le code, ce
qui est ce que la règle a toujours dit.

**P-6 — Aucune migration Prisma.** Aucun champ nouveau n'est nécessaire :
`Invoice.issueDate`, `Invoice.dueDate` et `InvoiceLine.label` existent tous. Si
tu crois avoir besoin d'un champ, **arrête-toi et dis-le** au lieu d'en créer
un. `prisma db push` est interdit (quick.md §4).

**P-7 — Rien ne se réécrit.** Le lot C est fermé (spec §7 et §8). Aucun
`UPDATE`, aucun script de correction, aucune migration de données sur les 31
pièces existantes. Les 5 ruptures mesurées restent telles quelles.

</pieges_identifies>

<tasks>

<task type="auto" tdd="true">
  <name>Tâche 1 — RED : les tests qui disent la règle cible</name>
  <files>
apps/web/src/lib/__tests__/invoice-dates.test.ts (réécrit),
apps/web/src/lib/__tests__/numbering.chronology.test.ts (nouveau),
apps/web/src/lib/__tests__/invoice-chronology.test.ts (nouveau)
  </files>
  <behavior>
`invoice-dates.test.ts` — réécrit, l'ancien décrivait la règle inverse :
  - la date d'émission est le jour d'établissement (lecture de la règle) ;
  - `resolveInvoiceIssueDate.length === 0` : la fin de prestation n'est plus un
    paramètre (cf. P-1, c'est le RED) ;
  - les deux points d'émission de `invoices.ts` n'alimentent plus `issueDate`
    depuis `session.endDate` — lecture du source, à la manière de
    `invoices-audit.test.ts` (RED : 2 occurrences aujourd'hui) ;
  - `resolveInvoiceDueDate(30, emission)` rend `emission + 30 jours` — la règle
    d'échéance est INCHANGÉE par ce lot, et ce test est là pour le prouver
    (contrainte : une facture rattrapée ne doit pas naître en retard) ;
  - `resolveInvoiceDueDate` est ancrée sur l'argument `now` qu'on lui passe,
    pas sur l'horloge système.

`numbering.chronology.test.ts` — l'invariante de la spec §4, exécutable :
  « pour un tenant et un préfixe donnés, `number(n) > number(n-1)` ⟹
  `issueDate(n) >= issueDate(n-1)` ».
  - Mocke `@qualiof/db` sur le modèle exact de `numbering.test.ts` (factory
    `vi.mock`, `tenant.findUnique` + `invoice.findFirst` en `vi.fn()`).
  - Rejoue le scénario réel du §5 : une session terminée le 01/09 facturée le
    04/09, PUIS une session terminée le 12/06 facturée le 07/09, PUIS une
    session terminée le 20/07 facturée le 07/09. Chaque émission appelle
    `getNextInvoiceNumber` (registre alimenté au fur et à mesure) puis
    `resolveInvoiceIssueDate(clic)` et `resolveInvoiceDueDate(30, emission)`.
  - Assertions : les numéros montent ; aucune date d'émission ne recule quand
    le numéro monte ; chaque `dueDate` vaut son `issueDate` + 30 j.
  - RED par l'import : `resolveInvoiceDueDate` n'existe pas encore.

`invoice-chronology.test.ts` — le filet, en pur (RED : le module n'existe pas) :
  - `sequencePrefixOf('FAC-000032') === 'FAC-'`, `sequencePrefixOf('F-202601-214') === 'F-202601-'`,
    `sequencePrefixOf('SANSTIRET') === null`, `sequencePrefixOf('FAC-') === null`,
    `sequencePrefixOf('FAC-00A1') === null` ;
  - `chronologyWarning` rend `null` quand : pas de prédécesseur ; prédécesseur
    sans `issueDate` ; prédécesseur antérieur ; prédécesseur **le même jour à
    une heure différente** (la comparaison est en jours calendaires — deux
    pièces du même jour ne sont pas une rupture) ;
  - `chronologyWarning` rend une phrase contenant les deux numéros et les deux
    dates au format `jj/mm/aaaa` quand la date recule.
  </behavior>
  <action>
Écris les trois fichiers. Lis d'abord P-1 : n'écris AUCUNE assertion de valeur
en un seul argument sur `resolveInvoiceIssueDate` en croyant qu'elle est RED.

Pour la lecture du source dans `invoice-dates.test.ts`, copie le mécanisme de
`apps/web/src/server/actions/__tests__/invoices-audit.test.ts` (comment il
charge `INVOICES_SRC`) — même approche, même style, pas d'invention.

Vérifie que le rouge est bien du rouge : lance les trois fichiers et LIS les
messages d'échec un par un. Un fichier rouge « parce que l'import a échoué »
est légitime (`resolveInvoiceDueDate`, `invoice-chronology`) ; un fichier rouge
pour une faute de frappe ne l'est pas.

Commit : `test(260910-lon): la date d'émission est le jour d'établissement — tests RED`
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web exec vitest run src/lib/__tests__/invoice-dates.test.ts src/lib/__tests__/numbering.chronology.test.ts src/lib/__tests__/invoice-chronology.test.ts</automated>
  </verify>
  <done>Les trois fichiers échouent, et chaque échec s'explique par une absence réelle (paramètre encore présent, export inexistant, module inexistant) — pas par une erreur de test.</done>
</task>

<task type="auto" tdd="true">
  <name>Tâche 2 — GREEN : la règle de datation, et son histoire écrite</name>
  <files>
apps/web/src/lib/invoice-dates.ts,
apps/web/src/server/actions/invoices.ts,
apps/web/src/lib/einvoice/invoice-snapshot.ts,
apps/web/scripts/audit-invoice-chronology.ts,
apps/web/src/lib/__tests__/invoice-template.periode.test.ts (nouveau)
  </files>
  <action>
**1. `invoice-dates.ts` — réécris le fichier.**

Deux exports :

```ts
export function resolveInvoiceIssueDate(now: Date = new Date()): Date { return now; }
export function resolveInvoiceDueDate(dueDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + dueDays * 86_400_000);
}
```

L'en-tête de `resolveInvoiceIssueDate` est **un livrable du lot**, pas de la
décoration. Il doit dire, dans cet ordre :
  - **ce que la règle était** : décision de Laurent du 13/08/2026, la facture se
    datait de la fin de la prestation, avec une garde interdisant le futur ;
  - **pourquoi elle avait été prise** — deux motifs réels à l'époque : c'est ce
    que Laurent inscrivait à la main sur ses factures, et ça évitait deux dates
    contradictoires sur la pièce acquittée (« Date » en haut du document,
    « Fait à … le … » en bas) ;
  - **pourquoi elle est révisée** : l'effet de bord était connu et assumé, mais
    son coût de conformité n'avait pas été pesé — l'inventaire du 10/09/2026 a
    mesuré 5 ruptures sur 31 pièces, et le Factur-X du lot 2 fige cette date
    dans un XML transmis à une plateforme d'État ;
  - **pourquoi les deux motifs de 13/08 sont éteints, pas contournés** : la
    mention manuscrite n'a plus lieu d'être puisque l'app émet la pièce, et la
    contradiction « Date » / « Fait à … le … » disparaît d'elle-même puisque les
    deux valent désormais le jour d'émission (spec §3) ;
  - **où vit désormais la période d'exécution** : `InvoiceLine.label` depuis le
    lot 1 e-invoicing, et le bloc désignation du gabarit ;
  - **que la garde anti-date-future disparaît avec le paramètre**, faute d'objet ;
  - la trace : la spec `.planning/specs/2026-09-10-datation-numerotation-factures.md`
    et `docs/comptabilite/note-chronologie-factures-2026.md`.

L'en-tête de `resolveInvoiceDueDate` dit que la règle est **inchangée** et
pourquoi elle est extraite ici : maintenant que `issueDate` vaut aussi `now`,
plus rien ne distingue les deux règles à la lecture d'un diff — il faut un test
qui dise que l'échéance est ancrée sur l'émission.

Conserve le paragraphe existant sur le caractère NEUTRE du module (ni
`'use server'` ni `'use client'`), il est toujours vrai.

**2. `invoices.ts` — les deux points d'émission.**

Ligne 18 : importe aussi `resolveInvoiceDueDate`.

Aux deux endroits (~279-284 pour la facture individuelle, ~543-546 pour la
groupée), juste avant `const invoice = await prisma.$transaction(...)` :

```ts
const emission = resolveInvoiceIssueDate();
```

et dans le `data:` du `create` :

```ts
issueDate: emission,
dueDate: resolveInvoiceDueDate(dueDays, emission),
```

**Remplace les commentaires en place** : « Datée de la fin de formation (cf.
resolveInvoiceIssueDate) » et « Idem facture individuelle : datée de la fin de
formation » sont devenus faux. Écris ce qui est vrai — la pièce se date du jour
où elle est établie, la période réelle de formation est portée par les lignes
(`buildTrainingLines`), l'échéance court depuis l'émission.

**3. `invoice-snapshot.ts:476-477` — corrige la parenthèse** (cf. P-3). Le
raisonnement du bloc (pourquoi la date d'émission est volontairement absente de
l'empreinte) reste juste et ne change pas.

**4. `scripts/audit-invoice-chronology.ts:13-18` — mets la cause au passé**
(cf. P-3). C'est le SEUL motif autorisé de toucher ce fichier. Ne touche à rien
d'autre dedans.

**5. `invoice-template.periode.test.ts` — verrouille la période sur le gabarit.**

⚠ Ce test **passe déjà** avant ta modification, et c'est assumé : ce n'est pas
un RED, c'est un verrou. Il est ici et pas en tâche 1 précisément pour ne pas
polluer le commit RED (quick.md §2 : « pas de test qui passe déjà »). Sa raison
d'être : après ce lot, le bloc désignation devient le **seul** endroit de la
facture où la période de formation apparaît — avant, l'en-tête « Date » la
portait implicitement. Ce qui n'est protégé par rien finit par disparaître.

Suis le style de `invoice-template.acquitted.test.ts` (même façon de construire
un `InvoiceData` de base). Assertions, sur une facture émise le 07/09/2026 pour
une session du 01 au 03/06/2026 :
  - le HTML contient `<strong>Dates :</strong>` suivi de `du 01/06/2026 au 03/06/2026` ;
  - le HTML contient `Date: 07/09/2026` dans l'en-tête ;
  - la période et la date d'émission sont bien **deux valeurs distinctes** dans
    le document (c'est tout l'objet du lot) ;
  - cas journée unique : début = fin = 01/06/2026 rend `le 01/06/2026`, pas
    `du … au …`.

**Ne modifie PAS `invoice-template.ts`.** L'en-tête reste libellé « Date » : la
spec §3 situe la date d'émission exactement là, sous ce libellé. Si à la
relecture du PDF (tâche 4) l'ambiguïté « Date » / « Dates » gêne à l'œil,
signale-la — ne la tranche pas seul.

Commit : `feat(260910-lon): une facture se date du jour où on l'établit`
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web exec vitest run src/lib/__tests__/invoice-dates.test.ts src/lib/__tests__/numbering.chronology.test.ts src/lib/__tests__/invoice-template.periode.test.ts src/lib/einvoice/__tests__/invoice-snapshot.test.ts scripts/__tests__/audit-invoice-chronology.test.ts</automated>
  </verify>
  <done>
`resolveInvoiceIssueDate` est d'arité 0 et rend `now` ; `resolveInvoiceDueDate`
existe et est ancrée sur l'émission ; les deux points d'émission n'utilisent
plus `session.endDate` ; l'invariante §4 est verte ; le gabarit est verrouillé
sur la période ; les tests du lot A restent verts. `invoice-chronology.test.ts`
est encore rouge — c'est la tâche 3.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Tâche 3 — GREEN : le filet, qui informe et ne bloque pas</name>
  <files>
apps/web/src/lib/invoice-chronology.ts (nouveau),
apps/web/src/server/actions/invoices.ts,
apps/web/src/server/actions/__tests__/invoices-audit.test.ts,
apps/web/src/components/invoices/create-invoice-button.tsx,
apps/web/src/components/invoices/create-sponsor-invoice-button.tsx,
apps/web/src/components/dossiers-opco/emit-invoice-button.tsx
  </files>
  <action>
**1. `lib/invoice-chronology.ts` — le module pur.**

```ts
export function sequencePrefixOf(number: string): string | null
export function chronologyWarning(input: {
  number: string;
  issueDate: Date;
  previous: { number: string; issueDate: Date | null } | null;
}): string | null
```

`sequencePrefixOf` coupe au DERNIER tiret et n'accepte que des chiffres à
droite — même lecture que `parseSequenceNumber` du script d'audit, et pour la
même raison : le préfixe se lit sur le numéro qu'on vient d'obtenir, pas sur le
paramétrage du tenant. Deux sources pour la même vérité finiraient par diverger.

`chronologyWarning` compare en **jours calendaires**, bornes ramenées à minuit
UTC : deux pièces du même jour émises à des heures différentes ne sont pas une
rupture. Rend `null` dans tous les cas sains, une phrase française sinon,
contenant les deux numéros et les deux dates en `jj/mm/aaaa` — et disant que la
facture EST émise. L'utilisateur doit comprendre qu'on l'informe, pas qu'on lui
refuse quelque chose.

L'en-tête du module doit dire deux choses (cf. D-2 et D-3) :
  - **pourquoi cette sentinelle ne parlera probablement jamais** : depuis le lot
    B, toute pièce est datée d'aujourd'hui, donc jamais antérieure à une pièce
    passée. Elle ne se déclenchera que si une date a été posée à la main en base
    ou si quelqu'un réintroduit une datation dérivée. C'est ce qu'on veut
    attraper, et c'est pour ça qu'elle reste ;
  - **pourquoi elle ne réutilise pas les helpers de
    `scripts/audit-invoice-chronology.ts`** : même arithmétique, mais ce module
    importe `prisma` au premier niveau et faire dépendre `src/` d'un fichier de
    `scripts/` inverse la dépendance. Deux consommateurs distincts : un
    inventaire hors ligne, une sentinelle dans le chemin d'écriture.

**2. `invoices.ts` — brancher, aux deux points d'émission.**

Dans la transaction, **après** `getNextInvoiceNumber` et **avant**
`tx.invoice.create` (P-4) :

```ts
const number = await getNextInvoiceNumber(user.tenantId, tx);
const prefix = sequencePrefixOf(number);
const previous = prefix
  ? await tx.invoice.findFirst({
      where: { tenantId: user.tenantId, number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true, issueDate: true },
    })
  : null;
```

`tenantId` obligatoire dans le `where`, checklist quick.md §3.

La transaction rend désormais **un couple** — `{ invoice, alert }` — plutôt que
d'affecter une variable extérieure depuis le callback : une transaction peut
être rejouée, et une écriture hors de son périmètre n'est pas rejouable
proprement. Adapte le `const invoice = await prisma.$transaction(...)` en
conséquence aux deux endroits ; le nom `invoice` reste inchangé pour la suite du
corps de fonction.

Élargis le type de retour des deux actions avec `warning?: string`, et ajoute le
champ aux `return { ok: true, ... }` (lignes 403 et 671).

**3. `invoices-audit.test.ts` — relâche les deux regex** (P-2, lignes 121 et
126). Remplace la fin `number: invoice\.number }` par `number: invoice\.number[,}]`,
avec une ligne de commentaire disant pourquoi : le lot B ajoute un `warning`
optionnel, additif, qui ne casse aucun appelant — le test garde son rôle
d'anti-régression sur les quatre champs qui, eux, ne bougent pas.

**4. Les trois boutons — une ligne chacun**, après le succès :

- `create-sponsor-invoice-button.tsx` et `emit-invoice-button.tsx` importent
  déjà `toast` de `sonner` : ajoute `if (r.warning) toast.warning(r.warning);`
  juste après le `toast.success`.
- `create-invoice-button.tsx` n'utilise pas `sonner` (état local, pas de toast).
  Ajoute `import { toast } from 'sonner';` — le `<Toaster />` est monté dans le
  layout racine, l'appel fonctionne depuis n'importe quel client component.

Aucun de ces boutons ne doit **bloquer** ni changer de chemin sur un warning :
la facture est émise, le PDF s'ouvre, le succès s'affiche. Le warning s'ajoute,
il ne remplace rien.

Commit : `feat(260910-lon): une sentinelle qui informe si la chronologie casse`
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web exec vitest run src/lib/__tests__/invoice-chronology.test.ts src/server/actions/__tests__/invoices-audit.test.ts src/server/actions/__tests__/credit-note.test.ts</automated>
  </verify>
  <done>
Le module pur est vert ; les deux actions renvoient `warning` quand la date
recule et `undefined` sinon ; le test structurel de signature est vert et
toujours utile ; les trois boutons affichent le warning sans rien bloquer.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Tâche 4 — Gates, puis un PDF sous les yeux</name>
  <files>aucun — cette tâche ne modifie rien, elle vérifie</files>
  <action>Passe les trois gates, puis émets une vraie facture et ouvre le PDF. Le détail des points à regarder est dans &lt;how-to-verify&gt; ci-dessous : suis-le dans l'ordre, ne l'abrège pas. Rien ne se commite dans cette tâche ; si un point 2 ou 3 révèle un défaut, reviens sur la tâche concernée avant de rendre la main.</action>
  <what-built>
La date d'émission est le jour d'établissement. La période de formation reste
sur la ligne et dans le bloc désignation. L'invariante chronologique de la spec
§4 est testée. Une sentinelle informe si la chronologie casse malgré tout.
L'histoire de la décision du 13/08 et de sa révision est écrite dans
`invoice-dates.ts`.
  </what-built>
  <how-to-verify>
**1. Les trois gates, dans cet ordre (quick.md §5) :**

```
pnpm lint
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm test
```

Les trois vertes, sans exception. Si un test échouait **déjà avant** cette
tâche, dis-le explicitement et consigne-le — ne le « répare » pas au passage.

**2. Un PDF de facture, regardé — pas seulement testé.**

La spec §7 est explicite : « Le lot B touche le gabarit de facture : regarder un
PDF produit, pas seulement les tests. » Émets une facture depuis l'app sur une
session **déjà terminée** (c'est le cas qui change) et ouvre le PDF.

À vérifier à l'œil, dans cet ordre :
  - en-tête, `Date:` → **le jour d'aujourd'hui**, plus la fin de session ;
  - bloc désignation, `Dates :` → la **période réelle de la formation**,
    inchangée ;
  - `Date d'échéance` → aujourd'hui + 30 jours, pas une date déjà passée ;
  - le numéro attribué est bien le suivant de la séquence ;
  - la lisibilité d'ensemble : `Date` (émission) et `Dates` (formation)
    coexistent maintenant avec des valeurs différentes sur la même page. **Si
    ça se lit mal, dis-le — c'est une décision de Laurent, pas une correction à
    prendre seul** (cf. tâche 2, point 5).

**3. Facturation à l'inscription — la garde à ne pas casser.**

Émets une facture depuis le wizard étape 5, sur une session **non terminée**.
Attendu : `Date:` = aujourd'hui (comportement inchangé), et la ligne porte la
période **prévisionnelle** de la session.

**4. La sentinelle, si tu veux la voir parler.**

En usage normal elle ne se déclenchera pas (c'est le but — cf. D-2). Sa
couverture est unitaire. Ne fabrique pas une rupture en base pour la voir.

**5. Ce qui reste à faire APRÈS le merge — à ne PAS faire maintenant.**

`docs/comptabilite/note-chronologie-factures-2026.md` §4 (~lignes 91-93) dit
aujourd'hui que la correction « n'est pas encore déployée à la date de la
présente note ». C'est une pièce opposable : elle doit dire le vrai. Son encadré
de statut se met à jour **une fois le lot B déployé** — mergé sur `main` et parti
en production — pas au moment du commit sur une branche (spec §7, ⚠ explicite).
**Ne touche pas à ce fichier dans ce lot.** Note-le comme action post-merge.
  </how-to-verify>
  <done>Les trois gates sont vertes ; un PDF de facture émis sur une session terminée a été ouvert et relu ; la facturation à l'inscription est vérifiée inchangée ; l'action post-merge sur la note comptable est consignée et le fichier n'a pas été touché.</done>
  <resume-signal>Réponds « validé », ou décris ce que le PDF montre de travers.</resume-signal>
</task>

</tasks>

<verification>

Après la tâche 3, avant le checkpoint :

```bash
# Plus aucun appel de resolveInvoiceIssueDate ne passe session.endDate
grep -rn "resolveInvoiceIssueDate(" apps/web/src apps/web/scripts | grep -v "__tests__"

# La période vit toujours dans le label de ligne
grep -n "periode" apps/web/src/lib/einvoice/invoice-snapshot.ts

# Aucune migration créée
git status --porcelain packages/db/prisma/migrations/

# Aucune écriture sur les pièces existantes (lot C fermé)
git diff --stat | grep -i "migration\|seed\|backfill" || echo "aucun script de reprise — OK"
```

</verification>

<success_criteria>

- [ ] `resolveInvoiceIssueDate` est d'arité 0 et rend le jour d'établissement.
- [ ] Les deux points d'émission de `invoices.ts` n'alimentent plus `issueDate`
      depuis `session.endDate` ; leurs commentaires en place disent le vrai.
- [ ] `resolveInvoiceDueDate` existe, est ancrée sur l'émission, et un test le
      dit — le comportement de `dueDate` est inchangé.
- [ ] L'invariante §4 est un test qui tourne : les numéros montent, les dates ne
      reculent pas.
- [ ] La période de formation est verrouillée par un test côté ligne
      (préexistant) ET côté gabarit (ajouté).
- [ ] Une sentinelle pure informe sans bloquer ; les trois boutons la relaient.
- [ ] `invoice-dates.ts` porte l'histoire complète : ce qu'était la règle du
      13/08, ses deux motifs, pourquoi elle est révisée, pourquoi ses motifs
      sont éteints.
- [ ] Les deux commentaires devenus faux (`invoice-snapshot.ts`,
      `scripts/audit-invoice-chronology.ts`) sont repris — et rien d'autre n'est
      touché dans le script du lot A.
- [ ] Aucune migration Prisma, aucun `UPDATE`, aucun script de reprise.
- [ ] `docs/comptabilite/note-chronologie-factures-2026.md` **non modifié**
      (action post-merge, consignée dans le compte rendu).
- [ ] `pnpm lint`, `pnpm --filter @qualiof/web exec tsc --noEmit`, `pnpm test` :
      les trois vertes.
- [ ] Un PDF de facture a été ouvert et relu.

</success_criteria>

<compte_rendu>
Trois lignes en fin de lot (quick.md §6) :
- ce qui change pour l'utilisateur ;
- ce qui a été mis de côté (redondance cosmétique du gabarit ligne 293-295,
  libellé « Date » de l'en-tête si l'ambiguïté a gêné à la relecture) ;
- ce qu'il reste à faire à la main : **mettre à jour l'encadré §4 de
  `docs/comptabilite/note-chronologie-factures-2026.md` une fois le lot déployé
  sur `main` et en production.**
</compte_rendu>

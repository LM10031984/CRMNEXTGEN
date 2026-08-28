# Phase 23 : Tarification par payeur (SessionPricing) — Research

**Researched:** 2026-08-28
**Domain:** Tarification session × payeur — Prisma/Next.js 14 App Router, code existant du dépôt (vérification factuelle, pas d'exploration de bibliothèques)
**Confidence:** HIGH — toutes les affirmations ci-dessous sont vérifiées dans le code, fichier et ligne à l'appui. Les zones non vérifiables sont listées en « Inconnues restantes ».

## Summary

L'architecture est décidée (CONTEXT.md) ; cette recherche vérifie dans le code les huit points dont le plan dépend. Résultat : **tous les points d'ancrage existent et sont réutilisables tels quels**. La facture groupée par payeur existe (`createInvoiceForSponsorGroup`, `Invoice.participantIds` + `sessionId`), les verrous existent (`classifyParticipantPrice`, pur et testé), la source unique du prix existe (`resolveDefaultParticipantPrice`, appelée par les trois chemins de création d'inscrit), la règle payeur existe et n'a pas de doublon fonctionnel (`isPersonneMoralePayeur`), la convention d'entreprise a déjà un champ « prix global » (`prixGlobalHT`) et un précédent de blocage dur à deux étages (pré-contrôle `blocagesDocsEntreprise` + refus du cœur).

Trois découvertes qui doivent remonter au plan : **(1)** l'index `@@unique([sessionId, sponsorOrgId])` avec `sponsorOrgId` nullable **n'empêche PAS** deux lignes par défaut (`NULL`) sur la même session — Postgres traite les NULL comme distincts, il faut un index unique partiel en SQL brut dans la migration ; **(2)** le dialog UI `AddParticipantDialog` envoie **toujours** un `priceHT` explicite (`|| 0`), donc la cascade est court-circuitée sur ce chemin UI — un 0 silencieux peut encore naître par là ; **(3)** la commande `.claude/commands/tarification.md` contient un paragraphe « Backfill » qui **contredit** le hors-périmètre verrouillé de cette phase — le plan doit explicitement l'ignorer.

**Primary recommendation:** étendre `resolveDefaultParticipantPrice` (module pur — les appelants chargent et passent les lignes `SessionPricing`), brancher le forfait dans `generateConventionEntrepriseCore` à l'endroit exact où `prixGlobalHT` est calculé aujourd'hui (`convention-core.ts:352`), et poser l'index unique partiel dans le SQL de migration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Modèle de données

- `SessionPricing` : `id`, `tenantId`, `sessionId`, `sponsorOrgId String?`,
  `mode`, `amountHT Decimal(10,2)`, `vatRate Decimal(5,2)`, `note String?`,
  `@@unique([sessionId, sponsorOrgId])`
- `sponsorOrgId = null` ⇒ ligne par défaut « indépendants / TNS » de la session
- `mode` ∈ { `FORFAIT_GROUPE`, `PAR_STAGIAIRE` } — **toujours explicite, jamais déduit**
- Une session porte typiquement deux lignes : la ligne par défaut en `PAR_STAGIAIRE`,
  et une ligne `FORFAIT_GROUPE` par entreprise. Rien n'interdit une entreprise en
  `PAR_STAGIAIRE` si elle préfère payer à la tête.
- `session.pricePerLearner` est **conservé** comme repli n°3 et n'est pas touché. Sa
  suppression est un chantier séparé, à faire quand plus aucune session vivante ne l'utilise.

#### Résolution du prix d'un inscrit

Cascade, en s'arrêtant au premier qui répond :
1. la ligne `SessionPricing` de **son** `sponsorOrgId`
2. la ligne par défaut de la session (`sponsorOrgId = null`)
3. `session.pricePerLearner`
4. le produit

- **Jamais 0 en repli.** 0 doit toujours être un choix explicite.
- Cette cascade va dans **`resolveDefaultParticipantPrice`** (`lib/pricing/resolve-default-price.ts`),
  qui reste la **source unique** appelée par les trois chemins de création d'inscrit
  (`addParticipant`, `enrollFromRequest`, `createSessionFull`).

#### Règle payeur — le point qui peut tout casser

Décider si un payeur est une personne morale **DOIT** réutiliser `lib/sessions/payer-rule.ts`
(`isPersonneMoralePayeur`), celle qui choisit convention d'entreprise vs nominative depuis le
28/08. Une seconde définition ferait diverger le type de convention et le mode de tarif :
une convention d'entreprise portant un prix d'indépendant. **Une seule définition dans le projet.**

#### Règles du forfait

- **Quote-part** = forfait ÷ N, reliquat d'arrondi sur le **dernier** inscrit. La somme est
  **exactement** égale au forfait, au centime. Elle sert au BPF et au suivi du CA par
  stagiaire — **jamais** à facturer.
- **Ajouter ou retirer un salarié redistribue les quotes-parts. Le forfait ne bouge pas.**
  Une renégociation est une décision commerciale explicite, jamais une conséquence
  automatique d'une inscription.
- **Le forfait est ferme** : une entreprise qui annonce 4 salariés et en envoie 3 doit le
  forfait entier (place réservée, formateur mobilisé). **La convention d'entreprise porte
  cette clause par écrit** — sans elle, un désistement devient un litige et une réserve
  d'audit sur l'information préalable.
- **Exception dure** : dès qu'un inscrit du groupe est engagé (facture émise, dossier OPCO
  instruit, convention signée), la redistribution est **interdite**. L'outil expose deux
  issues et **n'en choisit aucune** : renégocier le forfait et facturer la différence, ou
  sortir le nouvel arrivant sur sa propre ligne. C'est le seul endroit où un verrou
  individuel a une conséquence collective.
- **Verrous** : réutiliser `classifyParticipantPrice` (`lib/pricing/classify-participant.ts`).
  Ne pas réimplémenter.

#### Facturation et convention

- Une facture **par payeur** portant le forfait. La facture groupée existe déjà
  (`Invoice.participantIds` + `sessionId`). **Jamais N factures individuelles pour un forfait.**
- La convention d'entreprise porte **le forfait**, pas la somme des quotes-parts — même
  quand les deux sont égales, c'est le forfait qui a été négocié.

#### UI minimale

- Un panneau « Tarifs » sur la fiche session : la ligne indépendants, et une ligne par
  entreprise inscrite, **ajoutée automatiquement dès qu'un premier salarié de cette
  entreprise est inscrit** — en `FORFAIT_GROUPE`, montant à saisir, signalé comme manquant
  tant qu'il ne l'est pas.
- **Un montant vide bloque la génération de la convention** — un blocage **dur**, pas un
  avertissement contournable. Sinon la convention à zéro euro revient par le chemin public.
  Même logique que le stub bloquant de l'écart E-3.
- Le panneau touche `addParticipant` **et** `enrollFromRequest` (chemin d'inscription
  publique livré le 28/08) : à câbler dans le même plan que la cascade, pas après.

#### Migration

- **Additive**, `migrate deploy` — jamais `db push` vers le cloud.
- **Aucune donnée rétroactive créée.**

#### Tests attendus (RED d'abord)

- Session mixte : une agence au forfait + deux indépendants → chacun son prix, et changer
  le forfait de l'agence ne touche **aucun** indépendant
- Deux agences, deux forfaits différents, même session → étanchéité totale
- Somme des quotes-parts = forfait, y compris sur un montant non divisible (4 500 ÷ 11)
  et sur un ajout puis un retrait successifs
- Ajout d'un salarié dans un groupe dont un membre est déjà facturé → refus explicite avec
  les deux issues, **aucune écriture**
- Aucune ligne `SessionPricing` → la cascade retombe sur la session puis le produit,
  jamais sur 0
- Le mode est bien déduit de `payer-rule.ts` et pas d'une seconde définition

⚠️ **Les cas de test sont des FIXTURES EN DUR.** SES-0106 (forfait 4 500 réparti en
409,09 × 10 + 409,10) s'écrit en dur dans une fixture. **Aucun test, aucun script de
vérification ne lit une session réelle en base** pour « valider » la répartition — c'est le
premier chemin par lequel le backfill reviendrait par la fenêtre, sous couvert de vérification.

### Claude's Discretion

- Découpage en plans et ordre des waves
- Nom exact de l'enum Prisma du mode et son emplacement dans `schema.prisma`
- Forme du composant du panneau « Tarifs » (server/client, placement dans l'onglet Session)
- Stratégie de récupération de la ligne `SessionPricing` (requête jointe vs séparée)
- Formulation exacte des messages d'erreur et des deux issues exposées

### Deferred Ideas (OUT OF SCOPE)

- Suppression de `session.pricePerLearner` — chantier séparé, quand plus aucune session
  vivante ne l'utilise
- Toute reprise de l'historique : backfill, reconstruction, arbitrage des 5 cas hétérogènes
- Remise individuelle marquée comme override explicite survivant à une redistribution
  (mentionnée dans `/tarification`, pas dans le périmètre de cette phase)
</user_constraints>

<phase_requirements>
## Phase Requirements

⚠️ **PRIX-01 et PRIX-02 sont référencés dans `.planning/ROADMAP.md:152` mais ne sont PAS définis dans `.planning/REQUIREMENTS.md`** (qui couvre le milestone v6 cloud, traçabilité « 21/21 REQ-IDs » sans PRIX-*). Les 8 critères de succès du ROADMAP (`.planning/ROADMAP.md:153-161`) font office de définition opérationnelle. Mapping proposé au planner :

| ID | Description (dérivée du ROADMAP) | Research Support |
|----|-------------------------------|------------------|
| PRIX-01 | Modèle `SessionPricing` + cascade par payeur : session mixte étanche (critères 1, 2, 5, 6 — modèle, quotes-parts exactes, repli jamais 0, migration additive) | §3 (source unique + 3 appelants), §7 (SQL migration + piège NULL), §8 (pièges ×8 / 0 silencieux) |
| PRIX-02 | Verrous, facturation et convention au forfait : refus de redistribution sur groupe engagé, facture par payeur, convention porte le forfait + clause forfait ferme, blocage dur montant absent (critères 1, 3, 4, 7, 8) | §1 (facture groupée), §2 (verrous), §4 (règle payeur unique), §5 (convention + blocage dur) |

Le planner devrait faire définir/inscrire PRIX-01/PRIX-02 dans REQUIREMENTS.md (ou tracer contre les 8 critères directement).
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Multi-tenant** : `tenantId` FK partout ; toute nouvelle server action DOIT scoper par `tenantId` (`files/CLAUDE.md` §Constraints). `SessionPricing` doit porter `tenantId` et toutes ses lectures/écritures doivent être scopées.
- **Workflow GSD obligatoire** : pas d'édition hors `/gsd:execute-phase` / `/gsd:quick` / `/gsd:debug`.
- **Server Actions > `/api`** pour les mutations ; retours discriminés `{ ok, ... }` ; schémas Zod dans `packages/shared/src/schemas/` réutilisés serveur + client.
- **Prisma 5.22.0**, schéma `packages/db/prisma/schema.prisma` ; modèles PascalCase singulier, enums UPPER_SNAKE.
- **Argent** : les montants métier session/participant/facture sont des `Decimal @db.Decimal(10, 2)` (PAS des cents Int — la note « cents (Int) » de CLAUDE.md est contredite par le schéma réel : `Invoice.amountHT DECIMAL(10,2)` à `schema.prisma:827`, `SessionParticipant.priceHT` à `schema.prisma:606`). Affichage via `Intl.NumberFormat('fr-FR', { currency: 'EUR' })`.
- **Fichiers kebab-case**, composants PascalCase, actions camelCase verbes.
- **Mémoire projet applicable** : jamais de 2ᵉ instance `next dev` (pooler `connection_limit=1`) ; destructif = étape séparée ; test de puissance (mutation) au gate ; l'instance dev de Laurent tourne sur le port 3010.

---

## 1. Facture groupée — vérifiée, elle existe

### Le modèle porte bien les deux champs

- `Invoice.participantIds Json?` — `packages/db/prisma/schema.prisma:819` (« si facture multi-participants groupée par sponsor (salariés d'une SARL) »)
- `Invoice.sessionId String?` — `packages/db/prisma/schema.prisma:820` (« session dont sont issus les participants (pour facture groupée) »)
- Colonnes présentes en base depuis le baseline : `packages/db/prisma/migrations/0_init/migration.sql:556-557` (`"participantIds" JSONB`, `"sessionId" TEXT`).

### Qui la crée, qui la déclenche

- **Création** : `createInvoiceForSponsorGroup` — `apps/web/src/server/actions/invoices.ts:255`. Une facture par couple (session, sponsorOrg) : charge les participants `where: { sponsorOrgId, invoiceSent: false }` (`invoices.ts:280`), **somme leurs `priceHT`** (`invoices.ts:301` : `totalHT = session.participants.reduce((sum, p) => sum + Number(p.priceHT), 0)`), crée l'Invoice en transaction avec `participantIds` + `sessionId` + `payerOrgId` (`invoices.ts:307-330`), génère un PDF multi-lignes (1 ligne par stagiaire, `invoices.ts:333-336`), marque `invoiceSent: true` sur tous (`invoices.ts:411-414`), écrit 2 `AuditLog` (`invoices.created` avec `grouped: true` + `invoices.issued`, `invoices.ts:420-441`).
- **Écrans déclencheurs** : `CreateSponsorInvoiceButton` (`apps/web/src/components/invoices/create-sponsor-invoice-button.tsx:44`) monté à deux endroits :
  - fiche session, étape 5 Facturation (HORS onglets, bas de page) : `apps/web/src/components/sessions/step-facturation.tsx:159`, alimenté par `billingGroups` construits dans `apps/web/src/app/app/sessions/[id]/page.tsx:812-830` et rendu à `page.tsx:1412-1421` ;
  - dossiers OPCO : `apps/web/src/components/dossiers-opco/group-row.tsx:97`.
- RBAC : `ADMIN | MANAGER | COMPTABLE` (`invoices.ts:264`, miroir UI `page.tsx:810`).

**Écart avec la décision de phase** : aujourd'hui le montant facturé est la **somme des `priceHT`** des inscrits, pas un forfait lu quelque part. Avec des quotes-parts exactes (Σ = forfait au centime), la somme est arithmétiquement égale au forfait — mais la décision « une facture par payeur portant le forfait » implique de lire `SessionPricing.amountHT` comme source du montant (ou de garantir l'égalité par construction). Point d'insertion : `invoices.ts:301`.

### Numérotation et avoirs

- **Factures** : `getNextInvoiceNumber` — `apps/web/src/lib/numbering.ts:30-52`. Préfixe `Tenant.invoicePrefix` (défaut `'FAC'`, `schema.prisma:42` du modèle Tenant à la ligne 42 du bloc, soit `invoicePrefix String? @default("FAC")`), format `{prefix}-NNNNNN`, max+1 **sous transaction obligatoire** (race condition sinon, `numbering.ts:22-25`). Séquence continue sans trou.
- **Avoirs** : `getNextCreditNoteNumber` — `numbering.ts:81-102`. Séquence **distincte** `Tenant.creditNotePrefix` (défaut `'AVO'`), justification CGI art. 289 documentée `numbering.ts:60-64`. Paramétrable dans `/app/parametres` (`apps/web/src/server/actions/invoice-settings.ts:55-69`).
- **Création d'avoir** : `createCreditNote` — `invoices.ts:554`. Statuts éligibles `ISSUED|PAID|PARTIAL|OVERDUE` (`invoices.ts:602-607`), N avoirs partiels tant que Σ ≤ montant d'origine (`invoices.ts:618-623`), avoir total ⇒ facture d'origine passe `CANCELLED` (`invoices.ts:667-673`), montants stockés en **négatif** (`invoices.ts:658-660`).
- ⚠️ **L'avoir ne copie PAS `participantIds`** : il copie `participantId`, `payerOrgId`, `sessionId` seulement (`invoices.ts:649-663`). Sur une facture groupée (`participantId = null` si > 1 inscrit), l'avoir perd le lien nominatif avec le groupe. Conséquence sur les verrous : après avoir TOTAL, la facture d'origine est `CANCELLED` (non-engageante, `classify-participant.ts:55`) → le groupe redevient `LIBRE`, ce qui est le comportement voulu (avoir → refacturer). Un avoir PARTIEL laisse la facture d'origine engageante.
- **Code de commerce** : la classe `FACTURE` du classifieur documente la contrainte — « numérotation continue (code de commerce) → avoir obligatoire » (`apps/web/src/lib/pricing/classify-participant.ts:17`), remédiation « Émettre un avoir…, puis refacturer » (`classify-participant.ts:126-128`).

---

## 2. Verrous — `classifyParticipantPrice` et `applyPriceCascade`

### Signature exacte du classifieur (fonction PURE, aucun I/O)

`apps/web/src/lib/pricing/classify-participant.ts:94` :

```typescript
export function classifyParticipantPrice(state: ParticipantPriceState): PriceLockVerdict
```

**Entrée** `ParticipantPriceState` (`classify-participant.ts:26-37`) :
- `financingStatus: string | null | undefined` — `SessionParticipant.financingStatus`
- `opcoSubmissionStatuses: string[]` — statuts des `OpcoSubmission` du participant
- `invoiceStatuses: string[]` — statuts des `Invoice` rattachées (individuelles **et** groupées)
- `conventionSigned: boolean | null | undefined` — booléen legacy
- `docStatus: unknown` — Json, `docStatus.CONVENTION` fait autorité quand présent (`classify-participant.ts:80-92` : signé si `state === 'MANUAL_OK'` ou `uploadedSignedPdfKey` string)

**Sortie** `PriceLockVerdict` (`classify-participant.ts:39-47`) : `{ klass: 'FACTURE'|'ENGAGE_OPCO'|'SIGNE'|'LIBRE', editable: boolean, reasons: string[], remediation: string | null }`. Ordre de gravité : FACTURE > ENGAGE_OPCO > SIGNE > LIBRE.

**Règles d'engagement** (`classify-participant.ts:55-71`) :
- Facture engage sauf `DRAFT`/`CANCELLED` (`CREDIT_NOTE` engage aussi)
- Dossier OPCO engage sauf `DRAFT`/`CANCELED`/`REJECTED` (refus délibérément non bloquant)
- `financingStatus` engage si ∈ `{REQUESTED, PRE_APPROVED, APPROVED, REIMBURSED}` (dossiers historiques sans `OpcoSubmission`)

### Données à charger pour l'appeler — le patron existe dans `applyPriceCascade`

`apps/web/src/lib/pricing/cascade.ts:85-114` charge en 2 requêtes pour toute la session :

1. `sessionParticipant.findMany` scopé `session: { tenantId }`, select : `id, priceHT, financingStatus, conventionSigned, docStatus, sponsorOrgId, person{firstName,lastName}, sponsorOrg{id,legalName,legalForm}, opcoSubmissions{status}` (`cascade.ts:85-98`). NB `cascade.ts:99-102` : cette projection duplique volontairement `ROUTABLE_PARTICIPANT_SELECT` (l'import statique de `route-conventions` tirerait `@/lib/storage` → `sharedEnv` fail-loud).
2. `invoice.findMany` avec `OR: [{ sessionId }, { participantId: { in: ids } }]`, select `status, participantId, participantIds` (`cascade.ts:105-114`). L'attribution facture→participant gère les deux formes via `invoiceStatusesFor` (`cascade.ts:70-80`) : match sur `participantId` OU `participantIds.includes(id)`.

### Comment `applyPriceCascade` l'utilise, et son AuditLog

`cascade.ts:82` : `applyPriceCascade(input: PriceCascadeInput): Promise<PriceCascadeReport>` — input `{ tenantId, userId, sessionId, newPrice: number | null, dryRun?, regenerateDocs? }` (`cascade.ts:30-44`).

- Classe chaque participant (`cascade.ts:116-136`) ; n'applique que si `newPrice !== null && verdict.editable && currentPrice !== newPrice` (`cascade.ts:127-128`).
- Écrit **update + AuditLog dans la MÊME transaction** (`cascade.ts:154-175`) : `entity: 'SessionParticipant'`, **`action: 'pricing.cascade'`**, `diff: { before: {priceHT}, after: {priceHT}, sessionId, klass }` (`cascade.ts:159-172`). Le commentaire cite E-4 : « un tarif modifié sans AuditLog est exactement le trou relevé en E-4 ».
- Puis régénère les conventions des seuls inscrits touchés via **import dynamique** `routeConventionsByPayerRule`, fire-and-forget (`cascade.ts:177-203`).
- **Appelant unique en prod** : `updateSessionDetails` (`apps/web/src/server/actions/sessions.ts:1383`), déclenché quand `pricePerLearner` change.

⚠️ Constat factuel utile au plan : **`updateParticipant` (`sessions.ts:284`) écrit `priceHT` directement sans passer par `classifyParticipantPrice`** — il trace un AuditLog `sessionParticipants.update` (`sessions.ts:388-400`) mais n'applique aucun verrou. L'édition manuelle du prix d'un inscrit engagé est possible aujourd'hui.

---

## 3. Source unique du prix — `resolveDefaultParticipantPrice`

### État actuel (module PUR : ni base, ni I/O — `resolve-default-price.ts:22`)

`apps/web/src/lib/pricing/resolve-default-price.ts:58-62` :

```typescript
export function resolveDefaultParticipantPrice(
  session: SessionPriceContext | null,     // { pricePerLearner: MontantBrut }
  product: ProductPriceContext | null,     // { priceHT, groupFlatPrice: MontantBrut }
  sponsorOrg: SponsorPriceContext | null,  // { legalForm: string | null }
): DefaultPriceResult
```

Retour `{ priceHT: number, source: 'session'|'produit'|'forfait-groupe'|'aucun', needsReview: boolean, reason? }` (`resolve-default-price.ts:42-50`). `MontantBrut` accepte `number | string | Decimal Prisma` (`:29`).

**Cascade implémentée aujourd'hui** (`resolve-default-price.ts:63-97`) :
1. `session.pricePerLearner` fait foi, **y compris 0 explicite** (`:63-68`)
2. `product.groupFlatPrice` + `isPersonneMoralePayeur(legalForm)` → **NE recopie PAS le montant** : retourne `priceHT: 0, source: 'forfait-groupe', needsReview: true` avec le forfait dans `reason` (`:70-81` — garde-fou du ×8 du 20/08, commentaire `:17-20`)
3. `product.priceHT` tarif catalogue (`:83-87`)
4. rien → `0` **signalé** (`needsReview: true, source: 'aucun'`, `:89-97`)

Le commentaire `:22-23` anticipe explicitement cette phase : « `SessionPricing` (grille par payeur) s'insérera en tête de cascade quand il existera. »

### Les trois appelants et ce qu'ils ont en main

| Appelant | Appel | Données déjà chargées | Manque pour interroger `SessionPricing` |
|---|---|---|---|
| `addParticipant` — `apps/web/src/server/actions/sessions.ts:98` | `resolveDefaultParticipantPrice(session, session.product, sponsor)` | `session` complet (avec `tenantId`) + `product { priceHT, groupFlatPrice }` (`sessions.ts:64-68`), `sponsor` = Organization complète (`sessions.ts:70`), `input.sessionId`, `input.sponsorOrgId` | **Rien de structurel** — il suffit d'une requête `sessionPricing.findMany({ where: { sessionId, tenantId } })` ou d'un `include` sur la session. ⚠️ MAIS `input.priceHT ?? defaultPrice.priceHT` (`sessions.ts:113`) : le dialog UI envoie TOUJOURS un prix explicite (voir §8, piège 3) |
| `enrollFromRequest` — `apps/web/src/server/actions/enroll-from-request.ts:123` | `session` select `{ pricePerLearner, product { priceHT, groupFlatPrice } }` (`:112-118`), `sponsorOrg` select `{ legalForm }` (`:119-122`), `sessionId` + `sponsorOrgId` + `user.tenantId` en scope | **Rien de structurel** — élargir le select session (ajouter la relation `sessionPricings`) ou requête séparée par `(sessionId, sponsorOrgId)`. Le `needsReview` est aujourd'hui juste loggé en `console.warn` (`:124-126`) |
| `createSessionFull` — `apps/web/src/server/actions/sessions-create.ts:218` | Appel avec objets synthétiques : `{ pricePerLearner }`, `product`, `{ legalForm: legalFormParOrg.get(...) }` (`:218-222`, map construite `:180`) — la session est en cours de création **dans la transaction** (`:182-199`) | **Par construction, aucune ligne `SessionPricing` ne peut exister** pour une session qui vient de naître : les niveaux 1-2 de la cascade sont structurellement vides sur ce chemin. Si la phase auto-crée les lignes à l'inscription, c'est ici aussi (dans la même tx) qu'il faudrait les créer |

**Conséquence de conception** (discrétion Claude, mais contrainte factuelle) : le module étant PUR, mettre `SessionPricing` « en tête de cascade » impose soit d'ajouter un paramètre (ex. les lignes `SessionPricing` pertinentes chargées par l'appelant), soit de rendre le module impur — la première option préserve le patron du projet (« MODULE PUR : ni base, ni I/O », `resolve-default-price.ts:22`, même patron que `classify-participant.ts:11-14`).

Tests existants : `apps/web/src/lib/pricing/__tests__/resolve-default-price.test.ts` (protocole de mutation documenté en tête : renvoyer `Number(groupFlat)` au lieu de 0 doit faire rougir le test « ne répartit jamais un forfait à l'aveugle »).

---

## 4. Règle payeur — API et unicité vérifiées

### API exacte de `apps/web/src/lib/sessions/payer-rule.ts`

Module **NEUTRE** (ni `'use server'` ni `'use client'`, aucun import Prisma — `payer-rule.ts:24-26`) :

- `isPersonneMoralePayeur(legalForm: string | null | undefined): boolean` — `:62-64`. Défini comme le **complément EXACT** de `requiresContratIndividuel` ; forme absente ⇒ `false` (on ne présume pas d'une convention de groupe sur une donnée manquante).
- `partitionByPayerRule(participants: ReadonlyArray<PayerParticipant>): PayerPartition` — `:77-104`. Partitionne en `groups: SponsorGroup[]` (personnes morales, triés par `sponsorOrgId`) et `individuels: string[]`. Le format groupe ne dépend PAS de l'effectif (cas EXPERTA, 1 salariée).
- `selectAnalyseBesoinTargets(participants, opts): AnalyseBesoinTargets` — `:137-152`.
- Types : `PayerParticipant { id, sponsorOrgId, sponsorLegalForm, sponsorName? }` (`:31-36`), `SponsorGroup`, `PayerPartition` (`:39-50`).

Le prédicat sous-jacent : `requiresContratIndividuel` — `apps/web/src/lib/legal-forms.ts:25-28`, sur `CONTRAT_INDIVIDUEL_FORMS = [...SOLO_FORMS, 'PARTICULIER']` (`legal-forms.ts:22`), `SOLO_FORMS = ['EI','EIRL','AUTO_ENTREPRENEUR']` (`legal-forms.ts:3`).

### Tous les appelants actuels de `payer-rule.ts` (grep exhaustif)

| Fichier | Usage |
|---|---|
| `apps/web/src/lib/pricing/resolve-default-price.ts:26,72` | `isPersonneMoralePayeur` — pas 2 de la cascade (forfait groupe) |
| `apps/web/src/lib/closure/route-conventions.ts:27,72` | `partitionByPayerRule` — routage groupe/individuel des conventions |
| `apps/web/src/lib/closure/convention-core.ts:36,129,466` | `isPersonneMoralePayeur` — le cœur individuel ne produit RIEN pour une personne morale (`:129-136`) ; test mono-commanditaire (`:460-467`) |
| `apps/web/src/server/actions/dispatch-generate-doc.ts:31,128` | `isPersonneMoralePayeur` — arrêt de l'analyse besoin nominative |
| `apps/web/src/server/actions/prepare-training.ts:13-16,511,857` | `partitionByPayerRule`, `selectAnalyseBesoinTargets`, `isPersonneMoralePayeur` |
| `apps/web/src/lib/sessions/__tests__/payer-rule.test.ts` | tests (prouve le complément exact sur tout l'enum lu dans schema.prisma) |

### Pas de seconde définition — avec deux nuances factuelles

Recherche `requiresContratIndividuel` / `AUTO_ENTREPRENEUR` / `legalForm` sur tout `apps/web/src` + `packages` :

- **`requiresContratIndividuel` n'existe qu'à un endroit** (`lib/legal-forms.ts:25`) et ses importeurs directs sont : `sessions/[id]/page.tsx:66`, `convention-core.ts:34`, `analyse-besoin-entreprise-core.ts:36`, `payer-rule.ts:28`. Aucune réimplémentation du prédicat.
- **Nuance 1 — listes recopiées en dur (question différente, pas la règle payeur)** : `const SOLO_FORMS = ['EI','EIRL','AUTO_ENTREPRENEUR']` est re-déclaré localement dans `sessions/[id]/page.tsx:82`, `components/editors/legal-link-editor.tsx:25`, `components/sessions/gap-row.tsx:11`, `components/pickers/person-or-org-picker.tsx:24` ; et des filtres Prisma inline `legalForm: { in: ['EI','EIRL','AUTO_ENTREPRENEUR'] }` existent dans `app/app/sessions/page.tsx:50,109`, `app/app/organisations/page.tsx:103,129`, `lib/dashboard-stats.ts:181`. Ces listes répondent à « l'apprenant est-il son propre employeur ? » (SOLO_FORMS, sans PARTICULIER) — pas à « ce payeur relève-t-il de la convention ? ». Elles ne divergent pas de la règle payeur mais illustrent le risque : **la phase ne doit en ajouter aucune**.
- **Nuance 2** : `analyse-besoin-entreprise-core.ts:107,286` utilise `requiresContratIndividuel` directement (pas `isPersonneMoralePayeur`) — mathématiquement équivalent (complément exact + gestion du null par la garde amont), déjà accepté par le quick 260821-md8.

---

## 5. Convention d'entreprise — montant, point d'insertion, blocage dur

### Où le montant est injecté aujourd'hui

Chaîne complète, chemin entreprise :

1. **Calcul** — `generateConventionEntrepriseCore` (`apps/web/src/lib/closure/convention-core.ts:283`) : `prixGlobalHT = participants.reduce((sum, p) => sum + Number(p.priceHT), 0)` — **`convention-core.ts:352`**. C'est la **somme des quotes-parts**, alignée volontairement sur la facture groupée (commentaire `:331-340` : « exactement ce que fait déjà la facture groupée (`createInvoiceForSponsorGroup`), pour que convention et facture affichent le même montant »).
2. **Transport** — `ConventionData.prixGlobalHT` (`apps/web/src/lib/convention-template.ts:82`, doc `:70-81` : « Quand ce champ est fourni, il FAIT FOI … Absent ⇒ comportement historique (tarif unitaire × effectif) »). Posé à `convention-core.ts:421`.
3. **Rendu** — `convention-template.ts:262-267` : `hasPrixGlobal = data.prixGlobalHT != null && data.prixGlobalHT > 0` → `totalHT = prixGlobalHT`, et `showUnitBreakdown = false` (pas de décomposition « X € × N » sur un prix global).

### Point d'insertion pour porter le forfait

**`convention-core.ts:341-352`** : remplacer la somme par la lecture de `SessionPricing.amountHT` du couple `(sessionId, sponsorOrgId)` quand `mode = FORFAIT_GROUPE`. Le champ de transport (`prixGlobalHT`) et le rendu existent déjà et n'ont pas à changer. La clause « forfait ferme » (critère 7 du ROADMAP) est un ajout au HTML du template (`convention-template.ts`, corps de la convention — articles financiers).

### Le blocage DUR — précédent en place, à deux étages

Le précédent exact du « montant vide bloque la génération » existe déjà pour le prix manquant :

- **Étage 1 — refus du cœur (le vrai blocage, couvre TOUS les chemins y compris public)** : `convention-core.ts:341-351` — un participant à prix ≤ 0 ⇒ `return { ok: false, error: 'Prix HT manquant pour {noms}…' }`, AVANT tout rendu PDF et toute écriture. Même patron pour le représentant absent (`:363-377`). Le chemin public passe par là : `enrollFromRequest` (`enroll-from-request.ts:142`) → `prepareTrainingForSession` → `routeConventionsByPayerRule` (`route-conventions.ts:80-93`) → `generateConventionEntrepriseCore` ; l'erreur remonte dans `ConventionRouting.errors` (`route-conventions.ts:88-92`).
- **Étage 2 — pré-contrôle UI (dit AVANT ce que le cœur refuse APRÈS)** : `blocagesDocsEntreprise` (`apps/web/src/lib/docs/blocages-docs-entreprise.ts:56-98`), module **NEUTRE et PUR**, clés `'representant_manquant' | 'prix_manquants' | 'produit_manquant'`, contrat documenté `:9-13` : « un garde-fou qui laisse passer ce qu'un cœur refuse est pire que pas de garde-fou. Toute nouvelle garde dans `generateConventionEntrepriseCore` … se reflète ici. » Consommé par la page session (`page.tsx:759-800`) et affiché par `ConventionEntreprisePanel` (`page.tsx:1310-1316`, onglet Avant).

**La phase doit modifier les DEUX étages en même temps** : garde « forfait `SessionPricing` absent » dans le cœur (`convention-core.ts`, à côté de `:341`) + nouvelle clé de blocage dans `blocages-docs-entreprise.ts`.

Note sur « la même logique que le stub bloquant de l'écart E-3 » (CONTEXT) : E-3 est l'écart « `usedStub = true` n'est bloquant nulle part » de l'audit du 28/08 (`.planning/audit/AUDIT-PRODUIT-2026-08-28.md:48-49`), remédiation prescrite « bloquant dans `getSessionCompleteness` ». **Cette remédiation n'apparaît pas implémentée** : aucun `usedStub` dans `apps/web/src/lib/sessions/completeness.ts` (grep vérifié). Le précédent opérationnel dans le code est donc le couple cœur-refuse + pré-contrôle décrit ci-dessus, pas un blocker `completeness`.

---

## 6. Fiche session — structure et insertion du panneau « Tarifs »

### Architecture actuelle

- **Page RSC** : `apps/web/src/app/app/sessions/[id]/page.tsx` (1424 lignes) — toutes les requêtes Prisma côté serveur, panneaux passés **pré-rendus** en props.
- **Coquille 5 onglets** : `<SessionTabs>` (`apps/web/src/components/sessions/tabs/session-tabs.tsx`, `'use client'`) — onglets `session | avant | apres | docs | agenda` ; navigation par `window.history.pushState` (0 refetch) ; panneaux **montés mais `hidden`** quand inactifs (`session-tabs.tsx:9-27`).
- **Config neutre** : `session-tabs-config.ts` — module **SANS `'use client'`**, partagé RSC + client. Son en-tête (`:1-12`) documente la convention RSC du projet : « Ne JAMAIS définir [un helper] dans [un module] `'use client'` : une fonction exportée d'un module client, importée par un composant serveur, devient une référence proxy non appelable ». Même convention affirmée dans `payer-rule.ts:24-26` et `blocages-docs-entreprise.ts:18-19`.

### Contenu actuel de l'onglet « Session » (prop `session=` — `page.tsx:1171-1293`)

Dans l'ordre : `SessionEnrollmentBlock` (lien public, `:1173`) → `SessionEnrollmentRequests` (`:1182`) → statut + dates (`#section-status`, `:1189`) → `SessionWorkflowTimeline` avec `StepCreation` (détails + `EditSessionDetailsDialog` + `AddParticipantDialog`, `:1203-1262`) et `SessionParticipantsList` (`:1266-1285`) → ghost anchor `#section-participants` (`:1292`).

Hors onglets : le hero `SessionHeaderBar` porte `SessionPriceInline` (édition inline de `pricePerLearner`, `page.tsx:877`) ; `SessionEvaluationBlock` et `StepFacturation` restent en bas de page hors flux onglets (`page.tsx:1404-1421`).

### Où insérer le panneau « Tarifs »

Emplacement naturel (discrétion Claude sur la forme) : dans le bloc `session={...}` de `page.tsx`, entre le bloc statut/dates (`:1189`) et la timeline (`:1203`) — c'est là que vivent les informations de cadrage de la session, et l'anchor pattern (`#section-status`, `#section-participants`, `scroll-mt-20`) est disponible pour les liens « corriger » des blocages. Données : les lignes `SessionPricing` se chargent dans la page RSC (qui fait déjà ~15 requêtes) et le panneau interactif (saisie du montant) sera un composant client dans `components/sessions/` appelant une server action, patron identique à `ConventionEntreprisePanel` (`components/sessions/convention-entreprise-panel.tsx`) ou `SessionPriceInline` + `EditableField` (`components/sessions/session-price-inline.tsx:30-40`, schéma Zod `SessionPricePerLearnerSchema` de `@qualiof/shared/schemas`).

**Convention RSC à respecter** (rappel demandé) : tout helper partagé entre la page RSC et le composant client (ex. calcul « montant manquant », libellés du mode) doit être un **module neutre sans `'use client'`**, sur le modèle de `session-tabs-config.ts` et `blocages-docs-entreprise.ts`.

L'« ajout automatique d'une ligne dès le premier salarié inscrit » se câble dans `addParticipant` (`sessions.ts:98-118`) et `enrollFromRequest` (`enroll-from-request.ts:123-137`) — les mêmes endroits que la cascade (décision CONTEXT : même plan).

---

## 7. Prisma — style des migrations et SQL exact proposé

### Style du projet (vérifié sur les 3 migrations post-baseline)

- Historique : `0_init` (baseline Phase 19, 29 migrations archivées) puis `20260803134935_tenant_email_settings`, `20260828152600_public_enrollment_links`, `20260828160500_cni_verso` (`packages/db/prisma/migrations/`).
- Chaque migration ouvre par un **commentaire français** datant et justifiant, avec l'affirmation « Migration 100 % ADDITIVE » quand c'est le cas (`20260828152600/migration.sql:1-3`, `20260803134935/migration.sql:1-2`).
- Marqueurs Prisma standard : `-- CreateTable`, `-- CreateIndex`, `-- AlterTable`, enums en `CREATE TYPE "X" AS ENUM (...)` (`0_init/migration.sql:14-35`), ids `TEXT NOT NULL` + `CONSTRAINT "X_pkey" PRIMARY KEY ("id")`, timestamps `TIMESTAMP(3)` avec `"createdAt" ... DEFAULT CURRENT_TIMESTAMP` et `"updatedAt" TIMESTAMP(3) NOT NULL` (géré par `@updatedAt` côté client), FKs en `ALTER TABLE ... ADD CONSTRAINT "X_y_fkey" FOREIGN KEY ... ON DELETE ... ON UPDATE CASCADE` (`0_init/migration.sql:1318+`).
- Argent : `DECIMAL(10,2)` pour les montants, `DECIMAL(5,2)` pour `vatRate` (`0_init/migration.sql:561-564` — modèle Invoice).
- Précédent de FK session avec cascade : `SessionParticipant.session … onDelete: Cascade` (`schema.prisma:596`) ; relation vers Organization sans cascade (`schema.prisma:601`).

### ⚠️ Piège vérifié : `@@unique` avec colonne nullable n'assure PAS l'unicité de la ligne par défaut

`@@unique([sessionId, sponsorOrgId])` avec `sponsorOrgId String?` génère un index unique standard — or **Postgres traite les NULL comme distincts** : deux lignes `(sessionId, NULL)` coexisteraient sans erreur, soit **deux lignes par défaut contradictoires** pour la même session. Le précédent existe dans le schéma : `PedagogicalAsset @@unique([sessionId, participantId, kind])` avec `participantId String?` (`schema.prisma:1409-1417`, index `0_init/migration.sql:1270`) a la même faille latente (le commentaire de `payer-rule.ts:132-135` suppose à tort qu'il ne peut exister qu'UNE analyse de niveau session). Prisma 5.22 ne sait pas exprimer `NULLS NOT DISTINCT` ni un index partiel dans le schéma → **SQL brut ajouté à la main dans la migration** (workflow : `prisma migrate dev --create-only`, éditer le SQL, puis appliquer). L'index partiel fonctionne sur toute version de Postgres (pas de dépendance à PG15+).

### SQL proposé pour la migration additive

```sql
-- Phase 23 — Tarification par payeur (SessionPricing).
-- Le prix appartient au couple (session × payeur), pas à la session.
-- Migration 100 % ADDITIVE : une table, un enum, des index. Aucune ligne créée,
-- aucune donnée existante touchée — les 81 sessions existantes gardent ce qu'elles ont.

-- CreateEnum
CREATE TYPE "SessionPricingMode" AS ENUM ('FORFAIT_GROUPE', 'PAR_STAGIAIRE');

-- CreateTable
CREATE TABLE "SessionPricing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sponsorOrgId" TEXT,
    "mode" "SessionPricingMode" NOT NULL,
    "amountHT" DECIMAL(10,2),
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex : une ligne par couple (session, payeur).
CREATE UNIQUE INDEX "SessionPricing_sessionId_sponsorOrgId_key"
  ON "SessionPricing"("sessionId", "sponsorOrgId");

-- CreateIndex : lecture par session, scopée tenant (patron @@index([tenantId, ...])).
CREATE INDEX "SessionPricing_tenantId_sessionId_idx"
  ON "SessionPricing"("tenantId", "sessionId");

-- Unicité de la LIGNE PAR DÉFAUT (sponsorOrgId NULL). L'index unique standard
-- ci-dessus ne la garantit PAS : Postgres considère les NULL comme distincts,
-- deux lignes par défaut pourraient coexister sur la même session. Index partiel
-- (inexprimable dans schema.prisma — SQL brut assumé, cf. PedagogicalAsset qui
-- porte la même faille latente).
CREATE UNIQUE INDEX "SessionPricing_sessionId_default_key"
  ON "SessionPricing"("sessionId")
  WHERE "sponsorOrgId" IS NULL;

-- AddForeignKey
ALTER TABLE "SessionPricing" ADD CONSTRAINT "SessionPricing_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT délibéré : le défaut Prisma d'une relation optionnelle est SET NULL,
-- qui transformerait silencieusement la ligne forfait d'une entreprise supprimée
-- en ligne PAR DÉFAUT de la session (sponsorOrgId NULL = indépendants).
ALTER TABLE "SessionPricing" ADD CONSTRAINT "SessionPricing_sponsorOrgId_fkey"
  FOREIGN KEY ("sponsorOrgId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

Côté `schema.prisma` : modèle `SessionPricing` avec `sponsorOrg Organization? @relation(fields: [sponsorOrgId], references: [id], onDelete: Restrict)`, `session TrainingSession @relation(..., onDelete: Cascade)`, back-relations à ajouter sur `TrainingSession` (bloc relations `schema.prisma:462-472`) et `Organization` (bloc relations, modèle à `schema.prisma:193`). Enum au fil du schéma près des enums de tarification/facturation (discrétion Claude sur l'emplacement exact).

**Deux points à trancher au plan (tension interne aux décisions verrouillées)** :
1. `amountHT` **nullable ou non** : le CONTEXT écrit `amountHT Decimal(10,2)` (sans `?`) MAIS impose aussi la ligne `FORFAIT_GROUPE` **auto-créée avant saisie du montant**, « signalé comme manquant », ET « jamais 0 en repli » (0 = choix explicite, donc 0 ne peut pas servir de sentinelle « non saisi »). Les trois ne tiennent ensemble que si « absent » est représentable : `amountHT DECIMAL(10,2)` **nullable** (NULL = à saisir, bloque la convention ; 0 = gratuit explicite) est la seule lecture cohérente. Le SQL ci-dessus le reflète.
2. `ON DELETE RESTRICT` sur `sponsorOrgId` (justifié dans le SQL) diverge du défaut Prisma — à déclarer explicitement dans le schéma pour que `migrate dev` génère le bon SQL.

**Application** : `prisma migrate dev` en local (piège sandbox connu : `feedback_prisma_db_push_sandbox` — si `migrate dev` plante en sandbox, `db push --skip-generate` + `generate` séparé est le contournement LOCAL uniquement), puis **`prisma migrate deploy` vers le cloud via `DIRECT_URL`** (pattern Phase 19, REQUIREMENTS DB-01). Aucun script `db:deploy` n'existe dans `package.json` — les 2 migrations du 28/08 ont été déployées au cloud sans script dédié (`260828-k3p-SUMMARY.md` : « 2 migrations additives appliquées sur le cloud »).

---

## 8. Pièges déjà payés qui menacent cette phase

1. **×8 sur le CA (20/08/2026)** — recopier un forfait groupe sur chaque inscrit multiplie le CA par l'effectif. Le garde-fou vit dans `resolve-default-price.ts:70-81` (le forfait ne se recopie JAMAIS, il se signale) et son test de mutation est documenté (`resolve-default-price.test.ts:10-13`). La phase introduit la quote-part : le même piège revient sous une autre forme — **écrire `amountHT` (le forfait) dans `SessionParticipant.priceHT` de chaque inscrit au lieu de la quote-part** reproduirait le ×8. Test d'étanchéité : Σ quotes-parts = forfait, au centime.

2. **E-2 : règle dupliquée = règles qui divergent** — le correctif du prix par défaut a été écrit TROIS fois avant d'être centralisé (`260828-k3p-SUMMARY.md` : « E-2 en train de se reproduire dans le remède »). La cascade `SessionPricing` va dans `resolveDefaultParticipantPrice` et NULLE part ailleurs — pas de `if (sessionPricing) ...` dans les appelants.

3. **Repli silencieux à 0 — le trou est encore ouvert côté UI** : `AddParticipantDialog` envoie `priceHT: parseFloat(price.replace(',', '.')) || 0` (`apps/web/src/components/sessions/add-participant-dialog.tsx:39`), pré-rempli avec `Number(session.pricePerLearner ?? 0)` (`page.tsx:1256`). Comme `addParticipant` fait `input.priceHT ?? defaultPrice.priceHT` (`sessions.ts:113`) et que 0 n'est pas nullish, **la source unique est court-circuitée sur ce chemin UI** : un inscrit à 0 € peut encore naître d'un clic. La phase, qui touche ce dialog (le prix par défaut doit venir de la grille), doit fermer ce trou.

4. **`pricePerLearner` contient parfois un TOTAL, pas un unitaire** — mesuré le 28/08 : SES-0079 `pricePerLearner = 4 416` (total), SES-0050 `= 10 464` (CONTEXT §specifics). Le repli n°3 de la cascade peut donc injecter un total comme prix unitaire sur ces sessions historiques. **Ne pas corriger** (hors périmètre — les 81 sessions gardent ce qu'elles ont), mais les fixtures de test doivent couvrir le cas, et le panneau « Tarifs » ne doit pas re-déduire un mode depuis ces montants (le mode est TOUJOURS explicite).

5. **La commande `/tarification` prescrit un backfill — à ignorer explicitement** : `.claude/commands/tarification.md` §« Si on te demande de faire évoluer le modèle » demande « Backfill : une ligne SessionPricing par couple (session, payeur) existant, reconstruite depuis les participant.priceHT actuels ». **Contradiction frontale avec le hors-périmètre verrouillé** (CONTEXT §domain + ROADMAP critère 6 : migration additive, AUCUNE ligne rétroactive). Le CONTEXT prime. Idem pour la « remise individuelle marquée comme override » (différée). Le plan doit le dire noir sur blanc pour que l'exécuteur qui lirait `/tarification` ne suive pas ce paragraphe. Prévoir la mise à jour de `/tarification` (retirer le paragraphe backfill) dans un plan de cette phase ou en dette explicite.

6. **Position du reliquat** : la décision dit « reliquat sur le **dernier** inscrit », mais la donnée réelle de SES-0106 porte les 409,10 sur **Caroline ROZIER, première** de la liste du script (`apps/web/scripts/_create-optimmo-152h.ts:403`, garde-fou Σ = 4 500,00 à `:433`). Les fixtures doivent asserter **la somme et la répartition produite par le NOUVEAU helper** (reliquat dernier), pas la position historique — et surtout ne jamais lire SES-0106 en base (règle CONTEXT).

7. **Verrou individuel, conséquence collective** : c'est « le piège principal » documenté dans `/tarification` §Étape 3 — sur un forfait, un seul salarié `FACTURE`/`ENGAGE_OPCO`/`SIGNE` interdit la redistribution (sinon Σ ≠ forfait). Réutiliser `classifyParticipantPrice` (le patron de chargement est dans `cascade.ts:85-114`, y compris l'attribution des factures groupées via `participantIds`). Noter que `updateParticipant` (`sessions.ts:284`) ne vérifie AUCUN verrou aujourd'hui (§2).

8. **NULLs distincts sur l'index unique** (§7) — sans l'index partiel, deux lignes par défaut par session sont possibles en base.

9. **`ON DELETE SET NULL` implicite** (§7) — le défaut Prisma sur relation optionnelle transformerait une ligne d'entreprise supprimée en ligne par défaut de la session.

10. **Deux formes de stockage de la convention groupe** : `entityType='organization'` (appli) et `entityType='session'` (scripts `_gen-*`). La régénération ne remplace la forme `session` que si la session est mono-commanditaire (`convention-core.ts:449-475`) ; sur une session multi-entreprises, un doc `session` obsolète peut subsister (warning `convention-core.ts:469-473`). Les changements de forfait qui régénèrent des conventions sur SES-0106/0107/0108 doivent en tenir compte — et de la consigne « ne pas cliquer régénérer sur SES-0107/0108 » (`260821-md8-SUMMARY.md`, la version script porte le paragraphe OPCO EP + tampon).

11. **Frontière RSC** : helper partagé = module neutre sans `'use client'` (`session-tabs-config.ts:1-12`) ; et les modules appelés depuis `sessions.ts`/`cascade.ts` qui tirent `@/lib/storage` (donc `sharedEnv` fail-loud) s'importent **dynamiquement** (`sessions.ts:150-155`, `cascade.ts:177-181`).

12. **Facturation partielle d'un groupe** : `createInvoiceForSponsorGroup` filtre `invoiceSent: false` (`invoices.ts:280`) — il peut donc facturer un sous-ensemble du groupe si certains sont déjà facturés individuellement. Une facture au forfait doit couvrir le groupe entier ; le cas « membre déjà engagé » relève de l'exception dure (deux issues, aucune écriture).

13. **Migrations** : `migrate deploy` jamais `db push` vers le cloud (décision verrouillée + `feedback_prisma_migrate_deploy`) ; `.env` racine pointe le CLOUD (mémoire Phase 19) ; jamais de 2ᵉ instance Next locale (`connection_limit=1`).

## Don't Hand-Roll

| Problème | Ne pas réécrire | Réutiliser | Pourquoi |
|---|---|---|---|
| « Ce payeur est-il une personne morale ? » | une liste de formes juridiques | `isPersonneMoralePayeur` (`payer-rule.ts:62`) | décision verrouillée ; 4 implémentations divergentes = 5 findings (PR #13) |
| « Qui a le droit de bouger ? » | un check de statut facture/OPCO | `classifyParticipantPrice` (`classify-participant.ts:94`) | décision verrouillée ; règles d'engagement subtiles (REJECTED non bloquant, docStatus shadowing) |
| Propagation d'un prix + trace | un update direct | `applyPriceCascade` (`cascade.ts:82`) | seul endroit autorisé à réécrire `priceHT` suite à un changement de tarif (`cascade.ts:16-18`) ; AuditLog atomique |
| Prix par défaut d'un inscrit | un `??` local | `resolveDefaultParticipantPrice` (`resolve-default-price.ts:58`) | source unique E-2, décision verrouillée |
| Facture par payeur | une nouvelle action | `createInvoiceForSponsorGroup` (`invoices.ts:255`) | numérotation, PDF multi-lignes, AuditLog, `invoiceSent` déjà gérés — seule la source du montant change |
| Blocage avant génération | un `toast.error` côté client | patron `blocagesDocsEntreprise` + refus du cœur (`blocages-docs-entreprise.ts:56`, `convention-core.ts:341`) | le refus du cœur couvre le chemin public ; le pré-contrôle couvre l'UX |
| Génération convention groupe | appel direct au cœur | `routeConventionsByPayerRule` (`route-conventions.ts:67`) | traite les groupes EN SÉRIE (deleteMany concurrent sinon) |

## Environment Availability

| Dépendance | Requise par | Disponible | Version | Fallback |
|---|---|---|---|---|
| Node.js | build/tests | ✓ | v25.9.0 | — |
| pnpm | monorepo | ✓ | 10.33.2 | — |
| Prisma CLI | migration | ✓ (dep 5.22.0) | 5.22.0 | — |
| Postgres cloud (Supabase) | `migrate deploy` | non sondé (pas d'écriture en recherche) | — | `.env` racine pointe le cloud (mémoire Ph.19) ; `DIRECT_URL` requis pour deploy |
| Vitest | tests | ✓ | 2.1.8 (`apps/web/vitest.config.ts`) | — |

**Aucune dépendance nouvelle à installer** : la phase n'ajoute aucune bibliothèque (patterns `added: []` des quicks récents — la norme du projet).

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 2.1.8, environnement `node` (jsdom opt-in par fichier) |
| Config | `apps/web/vitest.config.ts` (include `src/**/*.{test,spec}.{ts,tsx}` + `scripts/**`) |
| Quick run | `pnpm --filter @qualiof/web test -- src/lib/pricing` |
| Full suite | `pnpm --filter @qualiof/web test` (baseline 28/08 : 1524 tests verts, 185 fichiers — `260828-k3p-SUMMARY.md`) + `pnpm --filter @qualiof/web exec tsc --noEmit` |

### Phase Requirements → Test Map
| Req | Comportement | Type | Commande | Fichier existe ? |
|---|---|---|---|---|
| PRIX-01 | Cascade SessionPricing → défaut → session → produit, jamais 0 en repli | unit (pur) | `pnpm --filter @qualiof/web test -- src/lib/pricing/__tests__/resolve-default-price.test.ts` | ✅ à ÉTENDRE (fichier existant) |
| PRIX-01 | Σ quotes-parts = forfait (4 500 ÷ 11, ajout/retrait) — fixtures EN DUR | unit (pur) | nouveau `src/lib/pricing/__tests__/split-forfait.test.ts` (nom indicatif) | ❌ Wave 0 |
| PRIX-01 | Étanchéité session mixte / deux agences | unit (pur) | idem cascade + split | ❌ Wave 0 |
| PRIX-02 | Refus redistribution si membre engagé, deux issues, aucune écriture | unit (verrous purs) + action | `classify-participant.test.ts` existant + nouveau test action | ✅ classify / ❌ action |
| PRIX-02 | Convention porte le forfait, blocage dur montant absent | unit lecture-source ou test du cœur | patron `convention-entreprise.test.ts` (existant, `apps/web/src/lib/closure/__tests__/convention-entreprise.test.ts:214` teste déjà l'alignement convention/facture) | ✅ à ÉTENDRE |
| PRIX-02 | Mode déduit de payer-rule, pas d'une 2ᵉ définition | unit | `payer-rule.test.ts` existant + test lecture-source | ✅ à ÉTENDRE |

### Sampling Rate
- **Par commit de tâche** : `pnpm --filter @qualiof/web test -- src/lib/pricing` (< 10 s)
- **Par merge de wave** : suite complète web + `tsc --noEmit`
- **Gate de phase** : suite complète verte + **test de puissance (mutation)** — casser la branche « reliquat sur le dernier » et la branche « forfait jamais recopié » doit faire rougir leurs tests (convention projet `feedback_test_de_puissance_mutation`, protocole déjà documenté dans `resolve-default-price.test.ts:10-13`)

### Wave 0 Gaps
- [ ] Helper pur de répartition quote-part (**n'existe pas** — grep `reliquat|repartirForfait|splitForfait` négatif hors `programme-normalize.ts` qui est un autre domaine) + son test RED avec les 5 fixtures du CONTEXT (SES-0106, 0086, 0079, 0050, 0040 — EN DUR, jamais lues en base)
- [ ] Tests RED de la cascade étendue (SessionPricing en tête)
- [ ] Test RED du blocage dur (montant absent → convention refusée, cœur + pré-contrôle synchrones)
- [ ] Framework : rien à installer

## Inconnues restantes

Ce qui n'a PAS pu être établi depuis le code — à ne pas combler par supposition :

1. **PRIX-01/PRIX-02 non définis** : référencés dans `ROADMAP.md:152`, absents de `REQUIREMENTS.md`. Le mapping proposé en `<phase_requirements>` est une dérivation des 8 critères de succès, pas une définition officielle.
2. **Version exacte de Postgres sur Supabase** : non sondée (aucune requête vers la base pendant cette recherche). Sans incidence sur la recommandation : l'index unique partiel fonctionne sur toutes les versions supportées (pas besoin de `NULLS NOT DISTINCT`/PG15+).
3. **`amountHT` nullable vs sentinelle** : tension interne aux décisions verrouillées (§7, point 1). La lecture « nullable » est argumentée mais c'est un arbitrage de plan, pas un fait de code.
4. **Comment les migrations du 28/08 ont été déployées au cloud** : le SUMMARY dit « appliquées sur le cloud », aucun script `db:deploy` n'existe — la commande exacte utilisée (`prisma migrate deploy` avec quel env) n'est pas tracée dans le dépôt.
5. **État de la remédiation E-3** : l'audit prescrit « bloquant dans `getSessionCompleteness` » mais `usedStub` n'apparaît pas dans `completeness.ts`. Soit non implémentée, soit implémentée ailleurs sous une forme que le grep `usedStub` ne capture pas (non trouvée). Le précédent de blocage dur utilisable est celui de `convention-core.ts:341` (vérifié).
6. **Écrans/état réels des 81 sessions en base** : volontairement non consultés (le CONTEXT interdit toute lecture de sessions réelles à des fins de validation — les chiffres 283 couples / 278 homogènes / 5 à arbitrer / 180 engagés viennent de la mesure du 28/08 citée par le CONTEXT, non re-vérifiée ici).
7. **`SessionParticipant.payerOrgId`** (`schema.prisma:615`, « si différent du sponsorOrg (rare mais possible) ») : son interaction avec la clé `SessionPricing.sponsorOrgId` n'est arbitrée nulle part. Tout le code de tarification/convention/facture pivote sur `sponsorOrgId` ; `payerOrgId` participant semble résiduel (aucun usage trouvé dans les chemins étudiés), mais l'exhaustivité de ses usages n'a pas été auditée.

## Sources

### Primary (HIGH — code du dépôt, lu intégralement ou en sections ciblées)
- `apps/web/src/lib/pricing/{classify-participant,resolve-default-price,cascade}.ts` + `__tests__/`
- `apps/web/src/lib/sessions/payer-rule.ts`, `apps/web/src/lib/legal-forms.ts`
- `apps/web/src/lib/closure/{convention-core,route-conventions}.ts`, `apps/web/src/lib/convention-template.ts`
- `apps/web/src/lib/docs/blocages-docs-entreprise.ts`, `apps/web/src/lib/sessions/completeness.ts`
- `apps/web/src/server/actions/{invoices,sessions,sessions-create,enroll-from-request,invoice-settings}.ts`, `apps/web/src/lib/numbering.ts`
- `apps/web/src/app/app/sessions/[id]/page.tsx`, `apps/web/src/components/sessions/tabs/*`, `components/sessions/add-participant-dialog.tsx`, `components/invoices/create-sponsor-invoice-button.tsx`
- `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/{0_init,20260803134935,20260828152600}/migration.sql`
- `apps/web/scripts/_create-optimmo-152h.ts`

### Primary (HIGH — planning du projet)
- `.planning/phases/23-tarification-par-payeur-sessionpricing/23-CONTEXT.md`
- `.planning/ROADMAP.md:149-166`, `.planning/REQUIREMENTS.md`, `.planning/config.json`
- `.planning/quick/260828-k3p-inscriptions-publiques-par-session/260828-k3p-SUMMARY.md`
- `.planning/quick/260821-md8-formations-intra-entreprise-regle-payeur/260821-md8-SUMMARY.md`
- `.planning/audit/AUDIT-PRODUIT-2026-08-28.md` (E-2/E-3/E-4)
- `.claude/commands/tarification.md`

### Connaissance non vérifiée par source externe (MEDIUM)
- Sémantique Postgres « NULLs distincts dans un index unique standard » et support des index partiels : comportement Postgres documenté de longue date, stable sur toutes les versions concernées — non re-vérifié via docs en ligne pour cette recherche (pas de dépendance de version).
- Défaut Prisma `onDelete: SetNull` pour relations optionnelles : comportement Prisma 5.x documenté — cohérent avec l'absence d'`onDelete` explicite sur `Invoice.payerOrg` dans le schéma.

## Metadata

**Confidence breakdown:**
- Facture groupée / verrous / source unique / règle payeur / convention / fiche session : HIGH — lecture directe du code, lignes citées
- SQL de migration : HIGH sur le style (calqué sur les migrations du dépôt), MEDIUM sur les deux arbitrages signalés (`amountHT` nullable, `ON DELETE RESTRICT`) qui restent des décisions de plan
- Pièges : HIGH — tous adossés à du code, des SUMMARY de quicks ou des mémoires datées

**Research date:** 2026-08-28
**Valid until:** la branche `cloud-migration` bouge vite (2 quicks le 28/08) — re-vérifier les numéros de ligne si la planification intervient après de nouveaux commits sur `sessions.ts`, `invoices.ts` ou `convention-core.ts`.

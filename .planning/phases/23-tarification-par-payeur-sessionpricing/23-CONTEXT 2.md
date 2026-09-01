# Phase 23: Tarification par payeur (SessionPricing) - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning
**Source:** PRD Express Path (spécification fournie par Laurent le 28/08/2026)

<domain>
## Phase Boundary

Sur une session **à venir**, facturer une entreprise **au forfait** pour son groupe de
salariés et un auto-entrepreneur **au tarif par personne**, deux entreprises de la même
session pouvant porter deux forfaits différents.

**Hors périmètre, explicitement :** aucune reprise de l'existant. Pas de backfill, pas de
reconstruction, pas d'arbitrage sur les sessions passées. Les 81 sessions existantes gardent
ce qu'elles ont. Si la migration crée des lignes pour l'historique, elle est hors sujet.

</domain>

<decisions>
## Implementation Decisions

### Modèle de données

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

### Résolution du prix d'un inscrit

Cascade, en s'arrêtant au premier qui répond :
1. la ligne `SessionPricing` de **son** `sponsorOrgId`
2. la ligne par défaut de la session (`sponsorOrgId = null`)
3. `session.pricePerLearner`
4. le produit

- **Jamais 0 en repli.** 0 doit toujours être un choix explicite.
- Cette cascade va dans **`resolveDefaultParticipantPrice`** (`lib/pricing/resolve-default-price.ts`),
  qui reste la **source unique** appelée par les trois chemins de création d'inscrit
  (`addParticipant`, `enrollFromRequest`, `createSessionFull`).

### Règle payeur — le point qui peut tout casser

Décider si un payeur est une personne morale **DOIT** réutiliser `lib/sessions/payer-rule.ts`
(`isPersonneMoralePayeur`), celle qui choisit convention d'entreprise vs nominative depuis le
28/08. Une seconde définition ferait diverger le type de convention et le mode de tarif :
une convention d'entreprise portant un prix d'indépendant. **Une seule définition dans le projet.**

### Règles du forfait

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

### Facturation et convention

- Une facture **par payeur** portant le forfait. La facture groupée existe déjà
  (`Invoice.participantIds` + `sessionId`). **Jamais N factures individuelles pour un forfait.**
- La convention d'entreprise porte **le forfait**, pas la somme des quotes-parts — même
  quand les deux sont égales, c'est le forfait qui a été négocié.

### UI minimale

- Un panneau « Tarifs » sur la fiche session : la ligne indépendants, et une ligne par
  entreprise inscrite, **ajoutée automatiquement dès qu'un premier salarié de cette
  entreprise est inscrit** — en `FORFAIT_GROUPE`, montant à saisir, signalé comme manquant
  tant qu'il ne l'est pas.
- **Un montant vide bloque la génération de la convention** — un blocage **dur**, pas un
  avertissement contournable. Sinon la convention à zéro euro revient par le chemin public.
  Même logique que le stub bloquant de l'écart E-3.
- Le panneau touche `addParticipant` **et** `enrollFromRequest` (chemin d'inscription
  publique livré le 28/08) : à câbler dans le même plan que la cascade, pas après.

### Migration

- **Additive**, `migrate deploy` — jamais `db push` vers le cloud.
- **Aucune donnée rétroactive créée.**

### Tests attendus (RED d'abord)

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Règle payeur et conventions
- `apps/web/src/lib/sessions/payer-rule.ts` — `isPersonneMoralePayeur`, `partitionByPayerRule` : **seule** définition autorisée de « personne morale »
- `apps/web/src/lib/closure/convention-core.ts` — convention d'entreprise (quick 260817-mm0)
- `.planning/quick/260821-md8-formations-intra-entreprise-regle-payeur/260821-md8-SUMMARY.md` — règle payeur figée le 21/08

### Tarification existante
- `apps/web/src/lib/pricing/resolve-default-price.ts` — **source unique** du prix par défaut (quick 260828-k3p, E-2)
- `apps/web/src/lib/pricing/classify-participant.ts` — `classifyParticipantPrice` : verrous `LIBRE` / `ENGAGE_OPCO` / `FACTURE` / `SIGNE`
- `apps/web/src/lib/pricing/cascade.ts` — `applyPriceCascade`, `AuditLog action: 'pricing.cascade'`
- `.claude/commands/tarification.md` — commande de pilotage, encode les règles métier et le niveau catalogue

### Inscription et session
- `apps/web/src/server/actions/sessions.ts` — `addParticipant`
- `apps/web/src/server/actions/enroll-from-request.ts` — validation d'une demande publique
- `apps/web/src/server/actions/sessions-create.ts` — `createSessionFull`
- `.planning/quick/260828-k3p-inscriptions-publiques-par-session/260828-k3p-SUMMARY.md` — inscriptions publiques par session

### Conventions projet
- `files/CLAUDE.md` — multi-tenant (`tenantId` partout), migrations, patterns
- `.planning/ROADMAP.md` — Phase 23, 8 critères de succès et hors périmètre

</canonical_refs>

<specifics>
## Specific Ideas

Jeu de test issu de la mesure du 28/08 (283 couples session × payeur, 278 homogènes,
5 à arbitrer, 180 engagés, 0 participant à 0 €) — **à transcrire en fixtures, jamais à lire
en base** :

| Cas | Forme | Intérêt pour le test |
|---|---|---|
| SES-0106 OPTIMMO | 11 inscrits, 409,09 × 10 + 409,10 = **4 500,00** | forfait non divisible, reliquat sur le dernier |
| SES-0086 RIVIERA | 10 × 144 + 1 × 168 (catalogue 168, session 144) | inscrit resté au tarif catalogue, 1/11 engagé |
| SES-0079 NEYRAT 83 | 10 × 315,43 + 1 × 672 | idem + `pricePerLearner` = 4 416 (un total, pas un unitaire) |
| SES-0050 NEYRAT Chalon | 8 × 418,56 + 1 × 672 | idem, `pricePerLearner` = 10 464 |
| SES-0040 Habitat Concept | 4 × 336 + 1 × 240 | remise individuelle probable |

</specifics>

<deferred>
## Deferred Ideas

- Suppression de `session.pricePerLearner` — chantier séparé, quand plus aucune session
  vivante ne l'utilise
- Toute reprise de l'historique : backfill, reconstruction, arbitrage des 5 cas hétérogènes
- Remise individuelle marquée comme override explicite survivant à une redistribution
  (mentionnée dans `/tarification`, pas dans le périmètre de cette phase)

</deferred>

---

*Phase: 23-tarification-par-payeur-sessionpricing*
*Context gathered: 2026-08-28 via PRD Express Path*

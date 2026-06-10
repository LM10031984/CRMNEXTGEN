# Phase 11: Factures cycle complet - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

**Compléter le module Factures pour qu'il couvre le cycle complet** : page liste enrichie + avoirs (NCN) + relances automatiques + export comptable.

**Inclus dans cette phase :**
- Page liste `/app/factures` (placeholder actuel) → vraie page d'inventaire avec 4 PrioCard KPI + filtres + drill
- Avoirs (notes de crédit) : modèle, numérotation, création, partiel/total
- Relances automatiques hybrides : cron BullMQ daily + bouton manuel, délais configurables tenant, 2 niveaux (J+30 amical + J+45 ferme)
- Export comptable xlsx générique (mois/trimestre/année/personnalisé) ADMIN+COMPTABLE
- Cross-navigation Airtable-style depuis fiche apprenant + fiche session (bloc "Factures")

**Hors scope :**
- FEC officiel Bercy (deferred — à activer si contrôle fiscal)
- Refonte du module Factures core (le model Invoice + InvoicePayment + numérotation FAC- + génération PDF Gotenberg + page détail sont déjà là, on enrichit)
- 3 niveaux de relance, sms/cloche relances (rejeté — email seul suffit)
- Bulk actions multi-sélect (deferred — peut être ajouté Phase 14 si besoin)

</domain>

<decisions>
## Implementation Decisions

### Modélisation avoirs (NCN)

- **D-01** : **Réutiliser Invoice + status=CREDIT_NOTE** + nouveau champ `originalInvoiceId String?` (self-FK Invoice.id). Pas de model `CreditNote` séparé. 1 migration additive, 1 source de vérité, requêtes simples. Le statut `CREDIT_NOTE` existe déjà dans l'enum.
- **D-02** : **Numérotation distincte `AVO-NNNNNN`** avec nouveau champ tenant `creditNotePrefix String @default("AVO")`. Séquence dédiée (helper `getNextCreditNoteNumber` clone-strict de `getNextInvoiceNumber` Phase 7-02). Convention française : un avoir DOIT avoir sa propre séquence (CGI art. 289).
- **D-03** : **CTA création depuis fiche facture** uniquement. Bouton "Créer un avoir" sur `/app/factures/[id]` (visible seulement si status ∈ {ISSUED, PAID, PARTIAL, OVERDUE}, jamais sur DRAFT/CANCELLED/CREDIT_NOTE). Click → Radix Dialog avec : montant HT à créditer + motif (textarea obligatoire). Génère l'avoir lié.
- **D-04** : **Avoir partiel OU total**. L'utilisateur saisit le montant HT à créditer, `montantAvoir <= invoice.amountHT`. Si égal au total → status facture origine passe à `CANCELLED` ; sinon facture origine reste avec `amountTTC` inchangé mais on affiche le solde net.

### UI page liste `/app/factures`

- **D-05** : **4 PrioCard métier en haut** :
  - CA facturé ce mois (somme amountTTC des invoices ISSUED+PAID+PARTIAL du mois courant)
  - Impayés (somme reste à encaisser + count) : status ∈ {ISSUED, PARTIAL, OVERDUE}
  - DSO moyen (jours moyens entre issueDate et paidAt pour les paid du mois) — pattern OPCO Phase 3
  - À facturer (count `SessionParticipant.enrollmentStatus=COMPLETED` sans `Invoice` liée)
- **D-06** : **Filtres combinés** :
  - Status multi-chips (DRAFT / ISSUED / PAID / PARTIAL / OVERDUE / CANCELLED / CREDIT_NOTE)
  - Période (chips : "Ce mois" / "Mois dernier" / "Trimestre" / "Année" / "Personnalisé")
  - Payeur (recherche organisation)
  - Type FAC / AVO (chip dérivé de status=CREDIT_NOTE)
  - Bouton 1-clic "Voir seulement impayés" (raccourci ISSUED + PARTIAL + OVERDUE)
- **D-07** : **Cross-navigation style Phase 9.1** systématique :
  - Click ligne facture liste → fiche facture (existant)
  - Bloc "Factures" sur fiche apprenant `/app/apprenants/[id]` : liste les Invoice où `participant.personId = current` + bouton "Voir détail"
  - Bloc "Factures" sur fiche session `/app/sessions/[id]` : liste les Invoice où `sessionId = current` ou `participantId ∈ session.participants`
  - Avoirs apparaissent comme rows distinctes avec badge "AVO" + lien vers facture originale
- **D-08** : **Pas de bulk actions multi-sélect cette phase** (deferred — actions ligne par ligne).

### Relances automatiques (FACT-03)

- **D-09** : **Hybride** = cron BullMQ daily (nouveau worker `invoice-reminder-worker.ts` repeatable job 8h chaque matin) **+** bouton manuel "Envoyer relance maintenant" sur fiche facture. Le bouton manuel peut être déclenché à tout moment et incrémente le compteur.
- **D-10** : **Délais configurables tenant** : nouveau champ `Tenant.invoiceReminderDays Int[] @default([30, 45])`. Éditable depuis page `/app/parametres` (section "Facturation" Phase 7) avec validation Zod (array de 1-3 entiers positifs croissants). Pas de dérivation par convention (OPCO/AGEFICE) — simple et explicite.
- **D-11** : **Canal email seul**. Pas de notif cloche (= scope Phase 4), pas de SMS. Nouveau template HTML/text `apps/web/src/lib/mailer-templates/invoice-reminder.ts` clone-strict du pattern Phase 9 `lead-assigned.ts`. Subject et corps dépendent du niveau (amical vs ferme).
- **D-12** : **2 niveaux ton** :
  - **Niveau 1 (J+30)** ton amical — Subject "Rappel — Facture {number} en attente", corps "Petit rappel : la facture est en attente de règlement depuis le {issueDate}."
  - **Niveau 2 (J+45)** ton ferme — Subject "Mise en demeure — Facture {number} impayée depuis {N} jours", corps "Sans paiement sous 15 jours, nous engagerons une procédure de recouvrement."
- **D-13** : **Auto-stop sur paiement**. Dès que `Invoice.status` passe à `PAID` (paiement total), le worker skip cette facture. Si `PARTIAL`, le worker continue les relances (jusqu'à PAID complet).
- **D-13b** : **Tracking** : nouveau champ `Invoice.lastReminderAt DateTime?` + `Invoice.reminderCount Int @default(0)`. Permet au worker de skipper si `lastReminderAt > now() - 24h` (idempotence) et au worker de stopper après niveau max.
- **D-13c** : **AuditLog** : chaque relance (auto OU manuelle) crée une entrée `entity='Invoice'`, action=`invoices.reminder_sent`, payload={level: 1|2, channel: 'email', triggered_by: 'cron'|'manual'}. Helper `logInvoiceEvent` clone-strict `logLeadEvent` Phase 9.

### Export comptable (FACT-04)

- **D-14** : **xlsx générique** uniquement (pas FEC officiel Bercy). 12 colonnes fixes : `Date émission / Numéro / Type (FAC|AVO) / Libellé / Payeur / SIRET / Montant HT / TVA / Montant TTC / Payé / Reste / Statut`. Pour les avoirs (status=CREDIT_NOTE), montant HT/TTC en **négatif** + Type "AVO". Une ligne supplémentaire optionnelle `Date paiement` si `Invoice.paidAt` set.
- **D-15** : **Sélecteur période** sur page `/app/factures` (bouton "Exporter" en haut à droite) : chips "Ce mois" / "Mois dernier" / "Trimestre courant" / "Année courante" / "Personnalisé" (2 DateInput from/to). Filter SQL `Invoice.issueDate BETWEEN ? AND ?`.
- **D-16** : **Avoirs inclus dans le même export** (montant négatif + type AVO). L'expert-comptable veut le bilan global et le solde net se calcule directement en Excel `SUM(HT)`.
- **D-17** : **RBAC ADMIN + COMPTABLE** uniquement. `requireRole(['ADMIN', 'COMPTABLE'])` Phase 8 pattern. Server action `exportInvoicesXlsx` + route API `/api/factures/export` (download direct). Stack : `xlsx` 0.20.3 (déjà installé, utilisé pour qualiopi-bilan Phase 3).

### Stack & Conventions

- **D-18** : **AuditLog convention `entity='Invoice'`** étendue. Actions namespacées :
  - `invoices.created`
  - `invoices.issued` (DRAFT → ISSUED)
  - `invoices.payment_recorded`
  - `invoices.credit_note_created`
  - `invoices.reminder_sent`
  - `invoices.exported` (export comptable)
- **D-19** : **RBAC matriciel** :
  - **ADMIN + MANAGER + COMPTABLE** : write create/update factures + créer avoirs + envoyer relances + export
  - **COMMERCIAL** : read sa propre activité (factures liées à ses leads convertis)
  - **FORMATEUR** : read uniquement les factures liées aux sessions où il est formateur (déjà géré Phase 8 RBAC)
- **D-20** : **Style visuel QualiOF** (cohérent Phase 6 + 9.1) : PrioCard top, tableau plat avec filtres chips, pas grille Excel. Pastilles statuts (vert PAID / orange PARTIAL / rouge OVERDUE / gris CANCELLED). Override Typography Phase 9.1 respecté.
- **D-21** : **Cron infrastructure** : nouveau worker `apps/web/scripts/invoice-reminder-worker.ts` (pattern `closure-worker.ts` Phase 2.2 réutilisé). Configuration BullMQ repeatable cron `pattern: '0 8 * * *', tz: 'Europe/Paris'` (8h chaque matin heure Paris, jobId 'daily-reminders-cron' pour idempotence). Décision révisée 2026-05-19 plan-checker iteration 1 : meilleur contrôle fuseau + créneau heure ouvré que `every: 86400000` qui dépend de l'instant du premier registry. Script ajouté à `pnpm dev:full` via `concurrently`.

### Claude's Discretion

- Format exact du template email (texte exact des relances J+30 et J+45) — à raffiner pendant le plan en restant fidèle au ton décrit en D-12
- Choix Radix Dialog vs AlertDialog pour confirmation "Créer un avoir" — réutiliser le pattern de Phase 9 (`ReassignLeadButton`)
- Tri par défaut liste factures (recommandation : `issueDate DESC, number DESC`)
- Sticky header vs floating sur tableau liste (cohérence Phase 9.1 matrice)
- Animation/transition entre filtres
- Empty state strings : "Aucune facture pour cette période" / "Aucun impayé 🎉"

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Référentiel projet & roadmap
- `.planning/PROJECT.md` — Core value pilier 2 « Suivi trésorerie OPCO + AGEFICE ». Cette phase consolide la **comptabilité côté factures** (les dossiers OPCO sont déjà gérés Palier 3).
- `.planning/ROADMAP.md` §"Phase 11: Factures cycle complet" — Goal + 4 Success Criteria
- `.planning/REQUIREMENTS.md` §FACT-01..04

### Phases précédentes (patterns à reproduire)
- `.planning/phases/07-param-tres-organisme-ditables/07-CONTEXT.md` §AuditLog convention — `entity='Tenant' / parameters.*` (à étendre `entity='Invoice' / invoices.*`)
- `.planning/phases/07-param-tres-organisme-ditables/07-02-SUMMARY.md` — pattern `lib/numbering.ts` `getNextInvoiceNumber` (à cloner pour `getNextCreditNoteNumber`)
- `.planning/phases/08-multi-utilisateurs-et-rbac/08-CONTEXT.md` — convention `requireRole` à appliquer
- `.planning/phases/09-distribution-leads-automatique/09-02-SUMMARY.md` — pattern `lib/lead-notifications.ts` (à cloner pour `lib/invoice-notifications.ts`) + AuditLog `logLeadEvent` (à cloner pour `logInvoiceEvent`)
- `.planning/phases/09.1-centralisation-qualiopi-360/09.1-CONTEXT.md` — D-05 cross-navigation Airtable-style à reproduire

### Code QualiOF existant à lire avant de planifier
- `packages/db/prisma/schema.prisma` — modèles `Invoice` (lignes ~720-750), `InvoicePayment`, `Tenant` (extension +2 colonnes), `InvoiceStatus` enum (déjà inclut CREDIT_NOTE), `Organization`, `SessionParticipant`
- `apps/web/src/server/actions/invoices.ts` — 3 actions existantes (`createInvoiceFromParticipant`, `createInvoiceForSponsorGroup`, `recordInvoicePayment`)
- `apps/web/src/lib/invoice-template.ts` — `renderInvoiceHtml(d: InvoiceData)` 236 lignes (à étendre pour template CREDIT_NOTE)
- `apps/web/src/lib/numbering.ts` — `getNextInvoiceNumber(tenantId)` à cloner en `getNextCreditNoteNumber(tenantId)`
- `apps/web/src/app/app/factures/page.tsx` — placeholder à REMPLACER ENTIÈREMENT par la nouvelle liste
- `apps/web/src/app/app/factures/[id]/page.tsx` — fiche détail existante (216l) à enrichir avec bouton "Créer un avoir"
- `apps/web/src/components/invoices/record-payment-form.tsx` — pattern Dialog à reproduire pour `CreateCreditNoteDialog`
- `apps/web/src/lib/closure/worker.ts` + `apps/web/scripts/closure-worker.ts` — pattern BullMQ worker à cloner pour `invoice-reminder-worker.ts`
- `apps/web/src/lib/closure/queue.ts` — pattern queue BullMQ
- `apps/web/src/lib/rbac.ts` — `requireRole`, `hasRole` Phase 8
- `apps/web/src/lib/audit-log.ts` — extensions Phase 7/8/9, ajouter `logInvoiceEvent`
- `apps/web/src/lib/mailer.ts` — `sendMail` (dry-run si SMTP_HOST vide)
- `apps/web/src/lib/mailer-templates/lead-assigned.ts` — clone-strict pour `invoice-reminder.ts`
- `apps/web/src/app/api/qualiopi-bilan/export/route.ts` — pattern API route xlsx export (à cloner pour `/api/factures/export/route.ts`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`Invoice` model Prisma** — 7 statuts dont CREDIT_NOTE déjà présent, FK self-référence à créer (`originalInvoiceId`)
- **`InvoicePayment` model** — utilisé tel quel
- **`Tenant.invoicePrefix`** Phase 7-02 — étendre avec `creditNotePrefix` et `invoiceReminderDays`
- **`lib/numbering.ts`** — pattern `getNextInvoiceNumber` à cloner
- **`lib/invoice-template.ts`** — template PDF, à étendre mode CREDIT_NOTE (header "AVOIR", montants négatifs)
- **`PrioCard`** Phase 6 — réutilisable pour les 4 KPI top
- **`FilterChips`** Phase 5 — déjà utilisé par qualiopi-bilan, réutilisable pour filtres période/statut
- **Radix `Dialog`** Phase 4/9 — pour `CreateCreditNoteDialog`
- **`xlsx` 0.20.3** déjà installé (utilisé par qualiopi-bilan export)
- **BullMQ + ioredis** + worker pattern `closure-worker.ts` — pattern complet à cloner pour `invoice-reminder-worker.ts`
- **`closure-pack` worker** Phase 9.1 — pattern de structure repeatable job

### Established Patterns

- Server Actions `{ ok, error }` discriminated returns (Convention QualiOF)
- AuditLog convention namespacée `entity='X' / action='x.action'` (Phase 7 → 9.1)
- `requireRole(['X','Y'])` Phase 8 sur toutes server actions sensibles
- `revalidatePath` après mutation
- Tests Vitest source-regex (pas Testing Library)
- PDF rendering Gotenberg + footer in-body fixed (PACK-05)
- Mailer dry-run si SMTP_HOST vide (pattern Phase 8 et 9)
- Zod schemas dans `packages/shared/src/schemas/`

### Integration Points

- **Sidebar nav-config.ts** : entrée "Factures" existe déjà (placeholder pointed). À conserver telle quelle, la nouvelle page s'affiche au même URL.
- **TopBar cloche** : pas touché (D-11 email seul, pas de notif cloche relances).
- **Page Paramètres** : ajouter section "Facturation" avec champs `invoicePrefix` (existant) + `creditNotePrefix` + `invoiceReminderDays` (3 colonnes Tenant éditables ADMIN).
- **Fiche apprenant** `/app/apprenants/[id]` (refondue Phase 9.1) : ajouter section "Factures" (nouveau composant `<LearnerInvoicesBlock>`)
- **Fiche session** `/app/sessions/[id]` (refondue Phase 9.1) : ajouter section "Factures" (nouveau composant `<SessionInvoicesBlock>`)
- **API routes** : nouvelle route `/api/factures/export/route.ts` (xlsx download)
- **Worker process** : nouveau script `apps/web/scripts/invoice-reminder-worker.ts` lancé en parallèle via `concurrently` dans `pnpm dev:full`

</code_context>

<specifics>
## Specific Ideas

- **Critère acceptation principal** : l'expert-comptable doit pouvoir téléverser le xlsx export dans son logiciel comptable sans retraitement (12 colonnes attendues format standard).
- **Cas terrain Laurent** : la majorité des factures sont vers OPCO (délai 60j légal) ou directement vers l'apprenant (délai 30j). Le paramètre tenant `invoiceReminderDays: [30, 45]` couvre les 2 cas en restant simple — Laurent éditera dans Settings si besoin.
- **Convention française des avoirs** (CGI art. 289) : un avoir = facture rectificative qui annule tout ou partie d'une facture précédemment émise. Numérotation séquentielle DÉDIÉE obligatoire (pas mêlée aux factures).
- **Anti-régression** : la numérotation FAC- existante (Phase 7-02) ne doit pas être impactée. `getNextCreditNoteNumber` doit être atomique (transactional) comme `getNextInvoiceNumber`.
- **Mode dry-run mailer** : si `SMTP_HOST` vide, le worker doit logger les relances en console au lieu de les envoyer. Pattern Phase 8 et 9.

</specifics>

<deferred>
## Deferred Ideas

- **FEC officiel Bercy** : si contrôle fiscal demande le FEC, on l'ajoute Phase 14 ou ad-hoc. Format pipe 18 colonnes lourd à implémenter, pas nécessaire au quotidien.
- **Bulk actions multi-sélect** sur liste factures (marquer payé en bulk, envoyer relance bulk) : deferred si vraiment utile en pratique, sinon abandonné.
- **3ème niveau de relance** (J+60 ou mise en demeure formelle) : si nécessaire, ajouter en cours d'usage via configuration tenant `invoiceReminderDays: [30, 45, 60]`.
- **Notif cloche relances** dans TopBar : non demandé, peut être Phase 14 si Laurent veut un dashboard "factures en retard".
- **Workflow encaissement bancaire automatique** (rapprochement bancaire) : grand chantier, deferred. Pour l'instant `recordInvoicePayment` manuel.
- **Export Sage / Cegid / autres formats comptables** : si l'expert-comptable a un besoin spécifique, à ajouter ad-hoc.
- **Génération automatique de facture à la clôture de session** : Pack fin de formation Phase 2.2 ne génère pas auto la facture aujourd'hui. À considérer Phase 14 (auto-trigger).

</deferred>

---

*Phase: 11-factures-cycle-complet*
*Context gathered: 2026-05-19*

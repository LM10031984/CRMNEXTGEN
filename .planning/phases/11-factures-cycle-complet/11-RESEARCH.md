# Phase 11 : Factures cycle complet — Research

**Researched:** 2026-05-19
**Domain:** Module Factures bout en bout (avoirs + relances BullMQ + export comptable)
**Confidence:** HIGH (le code existant est extensivement documenté, tous les patterns à cloner sont identifiés et testés en Phases 7/8/9/9.1)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** : Réutiliser `Invoice` + `status=CREDIT_NOTE` + nouveau champ `originalInvoiceId String?` (self-FK Invoice.id). Pas de model `CreditNote` séparé.
- **D-02** : Numérotation `AVO-NNNNNN` distincte avec nouveau champ `Tenant.creditNotePrefix String @default("AVO")`. Helper `getNextCreditNoteNumber` clone-strict de `getNextInvoiceNumber`. Convention française CGI art. 289.
- **D-03** : CTA "Créer un avoir" sur `/app/factures/[id]` uniquement (visible si status ∈ {ISSUED, PAID, PARTIAL, OVERDUE}). Click → Radix Dialog : montant HT + motif (textarea obligatoire).
- **D-04** : Avoir partiel OU total. Si `montantAvoir === invoice.amountHT` → facture origine passe à `CANCELLED`, sinon facture origine inchangée.
- **D-05** : 4 PrioCard métier en haut de `/app/factures` : CA facturé mois / Impayés (somme reste + count) / DSO moyen / À facturer (count `SessionParticipant.enrollmentStatus=COMPLETED` sans Invoice).
- **D-06** : Filtres combinés : Status multi-chips · Période chips (Ce mois/Mois dernier/Trimestre/Année/Personnalisé) · Payeur (search org) · Type FAC/AVO · Bouton 1-clic "Voir seulement impayés" (ISSUED+PARTIAL+OVERDUE).
- **D-07** : Cross-navigation Airtable-style (Phase 9.1 D-05) : ligne facture → fiche facture · `<LearnerInvoicesBlock>` fiche apprenant · `<SessionInvoicesBlock>` fiche session · avoirs apparaissent en rows distinctes avec badge "AVO" + lien vers facture originale.
- **D-08** : Pas de bulk actions multi-sélect cette phase (deferred).
- **D-09** : Hybride relances = cron BullMQ daily (nouveau worker `invoice-reminder-worker.ts` repeatable 8h chaque matin) + bouton manuel "Envoyer relance maintenant" sur fiche facture.
- **D-10** : `Tenant.invoiceReminderDays Int[] @default([30, 45])`. Éditable depuis `/app/parametres` (section "Facturation"). Validation Zod (array 1-3 entiers positifs croissants).
- **D-11** : Email seul (pas notif cloche, pas SMS). Template `apps/web/src/lib/mailer-templates/invoice-reminder.ts` clone-strict pattern Phase 9 `lead-assigned.ts`.
- **D-12** : 2 niveaux ton — **Niveau 1 (J+30)** amical "Rappel — Facture {number} en attente" · **Niveau 2 (J+45)** ferme "Mise en demeure — Facture {number} impayée depuis {N} jours".
- **D-13** : Auto-stop sur paiement. `PAID` → worker skip. `PARTIAL` → worker continue relances jusqu'à PAID complet.
- **D-13b** : Tracking via `Invoice.lastReminderAt DateTime?` + `Invoice.reminderCount Int @default(0)`. Worker skip si `lastReminderAt > now() - 24h` (idempotence) et stop après niveau max.
- **D-13c** : AuditLog `entity='Invoice'`, action=`invoices.reminder_sent`, payload `{level, channel:'email', triggered_by:'cron'|'manual'}`. Helper `logInvoiceEvent` clone-strict `logLeadEvent`.
- **D-14** : Export xlsx 12 colonnes : `Date émission / Numéro / Type (FAC|AVO) / Libellé / Payeur / SIRET / Montant HT / TVA / Montant TTC / Payé / Reste / Statut`. Avoirs en montants HT/TTC **négatifs**. Ligne `Date paiement` optionnelle si `paidAt`.
- **D-15** : Sélecteur période sur `/app/factures` (bouton "Exporter" en haut à droite) : chips Ce mois / Mois dernier / Trimestre / Année / Personnalisé (2 DateInput). Filter `Invoice.issueDate BETWEEN ? AND ?`.
- **D-16** : Avoirs inclus dans le même export (négatif + type AVO). Solde net via `SUM(HT)` dans Excel.
- **D-17** : RBAC `requireRole(['ADMIN', 'COMPTABLE'])` Phase 8 sur export. Server action `exportInvoicesXlsx` + route API `/api/factures/export/route.ts`. Stack xlsx 0.20.3 (déjà installé).
- **D-18** : Convention `entity='Invoice'` étendue. Actions : `invoices.created` / `invoices.issued` / `invoices.payment_recorded` / `invoices.credit_note_created` / `invoices.reminder_sent` / `invoices.exported`.
- **D-19** : RBAC matriciel — ADMIN+MANAGER+COMPTABLE write factures+avoirs+relances+export · COMMERCIAL read sa propre activité · FORMATEUR read sessions où il est formateur.
- **D-20** : Style QualiOF (Phase 6 + 9.1) — PrioCard top, tableau plat + filtres chips, pastilles statuts (vert PAID / orange PARTIAL / rouge OVERDUE / gris CANCELLED / violet AVO).
- **D-21** : Worker `apps/web/scripts/invoice-reminder-worker.ts` (clone `closure-worker.ts`). Repeatable BullMQ `every: 86400000` (24h). Ajouté à `pnpm dev:full` via `concurrently`.

### Claude's Discretion

- Format exact des textes templates email (à rédiger pendant le plan, fidèle au ton D-12)
- Choix Radix Dialog vs AlertDialog pour confirmation "Créer un avoir" (réutiliser pattern Phase 9 `ReassignLeadButton` = `@radix-ui/react-dialog`)
- Tri par défaut liste factures (recommandation : `issueDate DESC, number DESC`)
- Sticky header vs floating sur tableau liste (cohérence Phase 9.1 matrice)
- Animation/transition entre filtres
- Empty state strings : "Aucune facture pour cette période" / "Aucun impayé 🎉"

### Deferred Ideas (OUT OF SCOPE)

- **FEC officiel Bercy** (format pipe 18 colonnes)
- **Bulk actions multi-sélect** (marquer payé, relance bulk)
- **3ème niveau de relance** (J+60) — possible via config tenant `[30, 45, 60]` au runtime
- **Notif cloche relances** dans TopBar
- **Rapprochement bancaire automatique**
- **Export Sage/Cegid** spécifiques
- **Génération automatique de facture à la clôture de session** (Phase 14)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research Support |
|----|-------------------------------|------------------|
| **FACT-01** | Stabilisation Factures — audit du périmètre actuel + liste des gaps + fix des gaps prioritaires | §Code Inventory + §Server Actions Inventory (3 actions existantes, 5 à ajouter) + §Page Liste UI (placeholder à remplacer) |
| **FACT-02** | Numérotation séquentielle factures (configurable préfixe) + gestion avoirs (NCN — note de crédit) | §Schema Changes (`originalInvoiceId` + `creditNotePrefix`) + §Numérotation Avoirs (helper `getNextCreditNoteNumber` clone-strict transactionnel) + §Template PDF avoir (mode CREDIT_NOTE) |
| **FACT-03** | Suivi paiements + relances impayés automatiques (J+30, J+45 selon délais convention) | §Worker BullMQ relances + §Mailer Templates Relances (2 niveaux) + §Server Actions Inventory (`sendInvoiceReminder`) + tracking `lastReminderAt`+`reminderCount` |
| **FACT-04** | Export comptable FEC ou xlsx format expert-comptable | §Export Xlsx Spec (12 colonnes D-14) + §RBAC Matrix (ADMIN+COMPTABLE) + route API `/api/factures/export/route.ts` clone-strict `qualiopi-bilan/export` |

</phase_requirements>

## Phase Summary

Cette phase complète le module Factures en ajoutant 4 capacités qui ferment le cycle comptable : **(1)** les avoirs (notes de crédit, NCN au sens CGI art. 289) modélisés par réutilisation du modèle `Invoice` avec `status=CREDIT_NOTE` et une nouvelle self-FK `originalInvoiceId`, séquence dédiée `AVO-NNNNNN` clonée du pattern Phase 7 `getNextInvoiceNumber` ; **(2)** une page liste métier `/app/factures` qui remplace le placeholder actuel — 4 PrioCard KPI (CA mois / Impayés / DSO / À facturer), filtres chips Phase 5/9, cross-navigation Phase 9.1 vers fiche apprenant + fiche session ; **(3)** un système de relances email hybride — worker BullMQ repeatable daily (clone-strict `closure-worker.ts`) + bouton manuel par facture, délais configurables par tenant (`invoiceReminderDays Int[] @default([30,45])`), 2 niveaux de ton (amical/ferme), idempotence via `lastReminderAt`+`reminderCount`, auto-stop sur paiement, AuditLog systématique ; **(4)** un export comptable xlsx générique (pas FEC) avec 12 colonnes standardisées (avoirs négatifs dans le même fichier), filtré par période, route API clonée de `/api/qualiopi-bilan/export`.

**Primary recommendation :** clone-strict de patterns Phase 7 (numérotation), Phase 9 (mailer templates + AuditLog `logXxxEvent`), Phase 9.1 (cross-nav D-05 + matrice statuts) + Phase 2.2 (worker BullMQ). Le risque principal est la concurrence sur la numérotation `AVO-` (mitigation : pattern `prisma.$transaction(tx => getNextCreditNoteNumber(tenantId, tx))` strictement identique à `getNextInvoiceNumber`). Aucune nouvelle dépendance npm requise : xlsx, BullMQ, nodemailer, Radix Dialog, Zod sont déjà installés.

## Project Constraints (from CLAUDE.md)

- **Tech stack figé** : Next.js 14.2.21 + Prisma 5.22 + BullMQ 5.76.4 + ioredis 5.10.1 + Zod 3.23 + Lucia 3.2 + xlsx 0.20.3 + nodemailer 8.0.7
- **Server Actions** : retour `{ ok, error }` discriminé (PATTERN ABSOLU)
- **Multi-tenant** : `tenantId` scope sur TOUTE requête Prisma (defense in depth)
- **Money** : stocké en `Decimal(10,2)` côté Prisma, conversion Number côté UI
- **RBAC Phase 8** : `requireRole([...])` en début de chaque server action mutante avec try/catch UnauthorizedError/ForbiddenError → `{ ok: false, error: e.message }`
- **AuditLog Phase 7/8/9/9.1** : convention `entity='X' / action='x.namespaced'`, helper `logXxxEvent` par entité (PAS éditer `audit-log.ts` global — créer un nouveau module si besoin)
- **Mailer** : dry-run automatique si `SMTP_HOST` vide ou `MAIL_DRY_RUN=true` (le worker doit fonctionner sans Redis/SMTP en dev)
- **Tests** : Vitest 2.1.8 en mode **source-regex** (`environment: 'node'`, pas de jsdom, pas de `@testing-library/react`). Pattern source-regex documenté D-Phase9-N
- **TypeScript strict** : `noUncheckedIndexedAccess: true` (attention aux tableaux)
- **PDF** : Gotenberg via `renderHtmlToPdf` + footer in-body fixed `position:fixed bottom:0` à 11pt (pattern QualiOF, ne pas régresser)
- **Routes FR kebab-case** : `/app/factures` existe déjà, ne pas changer l'URL
- **Composants UI** : Radix + Tailwind, primitives perso `components/ui/*`, `cn()`, `cva()`
- **`.planning/` gitignored** : commits docs `commit_docs: false`

## Code Inventory

### 1. `packages/db/prisma/schema.prisma`

| Élément | Localisation | Notes |
|---------|--------------|-------|
| `model Tenant` | L24-52 | Déjà étendu Phase 7 (10 colonnes nullables) et Phase 9 (3 booleans). Ajout requis Phase 11 : `creditNotePrefix String? @default("AVO")` + `invoiceReminderDays Int[] @default([30, 45])`. |
| `enum InvoiceStatus` | L727-735 | **Inclut déjà `CREDIT_NOTE`** (D-01 lockable). Aucune modification. |
| `model Invoice` | L737-773 | 1 unique (`number`), 2 index `[tenantId,status]` + `[tenantId,issueDate]`. Decimal(10,2) sur tous les montants. Champ `participantIds Json?` pour facture groupée. Ajout requis : `originalInvoiceId String?` (self-FK), `lastReminderAt DateTime?`, `reminderCount Int @default(0)`. |
| `model InvoicePayment` | L775-785 | Cascade onDelete via FK `invoiceId`. **Aucune modification requise** — utilisé tel quel. |

### 2. `apps/web/src/lib/numbering.ts` (clone-strict template)

- **Export** : `getNextInvoiceNumber(tenantId: string, tx?: Prisma.TransactionClient): Promise<string>`
- **Stratégie** : `findFirst({ where: { tenantId, number: { startsWith: '${prefix}-' } }, orderBy: { number: 'desc' } })` → parse `lastNum + 1` → `${prefix}-${padStart(6, '0')}`
- **Atomicité** : passer `tx` à l'appel depuis `prisma.$transaction` (impératif en création). Comme l'index unique est `Invoice.number`, deux insertions simultanées hors transaction provoqueraient un `P2002` ; la transaction sérialise via le verrou Postgres acquis sur la table.
- **Fallback** : `tenant?.invoicePrefix ?? 'FAC'` (`creditNotePrefix ?? 'AVO'` pour le clone) avec trim défensif.
- **Format** : 6 chiffres zero-padded (`String(n).padStart(6, '0')`)

### 3. `apps/web/src/server/actions/invoices.ts` (3 actions existantes)

| Action | Signature | RBAC | Pattern transactionnel |
|--------|-----------|------|-----------------------|
| `createInvoiceFromParticipant(input)` | `{ ok, invoiceId, documentId, number, error }` | `['ADMIN','MANAGER','COMPTABLE']` | `prisma.$transaction(tx => { number = getNextInvoiceNumber(tenantId, tx); tx.invoice.create(...) })` |
| `createInvoiceForSponsorGroup(input)` | idem | idem | idem |
| `recordInvoicePayment(input)` | `{ ok, error }` | idem | `prisma.$transaction([payment.create, invoice.update, sessionParticipant.update])` ; status `PAID` si `newPaid >= amountTTC`, sinon `PARTIAL` |

Toutes scopent par `user.tenantId` via filtre sur `participant.session.tenantId` ou direct `tenantId` sur Invoice. Toutes appellent `loadOfConfig(user.tenantId)` (Phase 7 D-01 hybrid) pour la marque OF.

### 4. `apps/web/src/lib/closure/worker.ts` + `redis.ts` + `queue.ts`

| Fichier | Rôle | Pattern clonable |
|---------|------|------------------|
| `queue.ts` | Singleton `Queue` BullMQ avec `attempts: 3`, backoff exponentiel, `removeOnComplete: 500` / `removeOnFail: 100` | OK pour `invoice-reminder-queue.ts` mais on n'ajoute **pas** de jobs ad-hoc (uniquement repeatable daily + manual trigger) |
| `redis.ts` | `getQueueRedis()` + `getWorkerRedis()` (BullMQ exige `maxRetriesPerRequest: null` côté worker) | **Réutilisable directement** — pas besoin de nouveau singleton |
| `worker.ts` | `startClosureWorker()` exporte un `Worker<ClosureJobPayload>` avec `concurrency: 3`, listeners `completed`/`failed`/`error` | **Clone-strict** : `startInvoiceReminderWorker()` avec `concurrency: 1` (pas de parallélisme nécessaire) |

### 5. `apps/web/scripts/closure-worker.ts` (entry-point pattern)

```ts
// 24 lignes : import startClosureWorker → call → register SIGINT/SIGTERM shutdown
import { startClosureWorker } from '../src/lib/closure/worker';
const worker = startClosureWorker();
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
```

Et dans `apps/web/package.json` :
```json
"dev:full": "rm -rf .next && concurrently -n next,worker -c blue,magenta -k \"pnpm dev\" \"pnpm worker:closure\"",
"worker:closure": "dotenv -e ../../.env -- tsx scripts/closure-worker.ts"
```

**À étendre Phase 11 :**
```json
"worker:reminders": "dotenv -e ../../.env -- tsx scripts/invoice-reminder-worker.ts",
"dev:full": "rm -rf .next && concurrently -n next,closure,reminders -c blue,magenta,cyan -k \"pnpm dev\" \"pnpm worker:closure\" \"pnpm worker:reminders\""
```

### 6. `apps/web/src/lib/mailer.ts`

- **Export** : `sendMail({ to, subject, html, text?, attachments? }): Promise<{ ok, messageId?, dryRun?, error? }>`
- **Dry-run** : automatique si `MAIL_DRY_RUN=true` OU `SMTP_HOST` vide → `console.log` + `return { ok: true, dryRun: true }`
- **From** : `MAIL_FROM` env ou via `getOfConfig()` (legacy ENV-only car le mailer n'a pas de tenantId au call site) — Plan 11 peut passer `from` explicite via `loadOfConfig(tenantId).emailFrom`

### 7. `apps/web/src/lib/mailer-templates/lead-assigned.ts` (template à cloner)

- **Export** : `renderLeadAssignedEmail(input, of: OfConfig): { subject, html, text }`
- **Pattern** : `escapeHtml()` sur toutes les valeurs interpolées (Pitfall 6) · HTML inline CSS compatible tous clients mail · OfConfig pour marque header+footer · texte fallback
- **Variables interpolées** : `commercialFirstName`, `prospectName`, `leadSource`, `productTitle`, `leadUrl`
- **Style** : palette `BRAND_DARK = '#00527A'` + `BRAND_LIGHT_BG = '#F0F9FF'`

### 8. `apps/web/src/lib/audit-log.ts` (extensions)

- Convention `logXxxEvent` par entité (Phase 7 : `logTenantSettingsChange` / Phase 8 : `logUserAction` / Phase 9 : `logLeadEvent` / Phase 9.1 : `logDocumentEvent` dans un module séparé `document-audit.ts`)
- **D-Phase9.1-02** : ne pas éditer `audit-log.ts` mais créer un module isolé `apps/web/src/lib/invoice-audit.ts` qui exporte `logInvoiceEvent` (clone-strict `logLeadEvent`)
- Signature cible :
  ```ts
  export async function logInvoiceEvent(opts: {
    tenantId: string;
    actorUserId: string | null; // null = system (worker daily cron)
    targetInvoiceId: string;
    action: string; // 'invoices.created' | 'invoices.issued' | ...
    diff?: Diff | Record<string, unknown>;
  }): Promise<void>;
  ```
- **Pas de no-op sur diff vide** (cohérent Phase 9 D-Phase9-H) : certains événements (`invoices.reminder_sent`) n'ont qu'un payload.

### 9. `apps/web/src/lib/rbac.ts`

- `requireRole(allowed: UserRole[]): Promise<LuciaUser>` — throw `UnauthorizedError` / `ForbiddenError`
- Pattern d'usage uniforme (32 calls Phase 8 sur 9 fichiers) : try/catch, instanceof, return `{ ok: false, error: e.message }` puis `throw e` pour les erreurs inattendues
- `validateRequest` (auth.ts) gère déjà `user.disabledAt` (sessions invalidées Phase 8)
- `hasRole(user, allowed)` pour les pages (sans throw, retour boolean)

### 10. `apps/web/src/components/invoices/record-payment-form.tsx`

- Composant client `useState + useTransition` pour le formulaire de paiement inline (pas une Radix Dialog mais une expansion in-place style "Phase 4 expand panel")
- **À cloner pour `CreateCreditNoteDialog`** mais en **Radix Dialog** vrai cette fois (D-Phase9-J pattern : `@radix-ui/react-dialog` avec `Dialog.Title` + `Dialog.Description` + `Dialog.Close`)

### 11. `apps/web/src/app/api/qualiopi-bilan/export/route.ts`

- **Pattern Next.js 14 route API** : `export const dynamic = 'force-dynamic'` + `GET(req: Request)` → `validateRequest` → `loadOfConfig` → query params → build sheet via `XLSX.utils.aoa_to_sheet(sheetData)` + `book_append_sheet` + `XLSX.write({ type: 'buffer', bookType: 'xlsx' })` → `new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': '...xlsx', 'Content-Disposition': 'attachment; filename="..."' } })`
- **À cloner pour `/api/factures/export/route.ts`** avec RBAC `hasRole(user, ['ADMIN', 'COMPTABLE'])` + redirect si autre

### 12. `apps/web/src/lib/invoice-template.ts`

- `renderInvoiceHtml(d: InvoiceData)` — 236 lignes, header "FACTURE" hardcodé L117
- **À étendre Phase 11** : passer `d.documentKind: 'FACTURE' | 'AVOIR'` (default 'FACTURE' pour rétro-compat). En mode `AVOIR` :
  - Header `<h1>AVOIR</h1>` au lieu de `<h1>FACTURE</h1>`
  - Bandeau jaune ajouté : `<div class="legal-mentions"><strong>Avoir sur facture ${originalNumber}</strong> émise le ${originalDate}…</div>`
  - Montants en valeurs **positives** dans le PDF (l'utilisateur saisit toujours un montant positif à créditer) mais on peut soit afficher avec un signe `-` soit avec "À déduire" sémantique
  - Si totale → facture origine passe `CANCELLED`, sinon affiche le solde net en pied de page

## Schema Changes

Migration `phase11_invoices_credit_notes_and_reminders` :

```sql
-- AlterTable Invoice
ALTER TABLE "Invoice" ADD COLUMN "originalInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;

-- Self-FK (avoir → facture originale)
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey"
  FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index pour requêtes worker daily (filtre status + lastReminderAt)
CREATE INDEX "Invoice_tenantId_status_lastReminderAt_idx"
  ON "Invoice"("tenantId", "status", "lastReminderAt");

-- Index pour lookup "Quels avoirs sont liés à cette facture ?"
CREATE INDEX "Invoice_originalInvoiceId_idx" ON "Invoice"("originalInvoiceId");

-- AlterTable Tenant
ALTER TABLE "Tenant" ADD COLUMN "creditNotePrefix" TEXT DEFAULT 'AVO';
ALTER TABLE "Tenant" ADD COLUMN "invoiceReminderDays" INTEGER[] DEFAULT ARRAY[30, 45]::INTEGER[];
```

Diff Prisma `schema.prisma` correspondant :

```diff
 model Tenant {
   id                      String         @id @default(uuid())
   ...
   invoicePrefix           String?        @default("FAC")
+  creditNotePrefix        String?        @default("AVO")
+  invoiceReminderDays     Int[]          @default([30, 45])
   iban                    String?
   ...
 }

 model Invoice {
   id               String              @id @default(uuid())
   tenantId         String
   number           String              @unique
   status           InvoiceStatus       @default(DRAFT)
+  // Phase 11 — Avoirs (D-01). Self-FK : un avoir pointe vers la facture annulée.
+  originalInvoiceId String?
+  originalInvoice   Invoice?           @relation("InvoiceToCreditNote", fields: [originalInvoiceId], references: [id], onDelete: SetNull)
+  creditNotes       Invoice[]          @relation("InvoiceToCreditNote")
+  // Phase 11 — Tracking relances (D-13b). Idempotence + auto-stop.
+  lastReminderAt   DateTime?
+  reminderCount    Int                 @default(0)
   // Liens métier
   participantId    String?
   ...
   @@index([tenantId, status])
   @@index([tenantId, issueDate])
+  @@index([tenantId, status, lastReminderAt])
+  @@index([originalInvoiceId])
 }
```

**Notes** :
- **`onDelete: SetNull`** sur `originalInvoiceId` (et pas Cascade) : si une facture est supprimée par erreur, on ne perd pas l'avoir (qui reste juridiquement valable en tant que document fiscal autonome).
- **`Int[]` Postgres natif** : pas besoin de model séparé. Prisma supporte les arrays Postgres depuis 4.x. Pattern utilisé : aucun en QualiOF aujourd'hui, mais Prisma le supporte sans extension (vérifié sur `previewFeatures = ["postgresqlExtensions"]` déjà actif).
- **Migration additive** : tous les nouveaux champs sont nullables ou ont un default. Aucun risque sur les rows existantes.

## Numérotation Avoirs

Code cible `apps/web/src/lib/numbering.ts` (extension du fichier existant) :

```ts
export async function getNextCreditNoteNumber(
  tenantId: string,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const db = tx ?? prisma;
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { creditNotePrefix: true },
  });
  const prefix = (tenant?.creditNotePrefix ?? 'AVO').trim() || 'AVO';

  const last = await db.invoice.findFirst({
    where: { tenantId, number: { startsWith: `${prefix}-` } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const lastNum = last ? parseInt(last.number.replace(`${prefix}-`, ''), 10) || 0 : 0;
  return `${prefix}-${String(lastNum + 1).padStart(6, '0')}`;
}
```

**Usage atomique** (impératif dans `createCreditNote`) :

```ts
const creditNote = await prisma.$transaction(async (tx) => {
  const number = await getNextCreditNoteNumber(user.tenantId, tx);
  return tx.invoice.create({
    data: {
      tenantId: user.tenantId,
      number,
      status: 'CREDIT_NOTE',
      originalInvoiceId: original.id,
      participantId: original.participantId,
      payerOrgId: original.payerOrgId,
      sessionId: original.sessionId,
      amountHT: new Prisma.Decimal(-Math.abs(montantAvoir)), // négatif côté BDD
      vatRate: original.vatRate,
      amountTTC: new Prisma.Decimal(-Math.abs(montantAvoir * (1 + Number(original.vatRate) / 100))),
      issueDate: new Date(),
      notes: motifTextarea, // motif obligatoire D-03
    },
  });
});
```

**Décision Plan 11 — Montant en BDD :** stocker **en négatif** (cohérence avec D-14 export "Avoirs : montant HT/TTC en négatif"). L'UI saisit toujours positivement (`montantAvoir > 0`) ; la conversion `-Math.abs(x)` se fait dans le server action. Cela simplifie l'export (`SUM(HT)` direct en Excel) ET les KPI ("À encaisser" = somme `amountTTC` non payés des invoices `ISSUED+PARTIAL+OVERDUE` — n'inclut pas les `CREDIT_NOTE` car ces dernières ne sont pas dans le filtre status).

**Anti-régression** : la séquence FAC- ne doit JAMAIS être consultée par `getNextCreditNoteNumber` ni vice-versa. Le filtre `number: { startsWith: 'AVO-' }` garantit l'isolation. Test source-regex `numbering.test.ts:Test 1-5` clone-strict à reproduire avec prefix `'AVO'`.

## Worker BullMQ relances

### Architecture

3 nouveaux fichiers :

1. **`apps/web/src/lib/invoice-reminders/queue.ts`** (clone-strict `closure/queue.ts`)
   ```ts
   import { Queue } from 'bullmq';
   import { getQueueRedis } from '../closure/redis'; // RÉUTILISE le singleton Redis existant

   export const INVOICE_REMINDER_QUEUE_NAME = 'invoice-reminders-daily';

   let _queue: Queue | null = null;
   export function getInvoiceReminderQueue(): Queue {
     if (_queue) return _queue;
     _queue = new Queue(INVOICE_REMINDER_QUEUE_NAME, {
       connection: getQueueRedis(),
       defaultJobOptions: {
         attempts: 3,
         backoff: { type: 'exponential', delay: 60000 },
         removeOnComplete: { count: 100 },
         removeOnFail: { count: 50 },
       },
     });
     return _queue;
   }
   ```

2. **`apps/web/src/lib/invoice-reminders/worker.ts`** (clone-strict `closure/worker.ts`)
   - Connexion via `getWorkerRedis()` (réutilise Phase 2.2)
   - `concurrency: 1` (pas de bénéfice à paralléliser un cron daily)
   - Handler `processReminderJob` : scan Invoice où `status ∈ {ISSUED, PARTIAL, OVERDUE}` et `dueDate ≤ now() - 30j` (premier niveau) ou `... - 45j` (deuxième) — DÉLAIS LUS depuis `Tenant.invoiceReminderDays`
   - Filtre idempotence : skip si `lastReminderAt > now() - 24h`
   - Filtre niveau max : skip si `reminderCount >= invoiceReminderDays.length`
   - Pour chaque facture éligible : appeler `sendInvoiceReminder({ invoiceId, triggered_by: 'cron' })` (server action interne)
   - **PAS de `requireRole`** dans le worker (pas d'utilisateur courant — c'est un process système). On valide la légitimité via le fait que le worker est lancé localement.

3. **`apps/web/scripts/invoice-reminder-worker.ts`** (clone-strict `scripts/closure-worker.ts`)
   ```ts
   import { startInvoiceReminderWorker, scheduleDailyReminders } from '../src/lib/invoice-reminders/worker';

   const worker = startInvoiceReminderWorker();
   // Enregistrement repeatable job — idempotent, BullMQ dédoublonne via jobId
   await scheduleDailyReminders();

   process.on('SIGINT', () => void worker.close().then(() => process.exit(0)));
   process.on('SIGTERM', () => void worker.close().then(() => process.exit(0)));
   ```

### Repeatable job — où l'enregistrer ?

Décision : **dans le script d'entry-point, après le démarrage du worker, via `scheduleDailyReminders()`**. Pattern BullMQ `Queue.add` avec `repeat: { every: 86400000 }` + `jobId: 'daily-reminders-cron'` (dédoublonnage). Inscrit le job UNE FOIS, BullMQ stocke dans Redis et déclenche automatiquement (même après crash du worker).

```ts
// Dans worker.ts :
export async function scheduleDailyReminders(): Promise<void> {
  const queue = getInvoiceReminderQueue();
  // Cron-style : tous les jours à 8h Paris (CRON_TZ pris en charge par BullMQ)
  await queue.add(
    'daily-reminders',
    { triggered_by: 'cron' as const },
    {
      repeat: { pattern: '0 8 * * *', tz: 'Europe/Paris' },
      jobId: 'daily-reminders-cron', // idempotence inscription
    },
  );
  console.log('[invoice-reminder-worker] daily cron registered (8h Paris)');
}
```

**Pattern CRON Paris fixe** : préférer `pattern: '0 8 * * *'` à `every: 86400000` pour avoir un envoi à heure prévisible (les utilisateurs s'attendent à recevoir leurs relances en début de journée ouvrée), pas en fonction de l'instant de démarrage du worker. CONTEXT.md D-21 mentionne `every: 86400000` mais le cron pattern donne le même comportement avec un timing métier correct — à valider pendant le plan.

### Dry-run sans Redis (mode dev)

Si `REDIS_URL` est absent ou inaccessible :
1. `getQueueRedis()` throw au runtime au moment du `new IORedis(...)`
2. Le script `invoice-reminder-worker.ts` doit catcher cette erreur et logger sans crasher (pour ne pas faire planter `pnpm dev:full`)

**Solution recommandée** : wrap le démarrage dans un try/catch :
```ts
try {
  const worker = startInvoiceReminderWorker();
  await scheduleDailyReminders();
} catch (e) {
  console.warn('[invoice-reminder-worker] Redis indisponible — worker désactivé en mode dégradé.', e);
  // process reste vivant pour que concurrently ne kill pas tous les autres
  setInterval(() => {}, 60_000);
}
```

### Intégration `pnpm dev:full`

Modification `apps/web/package.json` :
```json
{
  "scripts": {
    "worker:reminders": "dotenv -e ../../.env -- tsx scripts/invoice-reminder-worker.ts",
    "dev:full": "rm -rf .next && concurrently -n next,closure,reminders -c blue,magenta,cyan -k \"pnpm dev\" \"pnpm worker:closure\" \"pnpm worker:reminders\""
  }
}
```

Flag `-k` (`--kill-others`) déjà présent — si un worker crash, les autres process sont kill (cohérent QualiOF actuel).

## Mailer Templates Relances

Fichier `apps/web/src/lib/mailer-templates/invoice-reminder.ts` (clone-strict `lead-assigned.ts`) :

```ts
import type { OfConfig } from '@/lib/of-config';

const BRAND_DARK = '#00527A';
const BRAND_LIGHT_BG = '#F0F9FF';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export interface InvoiceReminderEmailInput {
  level: 1 | 2; // D-12 : 1 = amical, 2 = ferme
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  daysOverdue: number; // days since dueDate
  amountTtc: number; // remaining to pay (after partial payments)
  payerName: string;
  invoiceUrl: string; // download link or fiche facture
}

export function renderInvoiceReminderEmail(
  input: InvoiceReminderEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const { level, invoiceNumber, issueDate, dueDate, daysOverdue, amountTtc, payerName, invoiceUrl } = input;

  // === SUBJECT ===
  const subject = level === 1
    ? `Rappel — Facture ${invoiceNumber} en attente`
    : `Mise en demeure — Facture ${invoiceNumber} impayée depuis ${daysOverdue} jours`;

  // === TEXT BODY (fallback non-HTML) ===
  const text = level === 1
    ? [
        `Bonjour,`,
        ``,
        `Petit rappel : la facture ${invoiceNumber} (émise le ${fmtDate.format(issueDate)}) est en attente de règlement.`,
        `Montant restant dû : ${fmtEUR.format(amountTtc)}.`,
        `Échéance dépassée depuis le ${fmtDate.format(dueDate)}.`,
        ``,
        `Si le règlement a déjà été effectué, merci d'ignorer ce message.`,
        ``,
        `Consulter la facture : ${invoiceUrl}`,
        ``,
        `Cordialement,`,
        `${of.name}`,
      ].join('\n')
    : [
        `Bonjour,`,
        ``,
        `La facture ${invoiceNumber} (émise le ${fmtDate.format(issueDate)}) est impayée depuis ${daysOverdue} jours.`,
        `Montant restant dû : ${fmtEUR.format(amountTtc)}.`,
        ``,
        `Sans règlement de votre part sous 15 jours, nous engagerons une procédure de recouvrement,`,
        `et appliquerons les pénalités légales (indemnité forfaitaire de 40 € + intérêts au taux légal majoré`,
        `de 10 points — art. L441-10 du Code de commerce).`,
        ``,
        `Consulter la facture : ${invoiceUrl}`,
        ``,
        `Cordialement,`,
        `${of.name}`,
      ].join('\n');

  // === HTML BODY (escape sur toutes les valeurs interpolées) ===
  const headline = level === 1 ? 'Rappel de règlement' : 'Mise en demeure';
  const headlineColor = level === 1 ? BRAND_DARK : '#B91C1C'; // red-700 ferme
  const bandColor = level === 1 ? BRAND_LIGHT_BG : '#FEF2F2'; // red-50 ferme
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1F2937;line-height:1.5;">
  <div style="max-width:600px;margin:24px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:${headlineColor};padding:28px 32px;text-align:center;color:white;">
      <h1 style="margin:0;font-size:18pt;font-weight:700;letter-spacing:1px;">${escapeHtml(of.name)}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px 0;font-size:16pt;color:${headlineColor};">${escapeHtml(headline)}</h2>
      <p style="margin:0 0 16px 0;">Bonjour <strong>${escapeHtml(payerName)}</strong>,</p>
      ${level === 1
        ? `<p style="margin:0 0 16px 0;">Petit rappel : la facture ci-dessous est en attente de règlement depuis le ${escapeHtml(fmtDate.format(dueDate))}.</p>`
        : `<p style="margin:0 0 16px 0;">La facture ci-dessous est impayée depuis <strong>${daysOverdue} jours</strong>. Sans règlement sous 15 jours, nous engagerons une procédure de recouvrement.</p>`
      }
      <div style="background:${bandColor};border-radius:6px;padding:16px;margin:16px 0;">
        <div><strong>Numéro :</strong> <span style="font-family:monospace;">${escapeHtml(invoiceNumber)}</span></div>
        <div><strong>Date d'émission :</strong> ${escapeHtml(fmtDate.format(issueDate))}</div>
        <div><strong>Date d'échéance :</strong> ${escapeHtml(fmtDate.format(dueDate))}</div>
        <div style="margin-top:8px;font-size:13pt;"><strong>Montant restant dû :</strong> ${escapeHtml(fmtEUR.format(amountTtc))}</div>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:${headlineColor};color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:11pt;">
          Consulter la facture
        </a>
      </div>
      ${level === 2 ? `<p style="margin:24px 0 0 0;font-size:9pt;color:#7F1D1D;">Pénalités légales applicables : indemnité forfaitaire de 40 € + intérêts au taux légal majoré de 10 points (art. L441-10 du Code de commerce).</p>` : ''}
      <p style="margin:24px 0 0 0;font-size:10pt;color:#64748B;">Si le règlement a déjà été effectué, merci d'ignorer ce message.<br><br>Cordialement,<br>L'équipe ${escapeHtml(of.name)}</p>
    </div>
    <div style="background:#F8FAFC;padding:16px 32px;border-top:1px solid #E2E8F0;font-size:9pt;color:#64748B;text-align:center;">
      <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong>${of.addressFull ? ` — ${escapeHtml(of.addressFull)}` : ''}<br>
      ${of.siret ? `SIRET : ${escapeHtml(of.siret)}` : ''}${of.siret && of.rnq ? ' — ' : ''}${of.rnq ? `NDA : ${escapeHtml(of.rnq)}` : ''}
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
```

**Variables interpolées (D-12 + audit)** : `{number}`, `{issueDate}`, `{dueDate}`, `{daysOverdue}`, `{amountTtc}`, `{payerName}`, `{invoiceUrl}` — tous mappés via `escapeHtml`. Le niveau (1 ou 2) commute subject + headline + couleurs + bandeau légal.

## Server Actions Inventory

Toutes dans `apps/web/src/server/actions/invoices.ts` (extension) sauf `exportInvoicesXlsx` qui peut vivre dans `invoice-export.ts` (séparation de concern xlsx vs CRUD).

### Nouvelles actions

```ts
// 1. Créer un avoir (D-03 + D-04)
export async function createCreditNote(input: {
  originalInvoiceId: string;
  amountHtToCredit: number; // positif côté UI, converti en négatif côté BDD
  motif: string; // textarea obligatoire D-03
}): Promise<{ ok: boolean; creditNoteId?: string; number?: string; error?: string }>;
// RBAC : ['ADMIN', 'MANAGER', 'COMPTABLE']
// Side-effects :
//   - prisma.$transaction(tx => getNextCreditNoteNumber + invoice.create + invoice.update si total)
//   - renderInvoiceHtml(data, documentKind: 'AVOIR') + uploadFile MinIO
//   - prisma.document.create entityType='invoice' entityId=creditNote.id (cohérence avec FAC)
//   - logInvoiceEvent action='invoices.credit_note_created' diff={originalInvoiceId, amountHt: -montant, motif}
//   - revalidatePath('/app/factures', '/app/factures/[originalId]')

// 2. Envoyer relance manuelle ou cron (FACT-03)
export async function sendInvoiceReminder(input: {
  invoiceId: string;
  triggered_by: 'cron' | 'manual';
}): Promise<{ ok: boolean; level?: 1 | 2; dryRun?: boolean; error?: string }>;
// RBAC : ['ADMIN', 'MANAGER', 'COMPTABLE'] si triggered_by='manual'
//        SKIP requireRole si triggered_by='cron' (worker système)
// Side-effects :
//   - Compute level : (reminderCount + 1) clamped à invoiceReminderDays.length
//   - Check idempotence : skip si lastReminderAt > now - 24h
//   - Check auto-stop : skip si status === 'PAID' || status === 'CANCELLED'
//   - Lire payer.email (priorité payerOrg.email → emailBilling → person.email)
//   - sendMail({ to, subject, html, text }) via renderInvoiceReminderEmail
//   - update Invoice { lastReminderAt: now, reminderCount: { increment: 1 } }
//   - logInvoiceEvent action='invoices.reminder_sent' diff={ level, channel: 'email', triggered_by, dryRun }
//   - revalidatePath('/app/factures/[id]')

// 3. Export xlsx comptable (FACT-04)
export async function exportInvoicesXlsx(input: {
  from: Date;
  to: Date;
  includeStatuses?: InvoiceStatus[]; // default = ALL
}): Promise<{ ok: boolean; buffer?: Buffer; filename?: string; error?: string }>;
// RBAC : ['ADMIN', 'COMPTABLE'] (D-17)
// MAIS : préférable d'exposer cette logique via la route /api/factures/export
// car xlsx returns Buffer → meilleure ergonomie en route API qu'en Server Action.
// Option A : Server Action retourne base64 + bouton client convert + trigger download (lourd)
// Option B : Route API (recommandée) — passe period via query string, RBAC dans la route.
// Décision recommandée : Option B (cohérent qualiopi-bilan/export).

// 4. Update tenant reminder settings (Phase 7 extension)
export async function updateInvoiceReminderSettings(input: {
  invoiceReminderDays: number[]; // Zod : array(int().positive()).min(1).max(3).refine(strictly increasing)
  creditNotePrefix?: string;
}): Promise<{ ok: boolean; error?: string }>;
// RBAC : ['ADMIN'] (cohérent Phase 7 tenant-settings)
// Vit dans server/actions/tenant-settings.ts ou nouveau invoice-settings.ts
// Side-effect : logTenantSettingsChange (Phase 7 helper) action='parameters.update'

// 5. Helper KPI page liste (data fetching)
export async function getInvoicesListData(input: {
  filters: {
    statuses?: InvoiceStatus[];
    from?: Date;
    to?: Date;
    payerOrgId?: string;
    onlyUnpaid?: boolean;
  };
  page: number;
  pageSize: number;
}): Promise<{
  kpis: { caMois: number; impayesAmount: number; impayesCount: number; dsoMoyen: number | null; aFacturerCount: number };
  rows: InvoiceRow[];
  total: number;
}>;
// PAS de RBAC throw (la page filtre par rôle Phase 8) : juste validateRequest()
// Helper pur testable côté isolation
```

### Helper `logInvoiceEvent` (nouveau module `lib/invoice-audit.ts`)

```ts
import { prisma } from '@qualiof/db';

export async function logInvoiceEvent(opts: {
  tenantId: string;
  actorUserId: string | null;
  targetInvoiceId: string;
  action: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      entity: 'Invoice',
      entityId: opts.targetInvoiceId,
      action: opts.action,
      diff: (opts.diff ?? {}) as never,
    },
  });
}
```

### Backfill actions existantes (Plan FACT-01)

Ajouter `logInvoiceEvent` aux 3 actions existantes (`createInvoiceFromParticipant`, `createInvoiceForSponsorGroup`, `recordInvoicePayment`) pour respecter D-18 :
- `createInvoiceFromParticipant` → `logInvoiceEvent({ action: 'invoices.created', ... })` + `'invoices.issued'` puisque la création passe direct en `ISSUED`
- `createInvoiceForSponsorGroup` → idem
- `recordInvoicePayment` → `logInvoiceEvent({ action: 'invoices.payment_recorded', diff: { amount, method, fullyPaid } })`

## Page Liste UI Components

### Composants à créer (path absolu depuis `apps/web/src/`)

| Composant | Path | Type | Props | Rôle |
|-----------|------|------|-------|------|
| `InvoicesListPage` (refonte) | `app/app/factures/page.tsx` | Server Component | (URL searchParams) | Orchestrateur : `validateRequest` → `getInvoicesListData` → rend `<InvoicesPrioCards>` + `<InvoicesFilters>` + `<InvoicesListTable>` |
| `InvoicesPrioCards` | `components/invoices/invoices-prio-cards.tsx` | Server Component | `{ kpis: KpisShape }` | 4 PrioCardLocal grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 (D-Phase9-K clone-strict) |
| `InvoicesFilters` | `components/invoices/invoices-filters.tsx` | Server Component | `{ filters, total }` | FilterChips (Phase 5 réutilisable) pour status + période + bouton "Voir impayés" |
| `InvoicesListTable` | `components/invoices/invoices-list-table.tsx` | Server Component | `{ rows: InvoiceRow[] }` | Tableau plat (clone DataTable Phase 5 ou table inline si simple), badges D-20 pastilles statuts, cross-nav Link |
| `InvoicesExportButton` | `components/invoices/invoices-export-button.tsx` | Client Component | `{ filters, currentRole }` | DropdownMenu : "Ce mois / Mois dernier / Trimestre / Année / Personnalisé". `<a href="/api/factures/export?from=...&to=...">` |
| `CreateCreditNoteDialog` | `components/invoices/create-credit-note-dialog.tsx` | Client Component | `{ originalInvoiceId, originalAmountHt, originalNumber }` | Radix Dialog (pattern Phase 9 `ReassignLeadButton` via `@radix-ui/react-dialog`) + RHF + zodResolver `CreateCreditNoteSchema` |
| `SendReminderButton` | `components/invoices/send-reminder-button.tsx` | Client Component | `{ invoiceId, status, lastReminderAt, reminderCount, maxLevel }` | Bouton "Envoyer relance maintenant" disabled si `status === 'PAID'`, tooltip "Dernière relance le {date}, niveau {N}" |
| `LearnerInvoicesBlock` | `components/learners/learner-invoices-block.tsx` | Server Component | `{ personId, tenantId }` | Bloc sur fiche apprenant `/app/apprenants/[id]` : liste Invoice où `participant.personId = current`, table compact 5 colonnes |
| `SessionInvoicesBlock` | `components/sessions/session-invoices-block.tsx` | Server Component | `{ sessionId, tenantId }` | Bloc sur fiche session `/app/sessions/[id]` : Invoice où `sessionId = current OR participantId ∈ session.participants`, table 5 cols |

### Structure layout `/app/factures/page.tsx`

```tsx
export default async function FacturesPage({ searchParams }: { searchParams: Promise<{ status?: string; period?: string; ... }> }) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');

  // Phase 9 D-Phase9-Q : soft-redirect plutôt que requireRole throw
  if (!hasRole(user, ['ADMIN', 'MANAGER', 'COMPTABLE', 'LECTEUR'])) {
    redirect('/app');
  }

  const sp = await searchParams;
  const filters = parseFiltersFromSearchParams(sp); // helper pur
  const { kpis, rows, total } = await getInvoicesListData({ filters, page: 1, pageSize: 50 });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Factures</h1>
          <p className="text-sm text-muted-foreground">Suivi de trésorerie · {total} facture(s)</p>
        </div>
        <InvoicesExportButton filters={filters} currentRole={user.role} />
      </header>

      <InvoicesPrioCards kpis={kpis} />
      <InvoicesFilters filters={filters} />
      <InvoicesListTable rows={rows} />
    </div>
  );
}
```

### Fiche détail `/app/factures/[id]/page.tsx` (extension)

À ajouter au layout existant (déjà 216 lignes), AVANT le `<RecordPaymentForm>` :

```tsx
{/* CTA "Créer un avoir" — D-03 */}
{['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
  <CreateCreditNoteDialog
    originalInvoiceId={invoice.id}
    originalAmountHt={Number(invoice.amountHT)}
    originalNumber={invoice.number}
  />
)}

{/* Section avoirs liés (si la facture en a) */}
{creditNotes.length > 0 && (
  <section>
    <h2 className="text-lg font-semibold">Avoirs liés</h2>
    <ul>...lien vers chaque avoir avec amount HT + motif...</ul>
  </section>
)}

{/* CTA "Envoyer relance maintenant" — D-09 */}
{['ISSUED', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
  <SendReminderButton
    invoiceId={invoice.id}
    status={invoice.status}
    lastReminderAt={invoice.lastReminderAt}
    reminderCount={invoice.reminderCount}
    maxLevel={tenantReminderDays.length}
  />
)}

{/* Si CREDIT_NOTE : afficher header "AVOIR ${number} — sur facture ${originalNumber}" + lien retour */}
{invoice.status === 'CREDIT_NOTE' && invoice.originalInvoice && (
  <div className="bg-amber-50 border border-amber-200 p-3 rounded">
    <Link href={`/app/factures/${invoice.originalInvoice.id}`}>← Voir la facture originale {invoice.originalInvoice.number}</Link>
  </div>
)}
```

### Zod schemas (à ajouter dans `packages/shared/src/schemas/invoice.ts`)

```ts
import { z } from 'zod';

export const CreateCreditNoteSchema = z.object({
  originalInvoiceId: z.string().uuid(),
  amountHtToCredit: z.number().positive().finite(),
  motif: z.string().trim().min(3, 'Motif obligatoire (3 caractères minimum)').max(500),
});
export type CreateCreditNoteInput = z.infer<typeof CreateCreditNoteSchema>;

export const InvoiceReminderSettingsSchema = z.object({
  invoiceReminderDays: z.array(z.number().int().positive())
    .min(1, 'Au moins 1 délai requis')
    .max(3, 'Maximum 3 délais')
    .refine(arr => arr.every((v, i) => i === 0 || v > arr[i - 1]!), 'Les délais doivent être strictement croissants'),
  creditNotePrefix: z.string().trim().min(1).max(8).regex(/^[A-Z0-9]+$/).optional(),
});

export const ExportInvoicesQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  statuses: z.array(z.string()).optional(), // validé côté action par mapping enum
});
```

## Export Xlsx Spec

### Route API `apps/web/src/app/api/factures/export/route.ts`

```ts
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { loadOfConfig } from '@/lib/of-config';
import { prisma } from '@qualiof/db';
import { ExportInvoicesQuerySchema } from '@qualiof/shared';
import { logInvoiceEvent } from '@/lib/invoice-audit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!hasRole(user, ['ADMIN', 'COMPTABLE'])) return new NextResponse('Forbidden', { status: 403 });

  const url = new URL(req.url);
  const parsed = ExportInvoicesQuerySchema.safeParse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });
  if (!parsed.success) return new NextResponse('Bad request', { status: 400 });
  const { from, to } = parsed.data;

  const of = await loadOfConfig(user.tenantId);

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: user.tenantId,
      issueDate: { gte: from, lte: to },
      // D-16 : avoirs INCLUS dans le même export
    },
    include: {
      payerOrg: { select: { legalName: true, siret: true } },
      participant: { include: { person: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { issueDate: 'asc' },
  });

  // 12 colonnes D-14
  const headers = [
    "Date émission", "Numéro", "Type", "Libellé", "Payeur", "SIRET",
    "Montant HT", "TVA", "Montant TTC", "Payé", "Reste", "Statut",
  ];

  const rows = invoices.map((inv) => {
    const isAvoir = inv.status === 'CREDIT_NOTE';
    const libelle = inv.participant
      ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
      : 'Facture groupée';
    return [
      inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : '',
      inv.number,
      isAvoir ? 'AVO' : 'FAC',
      libelle,
      inv.payerOrg?.legalName ?? '',
      inv.payerOrg?.siret ?? '',
      Number(inv.amountHT), // déjà négatif côté BDD si AVO (cf §Numérotation)
      Number(inv.amountTTC) - Number(inv.amountHT),
      Number(inv.amountTTC),
      Number(inv.amountPaid),
      Number(inv.amountTTC) - Number(inv.amountPaid),
      inv.status,
    ];
  });

  const sheetData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 30 }, { wch: 28 }, { wch: 16 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Factures`);
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Audit log (D-18)
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: 'BULK', // pas une ligne précise — convention bulk
    action: 'invoices.exported',
    diff: { from: from.toISOString(), to: to.toISOString(), count: invoices.length },
  });

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="factures_${fromStr}_${toStr}.xlsx"`,
    },
  });
}
```

### Notes export

- **Avoirs en négatif** : `inv.amountHT` est stocké en négatif côté BDD pour les `status='CREDIT_NOTE'` (cf §Numérotation Avoirs). L'export les ressort tels quels → Excel `SUM(HT)` donne directement le solde net (D-16).
- **`SIRET vide`** : si pas de `payerOrg` (cas rare facture sans org), colonne vide. Pas d'erreur.
- **Encoding** : `XLSX.write({ type: 'buffer', bookType: 'xlsx' })` produit du UTF-8 natif (pas besoin de BOM comme en CSV).
- **Filename pattern** : `factures_YYYY-MM-DD_YYYY-MM-DD.xlsx` (pattern cohérent avec `C1.i2_Bilan_Qualiopi_2026.xlsx` Phase 3).
- **Limite volume** : aucune limite hard-codée. Pour 10k+ lignes, ajouter une streaming option (deferred, pas en scope Phase 11).

## RBAC Matrix

| Action | ADMIN | MANAGER | COMPTABLE | COMMERCIAL | FORMATEUR | LECTEUR |
|--------|-------|---------|-----------|------------|-----------|---------|
| Voir liste factures `/app/factures` | ✓ | ✓ | ✓ | ✓ (filtré sur ses leads convertis) | ✓ (filtré sur ses sessions) | ✓ (read all) |
| Voir fiche facture `/app/factures/[id]` | ✓ | ✓ | ✓ | ✓ (si owner du lead origine) | ✓ (si formateur de la session) | ✓ |
| `createInvoiceFromParticipant` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `createInvoiceForSponsorGroup` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `recordInvoicePayment` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `createCreditNote` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `sendInvoiceReminder` (manual) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `sendInvoiceReminder` (cron) | n/a (worker système) | | | | | |
| Route API `/api/factures/export` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `updateInvoiceReminderSettings` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

Sidebar `nav-config.ts` Phase 8 : `Factures` est déjà `allowedRoles: ['ADMIN', 'MANAGER', 'COMPTABLE', 'LECTEUR']` (FORMATEUR et COMMERCIAL filtrés). Le filtrage par owner/session pour COMMERCIAL/FORMATEUR est applicatif (filtre WHERE dans `getInvoicesListData`), pas via sidebar.

## AuditLog Events

Convention `entity='Invoice'`, helper `logInvoiceEvent`.

| Action | Déclencheur | actorUserId | targetInvoiceId | Payload (diff) |
|--------|-------------|-------------|-----------------|----------------|
| `invoices.created` | `createInvoiceFromParticipant` / `createInvoiceForSponsorGroup` | `user.id` | new invoice.id | `{ amountHt, amountTtc, participantId or sponsorOrgId+participantIds, sessionId }` |
| `invoices.issued` | idem (création passe direct ISSUED) | `user.id` | invoice.id | `{ status: { before: 'DRAFT', after: 'ISSUED' } }` — émis en même temps que `created` |
| `invoices.payment_recorded` | `recordInvoicePayment` | `user.id` | invoice.id | `{ amount, method, receivedAt, fullyPaid: boolean, newStatus }` |
| `invoices.credit_note_created` | `createCreditNote` | `user.id` | creditNote.id (nouveau) | `{ originalInvoiceId, amountHtCredited, motif, originalStatusBefore, originalStatusAfter }` |
| `invoices.reminder_sent` | `sendInvoiceReminder` (cron OR manual) | `user.id` ou `null` (cron) | invoice.id | `{ level: 1\|2, channel: 'email', triggered_by: 'cron'\|'manual', dryRun: boolean, daysOverdue }` |
| `invoices.exported` | Route `/api/factures/export` | `user.id` | `'BULK'` (constante) | `{ from, to, count }` |

**Lecture côté `/app/parametres/historique` (Phase 8 D-09)** : `buildAuditWhere` filtre par `entity='Invoice' AND action LIKE 'invoices.%'`. Pas de modification requise — pattern auto-extensible.

## Runtime State Inventory

| Catégorie | Items trouvés | Action requise |
|-----------|---------------|----------------|
| **Stored data** | `Invoice` rows existantes : `lastReminderAt=null` + `reminderCount=0` (defaults migration) ; aucune relance jamais envoyée jusqu'ici → le worker traitera toutes les factures impayées au premier démarrage ⚠️ | Plan doit prévoir un **flag de démarrage progressif** OU un script de seed `reminderCount = invoiceReminderDays.length` pour les factures déjà OVERDUE depuis > 60 jours (sinon Laurent reçoit potentiellement N relances envoyées en bulk au premier `pnpm worker:reminders` en prod). |
| **Live service config** | BullMQ Redis stocke les repeatable jobs persistants. Si on relance `scheduleDailyReminders()` plusieurs fois, BullMQ dédoublonne par `jobId='daily-reminders-cron'`. ✓ | Aucune. Idempotence native BullMQ. |
| **OS-registered state** | Aucun. Worker tourne via `concurrently` ou (en prod) systemd/pm2 ; pas de Task Scheduler Windows à enregistrer. | None — verified by le script `dev:full` et l'absence de Dockerfile/systemd unit dans le repo. |
| **Secrets/env vars** | `REDIS_URL` (existant Phase 2.2), `SMTP_*` (existant Phase 7), `APP_URL` (existant Phase 9). Pas de nouvelle env var. | None — verified par `.env.example`. |
| **Build artifacts** | Aucun build artefact ne contient des références à `invoiceReminderDays` (champ Tenant). Migration Prisma additive → `pnpm db:generate` régénère `@prisma/client` automatiquement. ⚠️ Si Tenant a un cache hot dans `.next/`, il faut `rm -rf .next` (déjà fait par `dev:full`). | Plan doit lister `pnpm db:generate` + `rm -rf .next` (déjà géré). |

**Risque opérationnel principal** : premier démarrage worker sans seed → cascade d'emails. **Recommandation Plan** : démarrage worker en mode "dry-run" (logger uniquement) sur 24h après livraison, vérification logs, puis bascule SMTP. **Alternative plus propre** : seed migration `UPDATE "Invoice" SET "reminderCount" = X WHERE ...` pour shadow les factures historiques au-delà de N jours.

## Validation Architecture (Nyquist Dimension 8)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (`apps/web/vitest.config.ts` : `environment: 'node'`) |
| Config file | `apps/web/vitest.config.ts` (existant) |
| Quick run command | `pnpm --filter @qualiof/web test -- --run path/to/file.test.ts` |
| Full suite command | `pnpm --filter @qualiof/web test` |

**Stratégie source-regex** (D-Phase9-N) : pas de `@testing-library/react`, pas de jsdom. Les tests UI lisent le fichier source en string et appliquent des regex sur le code (`fs.readFileSync` + `expect(src).toMatch(/...regex.../)`) pour valider la présence de props, imports, anti-régressions. Tests métier (helpers purs, server actions, templates email) en isolation avec mocks Prisma vi.fn().

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| **FACT-01** | `createInvoiceFromParticipant` emit `logInvoiceEvent('invoices.created'+'invoices.issued')` | unit | `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/invoices.audit.test.ts` | ❌ Wave 0 |
| **FACT-01** | `recordInvoicePayment` emit `logInvoiceEvent('invoices.payment_recorded')` avec diff fullyPaid | unit | idem | ❌ Wave 0 |
| **FACT-01** | Page `/app/factures` source contient `<InvoicesPrioCards>` + `<InvoicesFilters>` + `<InvoicesListTable>` (anti-régression source-regex) | smoke | `pnpm ... --run src/app/app/factures/__tests__/page.smoke.test.ts` | ❌ Wave 0 |
| **FACT-02** | `getNextCreditNoteNumber` : pas d'avoir → `AVO-000001` ; existant `AVO-000041` → `AVO-000042` ; préfixe custom ; null → fallback `AVO` ; respect du tx | unit | `pnpm ... --run src/lib/__tests__/numbering.credit-note.test.ts` | ❌ Wave 0 |
| **FACT-02** | `createCreditNote` : avoir total → facture origine `CANCELLED` ; avoir partiel → facture origine inchangée ; AuditLog `invoices.credit_note_created` | unit | `pnpm ... --run src/server/actions/__tests__/credit-note.test.ts` | ❌ Wave 0 |
| **FACT-02** | Migration `phase11_invoices_credit_notes_and_reminders` ajoute les 5 colonnes + self-FK | manuel (review SQL) | `cat packages/db/prisma/migrations/*phase11*/migration.sql` | ❌ Wave 0 |
| **FACT-02** | Template PDF avoir : header "AVOIR" affiché si `documentKind='AVOIR'` ; mention `Avoir sur facture {originalNumber}` | unit | `pnpm ... --run src/lib/__tests__/invoice-template.credit-note.test.ts` | ❌ Wave 0 |
| **FACT-03** | `renderInvoiceReminderEmail` : level 1 → subject contient "Rappel" ; level 2 → subject contient "Mise en demeure" + daysOverdue | unit | `pnpm ... --run src/lib/mailer-templates/__tests__/invoice-reminder.test.ts` | ❌ Wave 0 |
| **FACT-03** | `sendInvoiceReminder` : skip si `status === 'PAID'` ; skip si `lastReminderAt > now - 24h` ; increment `reminderCount` ; AuditLog `invoices.reminder_sent` ; dry-run quand SMTP_HOST vide | unit + integration | `pnpm ... --run src/server/actions/__tests__/send-reminder.test.ts` | ❌ Wave 0 |
| **FACT-03** | Worker `processReminderJob` : scan `status ∈ {ISSUED, PARTIAL, OVERDUE}` ET `dueDate ≤ now - tenant.invoiceReminderDays[0]` ; pour chaque appelle `sendInvoiceReminder({ triggered_by: 'cron' })` | unit (mock Prisma) | `pnpm ... --run src/lib/invoice-reminders/__tests__/worker.test.ts` | ❌ Wave 0 |
| **FACT-03** | Zod `InvoiceReminderSettingsSchema` : refuse `[45, 30]` (non croissant) ; refuse `[]` ; refuse `[30, 45, 60, 90]` (max 3) | unit | `pnpm --filter @qualiof/shared test -- --run src/schemas/__tests__/invoice.test.ts` | ❌ Wave 0 (côté shared) |
| **FACT-04** | Route `/api/factures/export` : RBAC 403 pour COMMERCIAL/FORMATEUR ; 401 sans session ; 200 + Content-Type xlsx + filename pattern | smoke (route) | `pnpm ... --run src/app/api/factures/export/__tests__/route.test.ts` | ❌ Wave 0 |
| **FACT-04** | Export contient 12 colonnes ; avoirs lignés avec Type='AVO' + amountHT négatif | unit (helper export builder extraction) | `pnpm ... --run src/lib/__tests__/invoice-export-builder.test.ts` | ❌ Wave 0 |
| **FACT-04** | AuditLog `invoices.exported` créé après export OK | unit | (couvert par test route ci-dessus) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @qualiof/web test -- --run <file>` pour le fichier touché
- **Per wave merge:** `pnpm --filter @qualiof/web test && pnpm --filter @qualiof/shared test` (suite complète)
- **Phase gate:** suite complète + `pnpm --filter @qualiof/web typecheck` (tsc --noEmit) + `pnpm --filter @qualiof/web build` (next build) verts avant `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/web/src/server/actions/__tests__/invoices.audit.test.ts` — couvre FACT-01 (helper logInvoiceEvent câblé)
- [ ] `apps/web/src/server/actions/__tests__/credit-note.test.ts` — couvre FACT-02 (createCreditNote)
- [ ] `apps/web/src/server/actions/__tests__/send-reminder.test.ts` — couvre FACT-03 (sendInvoiceReminder)
- [ ] `apps/web/src/lib/__tests__/numbering.credit-note.test.ts` — couvre FACT-02 (getNextCreditNoteNumber)
- [ ] `apps/web/src/lib/__tests__/invoice-template.credit-note.test.ts` — couvre FACT-02 (template PDF AVOIR)
- [ ] `apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts` — couvre FACT-03 (2 niveaux)
- [ ] `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts` — couvre FACT-03 (worker logic)
- [ ] `apps/web/src/app/api/factures/export/__tests__/route.test.ts` — couvre FACT-04 (RBAC + headers)
- [ ] `apps/web/src/lib/__tests__/invoice-export-builder.test.ts` — couvre FACT-04 (12 colonnes + avoirs négatifs)
- [ ] `apps/web/src/app/app/factures/__tests__/page.smoke.test.ts` — anti-régression source-regex
- [ ] `packages/shared/src/schemas/__tests__/invoice.test.ts` — Zod schemas
- [ ] Pas de framework à installer (Vitest 2.1.8 déjà présent)

### Edge scenarios à couvrir

- Avoir total `amountHtToCredit === invoice.amountHT` → facture origine `CANCELLED`
- Avoir partiel `amountHtToCredit < invoice.amountHT` → facture origine inchangée, solde net = amountTTC - sum(avoirs)
- Avoir interdit si `status ∈ {DRAFT, CANCELLED, CREDIT_NOTE}` → return `{ ok: false, error: 'Avoir impossible sur facture brouillon/annulée/avoir' }`
- Relance auto-stop si Invoice passe `PAID` entre 2 ticks du worker
- Dry-run mailer sans `SMTP_HOST` → `sendInvoiceReminder` retourne `{ ok: true, dryRun: true }` + AuditLog quand même (avec `diff.dryRun: true`)
- Export période vide (`from > to`) → 400 ou 200 sheet vide ? **Décision recommandée : 200 + sheet avec headers uniquement** (cohérent avec qualiopi-bilan)
- Export RBAC denied : `COMMERCIAL`/`FORMATEUR` GET `/api/factures/export` → 403
- Tenant.invoiceReminderDays = `[45]` (1 seul délai) → niveau max = 1, worker stop après 1 relance
- Race condition `getNextCreditNoteNumber` : 2 transactions concurrentes → P2002 sur `Invoice.number` unique → la 2ème transaction est rollback, à retenter (BullMQ retry attempts:3 le couvre côté worker, côté UI on retourne `{ ok: false, error: 'Conflit numérotation, réessayez' }`)
- Avoir sur facture déjà partiellement avoirée → ⚠️ scope D-04 prévoit "partiel OU total" mais pas "plusieurs avoirs sur la même facture". **Décision recommandée Plan** : autoriser N avoirs partiels tant que `sum(amountHt avoirs) ≤ original.amountHT`, sinon refuser avec message clair.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Postgres 16 (Docker) | Tout | ✓ | 16 (assumé via docker-compose.yml) | — |
| Redis 7 (Docker) | Worker BullMQ relances + closure | ✓ | 7 (assumé) | Worker dégrade en no-op (try/catch + setInterval keepalive) ; UI ne dépend PAS de Redis (le bouton manuel `sendInvoiceReminder` n'utilise PAS BullMQ — c'est un appel direct sync de la server action). Donc relances manuelles OK même sans Redis. |
| SMTP serveur | Relances email | ✓ ou ✗ | (selon `.env`) | Dry-run automatique via `mailer.ts` (logs uniquement, pas d'envoi réel). Pattern Phase 7/8/9 — déjà testé. |
| Gotenberg (Chromium) | PDF avoir | ✓ | 8 (déjà utilisé par factures actuelles) | — |
| MinIO/S3 | Upload PDF avoir | ✓ | (DOCS_BUCKET déjà actif) | — |
| `xlsx` 0.20.3 | Export comptable | ✓ | 0.20.3 installé | — |
| `bullmq` 5.76.4 | Worker daily | ✓ | 5.76.4 installé | — |
| `ioredis` 5.10.1 | Worker daily | ✓ | 5.10.1 installé | — |
| `nodemailer` 8.0.7 | Relances email | ✓ | 8.0.7 installé | dry-run |
| `@radix-ui/react-dialog` | `CreateCreditNoteDialog` | ✓ | (déjà utilisé Phase 4/8/9) | — |
| `zod` 3.23.8 | Schemas validation | ✓ | 3.23.8 installé | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** SMTP server (dry-run via mailer pattern).

## Dependencies & Risks

### Risques identifiés

1. **🔴 Concurrence numérotation `AVO-`** (HIGH impact, LOW probabilité)
   - **Symptôme** : 2 admins créent un avoir simultanément → P2002 unique constraint violation sur `Invoice.number`.
   - **Mitigation** : 100% identique à `getNextInvoiceNumber` — `prisma.$transaction(tx => getNextCreditNoteNumber(tenantId, tx))`. Le SELECT FOR UPDATE implicite Postgres résout. Test `numbering.credit-note.test.ts:Test 5` (utilisation du tx).
   - **Détection** : monitoring AuditLog → si un user voit son `createCreditNote` échouer, il retry et c'est résolu.

2. **🟠 Premier démarrage worker en production** (HIGH impact, certainty si rien fait)
   - **Symptôme** : toutes les factures historiques `ISSUED`/`OVERDUE` non payées avec `lastReminderAt=null` deviennent éligibles le premier matin → potentiellement 100+ emails envoyés en 1 cron tick.
   - **Mitigation** : Plan doit prévoir EITHER (a) seed migration `UPDATE "Invoice" SET "reminderCount" = (SELECT array_length(...)) WHERE issueDate < now() - 90 days` pour shadow l'historique, OR (b) flag `MAIL_DRY_RUN=true` sur le premier démarrage (review logs), OR (c) clause WHERE `issueDate >= migrationDate` pour ne traiter QUE les factures futures.
   - **Décision recommandée Plan** : option (c) — ajouter une constante `REMINDER_START_DATE` (date de mise en service Phase 11) et filtrer le scan worker `where: { issueDate: { gte: REMINDER_START_DATE } }`. Simple, transparent, auditable.

3. **🟠 Worker BullMQ daily ne tourne pas en prod** (MEDIUM impact, MEDIUM probabilité)
   - **Symptôme** : Laurent oublie de lancer `pnpm worker:reminders` ou `concurrently` plante en silence → aucune relance jamais envoyée.
   - **Mitigation** : (a) intégrer au `dev:full` (cohérent dev) ; (b) en prod, recommander pm2/systemd avec auto-restart ; (c) ajouter un endpoint health-check `/api/health/reminders` qui vérifie `BullMQ.getJobs()` et alerte si pas de job exécuté depuis > 26h.
   - **Décision Plan** : (a) + (b) seulement Phase 11. Endpoint health-check = deferred Phase 14.

4. **🟡 Dry-run mailer caché** (LOW impact, MEDIUM probabilité)
   - **Symptôme** : Laurent croit avoir envoyé des relances mais `SMTP_HOST` était vide → aucun email reçu mais AuditLog dit "envoyé".
   - **Mitigation** : AuditLog `invoices.reminder_sent` doit avoir `diff.dryRun: boolean` explicite (déjà prévu §AuditLog Events). UI fiche facture : si dernière relance était dry-run, afficher badge "⚠️ Mode dry-run (SMTP non configuré)".

5. **🟡 Export gros volume** (LOW impact, LOW probabilité actuellement)
   - **Symptôme** : si Laurent exporte 10k+ factures, mémoire Node peut grimper.
   - **Mitigation** : Phase 11 n'optimise pas (volume actuel < 200/an). Si problème futur, basculer vers streaming xlsx (deferred).

6. **🟡 Avoirs multiples sur même facture** (open question)
   - **Symptôme** : D-04 dit "partiel OU total" mais ne précise pas si N avoirs partiels successifs sont OK.
   - **Mitigation** : refuser le second avoir si `sum(existing_credits) + new_credit > original.amountHT`. Décision à confirmer pendant le plan.

### Anti-régression checklist (avant phase gate)

- [ ] Suite complète Vitest verte (apps/web + packages/shared)
- [ ] `tsc --noEmit` clean
- [ ] `next build` OK (toutes routes compilent, factures + factures/[id] + parametres)
- [ ] `getNextInvoiceNumber` test inchangé (régression Phase 7 surveillance)
- [ ] `recordInvoicePayment` test toujours vert (le call à `logInvoiceEvent` ne casse pas la transaction)
- [ ] AuditLog historique reste lisible côté UI Phase 8 `/app/parametres/historique` (filtre 'parameters.%' + 'users.%' + 'leads.%' + 'documents.%' + nouveau 'invoices.%')
- [ ] Worker closure (Pack fin de formation) toujours fonctionnel après ajout worker reminders (concurrently `-k` ne kill pas le bon)
- [ ] `pnpm dev:full` démarre 3 process sans crash

## Open Questions

1. **Avoirs multiples sur la même facture autorisés ?**
   - Ce qu'on sait : D-04 dit "partiel OU total", silencieux sur N avoirs.
   - Ce qui est flou : 1 facture peut-elle avoir 2 avoirs partiels ?
   - Recommandation Plan : autoriser tant que `sum(avoirs) ≤ original.amountHT`, à confirmer avec Laurent. **Coût additionnel : 0** (la contrainte se code en 3 lignes dans `createCreditNote`).

2. **Refresh PDF facture origine après avoir total ?**
   - Ce qu'on sait : facture origine passe `CANCELLED`. Son PDF (en MinIO) reste celui d'avant (status `ISSUED`).
   - Ce qui est flou : régénère-t-on le PDF avec un overlay "ANNULÉE" ? Ou on garde le PDF original et l'UI affiche le statut CANCELLED en pastille ?
   - Recommandation Plan : **garder le PDF original intact** (cohérent légalement — la facture a été émise) + ajouter un overlay HTML "Annulée par avoir AVO-NNNNNN" SEULEMENT dans le rendu UI fiche facture, pas dans le PDF. Si Laurent veut un PDF biffé, deferred.

3. **`tenantReminderDays` lecture côté worker : 1 fois ou à chaque tick ?**
   - Ce qu'on sait : Le worker scan tous les Invoice du tenant. Le délai vient du Tenant.
   - Ce qui est flou : un même worker peut servir N tenants (multi-tenant). Doit-il lire `invoiceReminderDays` par tenant à chaque tick ?
   - Recommandation Plan : oui, lire par tenant à chaque tick (1 query Tenant supplémentaire, négligeable). Cohérent multi-tenant Phase 7.

4. **Numéro AVO partagé entre tenants ?**
   - Ce qu'on sait : `Invoice.number` est `@unique` GLOBAL (pas `@@unique([tenantId, number])`). Pattern hérité.
   - Ce qui est flou : 2 tenants pourraient-ils avoir tous les deux un `AVO-000001` ? L'unicité globale empêche.
   - Recommandation Plan : aucune migration unicité requise. La séquence est calculée par tenant via le `WHERE tenantId` dans `findFirst`, MAIS l'index unique global garantit la non-collision même si 2 tenants démarrent à 1. Pattern existant identique pour `FAC-`.

5. **Email payeur : où le récupérer ?**
   - Ce qu'on sait : `Invoice.payerOrg.email` ou `Invoice.payerOrg.emailBilling` (déjà utilisé dans création facture). Cas facture sans payerOrg ? On regarde `Invoice.participant.person.email`.
   - Recommandation Plan : `sendInvoiceReminder` doit avoir une fn helper `getReminderRecipientEmail(invoice)` qui retourne `payerOrg.emailBilling ?? payerOrg.email ?? participant.person.email`. Si tout est null → `{ ok: false, error: 'Aucun email payeur configuré' }` + AuditLog quand même pour traçabilité.

6. **Le bouton manuel "Envoyer relance maintenant" respecte-t-il l'idempotence 24h ?**
   - Ce qu'on sait : D-09 dit "peut être déclenché à tout moment et incrémente le compteur".
   - Ce qui est flou : si Laurent clique 2x dans la même heure, on envoie 2 emails ?
   - Recommandation Plan : **côté cron, idempotence 24h. Côté manual, pas d'idempotence — confiance utilisateur** (Laurent sait pourquoi il clique). Mais on ajoute une `AlertDialog` de confirmation client : "Dernière relance envoyée le {date}, envoyer une nouvelle relance ?". Décision à confirmer.

## Sources

### Primary (HIGH confidence)
- `packages/db/prisma/schema.prisma` L24-52 (Tenant), L727-785 (Invoice + InvoicePayment + enum) — source de vérité schéma BDD
- `apps/web/src/server/actions/invoices.ts` 388 lignes — 3 actions existantes
- `apps/web/src/lib/numbering.ts` 53 lignes — pattern numérotation atomique
- `apps/web/src/lib/closure/queue.ts` + `redis.ts` + `worker.ts` — pattern BullMQ
- `apps/web/scripts/closure-worker.ts` 24 lignes — pattern entry-point worker
- `apps/web/src/lib/mailer.ts` 98 lignes — abstraction nodemailer + dry-run
- `apps/web/src/lib/mailer-templates/lead-assigned.ts` 122 lignes — pattern email Phase 9
- `apps/web/src/lib/audit-log.ts` 147 lignes — pattern logXxxEvent
- `apps/web/src/lib/rbac.ts` 94 lignes — pattern requireRole
- `apps/web/src/app/api/qualiopi-bilan/export/route.ts` 127 lignes — pattern xlsx route
- `apps/web/src/components/invoices/record-payment-form.tsx` 143 lignes — pattern Dialog inline
- `apps/web/src/lib/invoice-template.ts` 236 lignes — template HTML PDF
- `apps/web/src/app/app/factures/[id]/page.tsx` 216 lignes — fiche facture existante
- `apps/web/src/app/app/leads/charge/page.tsx` (extrait L100-190) — pattern PrioCardLocal
- `apps/web/src/components/ui/filter-chips.tsx` — pattern FilterChips
- `apps/web/package.json` scripts (dev:full, worker:closure) — pattern concurrently
- `packages/db/prisma/migrations/20260516160839_phase09_distribution/migration.sql` — pattern migration additive
- `apps/web/src/lib/__tests__/numbering.test.ts` — pattern test source-regex avec mock Prisma
- `.planning/STATE.md` L40-50 — historique Phase 7/8/9 conventions AuditLog
- `.planning/REQUIREMENTS.md` L67-73 — FACT-01..04 description originale

### Secondary (MEDIUM confidence)
- `.planning/codebase/CONVENTIONS.md` — patterns Server Actions / AuditLog / Money / Tests
- BullMQ doc officielle (training pre-cutoff janvier 2026) : repeatable jobs avec `pattern` (cron) ET/OU `every` (ms), `jobId` pour idempotence inscription
- Postgres Int[] support natif Prisma 5.22 (vérifié dans schema.prisma L46 `notifyOnLead*` mais pas exact array — toutefois `Int[]` est listé dans Prisma docs comme supporté)

### Tertiary (LOW confidence)
- Convention CGI art. 289 et CGI art. 261 4-4°a (mention "TVA non applicable") : référence légale française pour les avoirs et l'exonération TVA formation pro. Documenté dans `invoice-template.ts` L205-209.

## Metadata

**Confidence breakdown:**
- **Standard Stack** : HIGH — toutes les dépendances sont déjà installées et testées en Phases 7-9.1, vérifiées dans `package.json` et code existant.
- **Architecture Patterns** : HIGH — pattern BullMQ daily éprouvé sur closure worker (concurrency=3, repeatable jobs, Redis singleton), pattern mailer dry-run testé Phases 8/9, pattern AuditLog `logXxxEvent` 3ème instance (parameters/users/leads → invoices).
- **Pitfalls** : HIGH — race condition numérotation déjà mitigée Phase 7 (test 5 numbering.test.ts), dry-run mailer testé Phases 7/8/9, idempotence BullMQ via `jobId` est natif.
- **Premier démarrage worker** : MEDIUM — le risque opérationnel "cascade d'emails" est réel mais facilement mitigeable via filtre `issueDate ≥ MIGRATION_DATE`.

**Research date :** 2026-05-19
**Valid until :** 2026-06-19 (estimate 30 days — stack figée, dépendances stables, conventions internes documentées Phase 7-9.1)

## RESEARCH COMPLETE

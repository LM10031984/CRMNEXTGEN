---
phase: 11-factures-cycle-complet
plan: 00
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/db/prisma/schema.prisma
  - packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/migration.sql
  - apps/web/src/lib/__tests__/numbering.credit-note.test.ts
  - apps/web/src/lib/__tests__/invoice-audit.test.ts
  - apps/web/src/server/actions/__tests__/credit-note.test.ts
  - apps/web/src/server/actions/__tests__/send-reminder.test.ts
  - apps/web/src/server/actions/__tests__/invoices-export.test.ts
  - apps/web/src/server/actions/__tests__/invoices-list.test.ts
  - apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts
  - apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts
autonomous: true
requirements:
  - FACT-01
  - FACT-02
  - FACT-03
  - FACT-04
must_haves:
  truths:
    - "Migration Prisma additive ajoute 5 colonnes (Invoice +3, Tenant +2) + 2 index sans casser les rows existantes."
    - "8 fichiers tests stubs sont créés avec les behaviors documentés pour Wave 1-3."
  artifacts:
    - path: "packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/migration.sql"
      provides: "Schema BDD étendu : Invoice.originalInvoiceId + Invoice.lastReminderAt + Invoice.reminderCount + Tenant.creditNotePrefix + Tenant.invoiceReminderDays"
      contains: "ADD COLUMN \"originalInvoiceId\""
    - path: "packages/db/prisma/schema.prisma"
      provides: "Prisma schema mis à jour (extension model Invoice et Tenant)"
      contains: "originalInvoiceId"
    - path: "apps/web/src/lib/__tests__/numbering.credit-note.test.ts"
      provides: "Tests stubs Wave 1 numbering (séquence AVO-)"
    - path: "apps/web/src/lib/__tests__/invoice-audit.test.ts"
      provides: "Tests stubs Wave 1 logInvoiceEvent (6 actions)"
  key_links:
    - from: "Plans Wave 1+"
      to: "8 fichiers tests stubs"
      via: "Vitest collect"
      pattern: "describe\\.skip|it\\.todo"
---

<objective>
Poser la fondation Phase 11 : (1) migration Prisma additive `phase11_invoices_credit_notes_and_reminders` (3 colonnes Invoice + 2 colonnes Tenant + 2 index + self-FK) + `prisma generate`, (2) créer les 8 fichiers tests stubs `describe.skip`/`it.todo` listés dans 11-VALIDATION.md pour que les plans Wave 1-3 puissent référencer leur fichier de test sans erreur.

Purpose: Sans cette wave, les tests référencés par les plans suivants ne compilent pas (manque schéma + fichiers). C'est la passe Nyquist Dimension 8.
Output: Migration SQL + schema.prisma mis à jour + 8 fichiers tests stubs scaffold.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@.planning/phases/11-factures-cycle-complet/11-VALIDATION.md
@packages/db/prisma/schema.prisma
@packages/db/prisma/migrations/20260516160839_phase09_distribution/migration.sql
@apps/web/src/lib/__tests__/numbering.test.ts

<interfaces>
<!-- Schéma cible (à appliquer dans schema.prisma) -->

```prisma
model Tenant {
  // ... champs existants ...
  invoicePrefix          String?   @default("FAC")
  creditNotePrefix       String?   @default("AVO")        // NEW Phase 11
  invoiceReminderDays    Int[]     @default([30, 45])     // NEW Phase 11
  iban                   String?
  // ...
}

model Invoice {
  id               String              @id @default(uuid())
  tenantId         String
  number           String              @unique
  status           InvoiceStatus       @default(DRAFT)
  // Phase 11 — Avoirs (D-01). Self-FK : un avoir pointe vers la facture annulée.
  originalInvoiceId String?
  originalInvoice   Invoice?           @relation("InvoiceToCreditNote", fields: [originalInvoiceId], references: [id], onDelete: SetNull)
  creditNotes       Invoice[]          @relation("InvoiceToCreditNote")
  // Phase 11 — Tracking relances (D-13b). Idempotence + auto-stop.
  lastReminderAt   DateTime?
  reminderCount    Int                 @default(0)
  // ... reste des champs existants ...
  @@index([tenantId, status])
  @@index([tenantId, issueDate])
  @@index([tenantId, status, lastReminderAt])               // NEW Phase 11
  @@index([originalInvoiceId])                              // NEW Phase 11
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1 : Migration Prisma additive + schema.prisma</name>
  <files>packages/db/prisma/schema.prisma, packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/migration.sql</files>
  <read_first>
    - packages/db/prisma/schema.prisma (état actuel Tenant L24-52 + Invoice L737-773 + enum InvoiceStatus L727-735)
    - packages/db/prisma/migrations/20260516160839_phase09_distribution/migration.sql (pattern migration additive Phase 9 : ADD COLUMN nullable + DEFAULT + index)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Schema Changes
  </read_first>
  <action>
1. Éditer `packages/db/prisma/schema.prisma` :
   - Dans `model Tenant`, après la ligne `invoicePrefix String? @default("FAC")`, ajouter :
     ```prisma
     creditNotePrefix       String?   @default("AVO")
     invoiceReminderDays    Int[]     @default([30, 45])
     ```
   - Dans `model Invoice`, après la ligne `status InvoiceStatus @default(DRAFT)`, ajouter :
     ```prisma
     originalInvoiceId String?
     originalInvoice   Invoice?  @relation("InvoiceToCreditNote", fields: [originalInvoiceId], references: [id], onDelete: SetNull)
     creditNotes       Invoice[] @relation("InvoiceToCreditNote")
     lastReminderAt    DateTime?
     reminderCount     Int       @default(0)
     ```
   - Dans `model Invoice`, ajouter à la fin des `@@index` :
     ```prisma
     @@index([tenantId, status, lastReminderAt])
     @@index([originalInvoiceId])
     ```

2. Créer le dossier `packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/` et fichier `migration.sql` avec EXACTEMENT ce contenu :
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

3. Exécuter `pnpm --filter @qualiof/db db:generate` (regénère `@prisma/client`).

4. Vérifier avec `pnpm --filter @qualiof/web typecheck` (tsc --noEmit) que la migration est cohérente.

NOTE : Convention française CGI art. 289 (avoirs séquence dédiée). `onDelete: SetNull` (pas Cascade) car un avoir reste juridiquement valable même si la facture origine est supprimée.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web typecheck && grep -q "originalInvoiceId" packages/db/prisma/schema.prisma && grep -q "creditNotePrefix" packages/db/prisma/schema.prisma && grep -q "invoiceReminderDays" packages/db/prisma/schema.prisma</automated>
  </verify>
  <acceptance_criteria>
    - `packages/db/prisma/schema.prisma` contient `originalInvoiceId String?` dans `model Invoice` (grep)
    - `packages/db/prisma/schema.prisma` contient `creditNotePrefix String? @default("AVO")` dans `model Tenant` (grep)
    - `packages/db/prisma/schema.prisma` contient `invoiceReminderDays Int[] @default([30, 45])` (grep)
    - `packages/db/prisma/schema.prisma` contient `@@index([tenantId, status, lastReminderAt])` (grep)
    - `packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/migration.sql` existe avec les 5 ADD COLUMN + 1 ADD CONSTRAINT + 2 CREATE INDEX (grep `ADD COLUMN "originalInvoiceId"`)
    - `pnpm --filter @qualiof/web typecheck` exit 0
  </acceptance_criteria>
  <done>Migration additive en place, schema.prisma synchronisé, `@prisma/client` régénéré, typecheck vert. Aucune row existante cassée (defaults sur toutes les colonnes ajoutées NOT NULL).</done>
</task>

<task type="auto">
  <name>Task 2 : 8 fichiers tests stubs scaffolds (Wave 0 Nyquist Dimension 8)</name>
  <files>
    apps/web/src/lib/__tests__/numbering.credit-note.test.ts,
    apps/web/src/lib/__tests__/invoice-audit.test.ts,
    apps/web/src/server/actions/__tests__/credit-note.test.ts,
    apps/web/src/server/actions/__tests__/send-reminder.test.ts,
    apps/web/src/server/actions/__tests__/invoices-export.test.ts,
    apps/web/src/server/actions/__tests__/invoices-list.test.ts,
    apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts,
    apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts
  </files>
  <read_first>
    - apps/web/src/lib/__tests__/numbering.test.ts (pattern source-regex avec mock Prisma — D-Phase9-N)
    - apps/web/src/lib/mailer-templates/__tests__ (si existe) ou apps/web/src/lib/mailer-templates/lead-assigned.ts (pattern Phase 9)
    - .planning/phases/11-factures-cycle-complet/11-VALIDATION.md §Wave 0 Requirements (liste exhaustive des 8 fichiers)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Wave 0 Gaps + §Validation Architecture (test names attendus par plan)
  </read_first>
  <action>
Créer les 8 fichiers tests stubs suivants. Chaque fichier doit :
1. Compiler (TypeScript valide)
2. Être collecté par Vitest sans throw
3. Marquer les tests prévus comme `it.todo('...')` ou `describe.skip(...)`
4. Inclure un commentaire `// Wave 0 stub — Phase 11 — implemented in Plan {NN}`

**Fichier 1 : `apps/web/src/lib/__tests__/numbering.credit-note.test.ts`**
```typescript
// Wave 0 stub — Phase 11 — implemented in Plan 11-01
import { describe, it } from 'vitest';

describe('getNextCreditNoteNumber', () => {
  it.todo('returns AVO-000001 quand aucun avoir existe');
  it.todo('returns AVO-000042 quand dernier avoir est AVO-000041');
  it.todo('respecte le préfixe custom tenant.creditNotePrefix');
  it.todo('fallback AVO si tenant.creditNotePrefix null');
  it.todo('utilise le tx Prisma quand fourni (atomicité)');
  it.todo('filtre uniquement les Invoice avec number startsWith AVO- (n\'inclut pas les FAC-)');
});
```

**Fichier 2 : `apps/web/src/lib/__tests__/invoice-audit.test.ts`**
```typescript
// Wave 0 stub — Phase 11 — implemented in Plan 11-02
import { describe, it } from 'vitest';

describe('logInvoiceEvent', () => {
  it.todo('crée une row AuditLog avec entity=Invoice');
  it.todo('accepte actorUserId null (system / cron worker)');
  it.todo('accepte les 6 actions namespacées : invoices.created / invoices.issued / invoices.payment_recorded / invoices.credit_note_created / invoices.reminder_sent / invoices.exported');
  it.todo('sérialise le diff en JSON (Record<string, unknown>)');
  it.todo('ne no-op PAS sur diff vide (cohérent D-Phase9-H)');
});
```

**Fichier 3 : `apps/web/src/server/actions/__tests__/credit-note.test.ts`**
```typescript
// Wave 0 stub — Phase 11 — implemented in Plan 11-05
import { describe, it } from 'vitest';

describe('createCreditNote', () => {
  it.todo('avoir total (amountHtToCredit === original.amountHt) → facture origine passe à CANCELLED');
  it.todo('avoir partiel (amountHtToCredit < original.amountHt) → facture origine inchangée');
  it.todo('refuse si status origine ∈ {DRAFT, CANCELLED, CREDIT_NOTE}');
  it.todo('refuse si amountHtToCredit > original.amountHt');
  it.todo('refuse si motif vide ou < 3 caractères (Zod)');
  it.todo('génère un AVO-NNNNNN via getNextCreditNoteNumber en transaction');
  it.todo('stocke amountHT et amountTTC NÉGATIFS côté BDD');
  it.todo('crée AuditLog invoices.credit_note_created avec diff {originalInvoiceId, amountHtCredited, motif}');
  it.todo('RBAC : COMMERCIAL → ForbiddenError; FORMATEUR → ForbiddenError');
  it.todo('RBAC : ADMIN/MANAGER/COMPTABLE → OK');
  it.todo('appelle revalidatePath(\'/app/factures\') et /app/factures/[originalId]');
});
```

**Fichier 4 : `apps/web/src/server/actions/__tests__/send-reminder.test.ts`**
```typescript
// Wave 0 stub — Phase 11 — implemented in Plan 11-06
import { describe, it } from 'vitest';

describe('sendInvoiceReminder', () => {
  it.todo('triggered_by=manual + RBAC COMMERCIAL → ForbiddenError');
  it.todo('triggered_by=cron → skip requireRole (worker système)');
  it.todo('skip auto si status=PAID (auto-stop D-13)');
  it.todo('skip auto si status=CANCELLED');
  it.todo('skip si lastReminderAt > now - 24h (idempotence cron D-13b)');
  it.todo('manual ignore l\'idempotence 24h (D-09 — confiance utilisateur)');
  it.todo('compute level = clamp(reminderCount + 1, 1, invoiceReminderDays.length)');
  it.todo('appelle sendMail + renderInvoiceReminderEmail avec input correct');
  it.todo('dry-run quand SMTP_HOST vide → AuditLog avec diff.dryRun=true');
  it.todo('update Invoice { lastReminderAt: now, reminderCount: { increment: 1 } }');
  it.todo('crée AuditLog invoices.reminder_sent avec diff {level, channel:email, triggered_by, dryRun, daysOverdue}');
  it.todo('retourne { ok: false, error: \'Aucun email payeur configuré\' } si tous emails null');
});
```

**Fichier 5 : `apps/web/src/server/actions/__tests__/invoices-export.test.ts`**
```typescript
// Wave 0 stub — Phase 11 — implemented in Plan 11-07
import { describe, it } from 'vitest';

describe('exportInvoicesXlsx (route /api/factures/export)', () => {
  it.todo('GET sans session → 401');
  it.todo('GET avec session COMMERCIAL → 403');
  it.todo('GET avec session FORMATEUR → 403');
  it.todo('GET avec session ADMIN → 200 + Content-Type xlsx');
  it.todo('GET avec session COMPTABLE → 200');
  it.todo('Content-Disposition contient filename=factures_YYYY-MM-DD_YYYY-MM-DD.xlsx');
  it.todo('Bad request (from > to ou format invalide) → 400');
  it.todo('Sheet contient 12 colonnes attendues : Date émission / Numéro / Type / Libellé / Payeur / SIRET / Montant HT / TVA / Montant TTC / Payé / Reste / Statut');
  it.todo('Avoirs (status=CREDIT_NOTE) lignes avec Type=AVO + amountHT négatif');
  it.todo('Crée AuditLog invoices.exported avec diff {from, to, count}');
  it.todo('Période vide (0 factures matchées) → 200 + sheet avec headers uniquement');
});
```

**Fichier 6 : `apps/web/src/server/actions/__tests__/invoices-list.test.ts`**
```typescript
// Wave 0 stub — Phase 11 — implemented in Plan 11-08
import { describe, it } from 'vitest';

describe('getInvoicesListData', () => {
  it.todo('calcul KPI caMois = sum(amountTTC) Invoice WHERE status ∈ {ISSUED,PAID,PARTIAL} AND issueDate dans mois courant');
  it.todo('calcul KPI impayesAmount + impayesCount = sum(amountTTC - amountPaid) Invoice WHERE status ∈ {ISSUED,PARTIAL,OVERDUE}');
  it.todo('calcul KPI dsoMoyen = avg(paidAt - issueDate) en jours sur les PAID du mois (null si aucune)');
  it.todo('calcul KPI aFacturerCount = count SessionParticipant enrollmentStatus=COMPLETED sans Invoice liée');
  it.todo('filtre statuses multiple');
  it.todo('filtre période from/to');
  it.todo('filtre payerOrgId');
  it.todo('filtre onlyUnpaid = ISSUED+PARTIAL+OVERDUE');
  it.todo('tri par défaut : issueDate DESC, number DESC');
  it.todo('pagination page/pageSize');
});
```

**Fichier 7 : `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts`**
```typescript
// Wave 0 stub — Phase 11 — implemented in Plan 11-06
import { describe, it } from 'vitest';

describe('invoice-reminder-worker', () => {
  it.todo('scan filtre status ∈ {ISSUED, PARTIAL, OVERDUE}');
  it.todo('filtre issueDate ≥ REMINDER_START_DATE (mitigation risque cascade R2)');
  it.todo('pour chaque tenant : lit Tenant.invoiceReminderDays par tick');
  it.todo('skip facture si reminderCount >= invoiceReminderDays.length');
  it.todo('skip facture si lastReminderAt > now - 24h');
  it.todo('appelle sendInvoiceReminder({ triggered_by: \'cron\' }) pour chaque facture éligible');
  it.todo('scheduleDailyReminders inscrit job repeatable jobId=daily-reminders-cron');
  it.todo('scheduleDailyReminders cron pattern \'0 8 * * *\' tz Europe/Paris');
  it.todo('try/catch Redis indisponible → log warn + keepalive (pas de crash)');
});
```

**Fichier 8 : `apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts`**
```typescript
// Wave 0 stub — Phase 11 — implemented in Plan 11-03
import { describe, it } from 'vitest';

describe('renderInvoiceReminderEmail', () => {
  it.todo('level=1 → subject contient \'Rappel\'');
  it.todo('level=1 → subject "Rappel — Facture {number} en attente" verbatim');
  it.todo('level=2 → subject contient \'Mise en demeure\' + daysOverdue');
  it.todo('level=2 → subject "Mise en demeure — Facture {number} impayée depuis {N} jours" verbatim');
  it.todo('text fallback contient invoiceNumber + amountTtc (Intl fr-FR) + dueDate (Intl fr-FR)');
  it.todo('html escape toutes les variables interpolées (Pitfall 6)');
  it.todo('level=2 inclut la mention légale art. L441-10 Code de commerce');
  it.todo('html inclut <a href> vers invoiceUrl');
  it.todo('html inclut of.name dans header + footer');
});
```

Créer le dossier `apps/web/src/lib/invoice-reminders/__tests__/` (sera utilisé Plan 11-06).
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run --reporter=default 2>&1 | grep -E "(numbering.credit-note|invoice-audit|credit-note|send-reminder|invoices-export|invoices-list|invoice-reminders/__tests__/worker|mailer-templates/__tests__/invoice-reminder)" | wc -l | grep -q "8\|[1-9][0-9]"</automated>
  </verify>
  <acceptance_criteria>
    - Les 8 fichiers existent (vérification par `ls`)
    - Chaque fichier contient l'en-tête `// Wave 0 stub — Phase 11 — implemented in Plan {NN}` (grep)
    - Chaque fichier compile TypeScript : `pnpm --filter @qualiof/web typecheck` exit 0
    - Vitest collecte les 8 fichiers sans erreur : `pnpm --filter @qualiof/web test -- --run` ne plante pas sur ces fichiers
    - `numbering.credit-note.test.ts` contient `it.todo('returns AVO-000001` (grep)
    - `invoice-audit.test.ts` contient les 6 actions namespacées (grep `invoices.created` + `invoices.exported`)
    - `credit-note.test.ts` contient `it.todo('avoir total` (grep)
    - `send-reminder.test.ts` contient `it.todo('skip auto si status=PAID` (grep)
    - `invoices-export.test.ts` contient `it.todo('Sheet contient 12 colonnes` (grep)
    - `invoices-list.test.ts` contient `it.todo('calcul KPI caMois` (grep)
    - `worker.test.ts` contient `it.todo('scheduleDailyReminders inscrit job repeatable` (grep)
    - `invoice-reminder.test.ts` (mailer-templates) contient `it.todo('level=1 → subject contient` (grep)
  </acceptance_criteria>
  <done>8 fichiers tests stubs créés, collectés par Vitest sans erreur, tous les behaviors documentés en `it.todo()`. Les plans Wave 1-3 peuvent maintenant pointer vers leur fichier de test dédié.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web typecheck` → exit 0
- `pnpm --filter @qualiof/web test -- --run` collecte tous les fichiers (les `it.todo` sont reportés comme TODO, pas comme fail)
- `ls packages/db/prisma/migrations/20260519120000_add_credit_notes_and_reminders/` → contient `migration.sql`
- `git diff packages/db/prisma/schema.prisma` montre +9 lignes (Tenant +2, Invoice +5, index +2)
</verification>

<success_criteria>
- Migration SQL valide (5 ADD COLUMN + 1 ADD CONSTRAINT + 2 CREATE INDEX)
- `schema.prisma` synchronisé avec la migration
- `@prisma/client` régénéré sans erreur (`pnpm --filter @qualiof/db db:generate`)
- 8 fichiers tests stubs créés, compilent, collectés par Vitest
- 0 régression : `pnpm --filter @qualiof/web test -- --run` ne fait pas échouer les tests existants Phase 7/8/9/9.1
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-00-SUMMARY.md`
</output>

---
phase: 11-factures-cycle-complet
plan: 05
type: execute
wave: 2
depends_on:
  - "11-01"
  - "11-02"
  - "11-04"
files_modified:
  - apps/web/src/server/actions/invoices.ts
  - apps/web/src/server/actions/__tests__/credit-note.test.ts
  - apps/web/src/lib/invoice-template.ts
  - apps/web/src/lib/__tests__/invoice-template.credit-note.test.ts
  - apps/web/src/components/invoices/create-credit-note-dialog.tsx
  - apps/web/src/components/invoices/__tests__/create-credit-note-dialog.test.ts
  - apps/web/src/app/app/factures/[id]/page.tsx
autonomous: true
requirements:
  - FACT-02
must_haves:
  truths:
    - "createCreditNote(originalInvoiceId, amountHtToCredit, motif) crée un Invoice status=CREDIT_NOTE avec originalInvoiceId."
    - "Avoir total (amountHtToCredit === original.amountHt) → facture origine passe à CANCELLED."
    - "Avoir partiel → facture origine reste inchangée mais N avoirs partiels autorisés tant que sum(avoirs) ≤ original.amountHt."
    - "AuditLog invoices.credit_note_created créé via logInvoiceEvent."
    - "RBAC ADMIN+MANAGER+COMPTABLE (D-19)."
    - "Template PDF invoice-template.ts étendu : mode AVOIR (header 'AVOIR' + mention 'Avoir sur facture {originalNumber}')."
  artifacts:
    - path: "apps/web/src/server/actions/invoices.ts"
      provides: "Extension avec createCreditNote (D-03 + D-04)"
      exports: ["createInvoiceFromParticipant", "createInvoiceForSponsorGroup", "recordInvoicePayment", "createCreditNote"]
    - path: "apps/web/src/lib/invoice-template.ts"
      provides: "renderInvoiceHtml étendu avec documentKind: 'FACTURE' | 'AVOIR' (default 'FACTURE')"
    - path: "apps/web/src/components/invoices/create-credit-note-dialog.tsx"
      provides: "Radix Dialog Client Component (pattern Phase 9 reassign-lead-button) + RHF zodResolver"
  key_links:
    - from: "Bouton CTA fiche facture /app/factures/[id]"
      to: "createCreditNote server action"
      via: "<CreateCreditNoteDialog /> wrapping Radix Dialog"
      pattern: "createCreditNote\\("
    - from: "createCreditNote"
      to: "getNextCreditNoteNumber + logInvoiceEvent + renderInvoiceHtml(documentKind:'AVOIR')"
      via: "import depuis lib"
      pattern: "getNextCreditNoteNumber|logInvoiceEvent|documentKind"
---

<objective>
Implémenter la création d'avoir (D-01..D-04). Server action `createCreditNote` + Radix Dialog client (clone pattern Phase 9 `ReassignLeadButton` via `@radix-ui/react-dialog`) + bouton CTA sur fiche facture. Extension du template PDF `invoice-template.ts` pour mode AVOIR (header "AVOIR" + bandeau "Avoir sur facture {originalNumber}").

Purpose: Cycle complet avoirs (NCN au sens CGI art. 289). Sans cette fonctionnalité, le module factures reste incomplet (FACT-02 non couvert).
Output: 1 nouvelle server action + 1 dialog client + extension template PDF + extension fiche facture + 4 suites Vitest vertes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@apps/web/src/server/actions/invoices.ts
@apps/web/src/lib/numbering.ts
@apps/web/src/lib/invoice-audit.ts
@apps/web/src/lib/invoice-template.ts
@apps/web/src/lib/rbac.ts
@apps/web/src/components/leads/reassign-lead-button.tsx
@apps/web/src/app/app/factures/[id]/page.tsx

<interfaces>
<!-- Signature server action (D-03 + D-04) -->

```typescript
export async function createCreditNote(input: {
  originalInvoiceId: string;
  amountHtToCredit: number;   // positif côté UI, converti en NÉGATIF côté BDD
  motif: string;              // textarea obligatoire, ≥3 chars (Zod)
}): Promise<{ ok: true; creditNoteId: string; number: string } | { ok: false; error: string }>;
// RBAC : ['ADMIN', 'MANAGER', 'COMPTABLE']
// AuditLog : invoices.credit_note_created
```

<!-- Helpers déjà disponibles (Wave 1) -->
- getNextCreditNoteNumber(tenantId, tx?) [Plan 11-01]
- logInvoiceEvent({ tenantId, actorUserId, targetInvoiceId, action, diff? }) [Plan 11-02]
- CreateCreditNoteSchema (Zod) [Plan 11-04]

<!-- Composant client (Radix Dialog pattern Phase 9) -->
```typescript
interface Props {
  originalInvoiceId: string;
  originalAmountHt: number;     // affiché en aide (max autorisé)
  originalNumber: string;
}
export function CreateCreditNoteDialog(props: Props): JSX.Element;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Extension invoice-template.ts (mode AVOIR)</name>
  <files>apps/web/src/lib/invoice-template.ts, apps/web/src/lib/__tests__/invoice-template.credit-note.test.ts</files>
  <read_first>
    - apps/web/src/lib/invoice-template.ts (état actuel — 236 lignes, header "FACTURE" hardcodé L117 — à étendre)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §invoice-template.ts (extension à appliquer)
  </read_first>
  <behavior>
    - Test 1 : `renderInvoiceHtml(data)` sans `documentKind` → header `<h1>FACTURE</h1>` (rétrocompat)
    - Test 2 : `renderInvoiceHtml({ ...data, documentKind: 'FACTURE' })` → header `<h1>FACTURE</h1>`
    - Test 3 : `renderInvoiceHtml({ ...data, documentKind: 'AVOIR', originalNumber: 'FAC-000042', originalIssueDate })` → header `<h1>AVOIR</h1>`
    - Test 4 : Mode AVOIR contient mention `"Avoir sur facture FAC-000042"` (grep dans le HTML retourné)
    - Test 5 : Mode AVOIR contient la date d'émission de la facture originale formattée fr-FR
  </behavior>
  <action>
1. Étendre l'interface `InvoiceData` dans `apps/web/src/lib/invoice-template.ts` :

```typescript
export interface InvoiceData {
  // ... champs existants ...
  documentKind?: 'FACTURE' | 'AVOIR';   // NEW Phase 11 — default 'FACTURE'
  originalNumber?: string;               // NEW Phase 11 — uniquement si AVOIR
  originalIssueDate?: Date;              // NEW Phase 11 — uniquement si AVOIR
}
```

2. Dans la fonction `renderInvoiceHtml(d)`, remplacer la ligne du header :
   - AVANT (L117 approximatif) : `<h1>FACTURE</h1>`
   - APRÈS :
     ```typescript
     const docKind = d.documentKind ?? 'FACTURE';
     const headerTitle = docKind === 'AVOIR' ? 'AVOIR' : 'FACTURE';
     // ... dans le template HTML :
     `<h1>${headerTitle}</h1>`
     ```

3. Ajouter un bandeau (juste après le header, avant la section légale-mentions) :
   ```typescript
   const avoirMention = docKind === 'AVOIR' && d.originalNumber
     ? `<div class="avoir-mention" style="background:#FEF3C7;border:1px solid #FCD34D;padding:12px;margin:16px 0;border-radius:4px;color:#78350F;">
          <strong>Avoir sur facture ${escapeHtml(d.originalNumber)}</strong>
          ${d.originalIssueDate ? ` émise le ${new Intl.DateTimeFormat('fr-FR').format(d.originalIssueDate)}` : ''}
        </div>`
     : '';
   ```
   Et l'insérer dans le HTML retourné.

4. Créer `apps/web/src/lib/__tests__/invoice-template.credit-note.test.ts` avec 5 tests source-regex (cf behavior).

5. Lancer : `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-template.credit-note.test.ts` → 5 verts + suite existante invoice-template inchangée.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-template.credit-note.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/lib/invoice-template.ts` interface `InvoiceData` contient `documentKind?: 'FACTURE' | 'AVOIR'` (grep)
    - Contient `originalNumber?: string` et `originalIssueDate?: Date` (grep)
    - Contient le bandeau `"Avoir sur facture"` (grep)
    - Anti-régression : tests existants `invoice-template.test.ts` (si présent) toujours verts
    - 5/5 tests credit-note verts
  </acceptance_criteria>
  <done>Template PDF étend le mode AVOIR sans casser le mode FACTURE existant.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 : Server action createCreditNote + tests</name>
  <files>apps/web/src/server/actions/invoices.ts, apps/web/src/server/actions/__tests__/credit-note.test.ts</files>
  <read_first>
    - apps/web/src/server/actions/invoices.ts (3 actions existantes — pattern transactional + uploadFile + Document.create + revalidatePath)
    - apps/web/src/lib/numbering.ts (getNextCreditNoteNumber Plan 11-01)
    - apps/web/src/lib/invoice-audit.ts (logInvoiceEvent Plan 11-02)
    - apps/web/src/server/actions/__tests__/credit-note.test.ts (stub Wave 0 — 11 it.todo à remplir)
    - packages/shared/src/schemas/invoice.ts (CreateCreditNoteSchema Plan 11-04)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Numérotation Avoirs + §Server Actions Inventory L562-575
  </read_first>
  <behavior>
    - Test 1 : RBAC COMMERCIAL → `{ ok: false, error: 'Forbidden' }`
    - Test 2 : RBAC FORMATEUR → `{ ok: false, error: 'Forbidden' }`
    - Test 3 : RBAC ADMIN → OK
    - Test 4 : RBAC MANAGER → OK
    - Test 5 : RBAC COMPTABLE → OK
    - Test 6 : Zod : motif vide → `{ ok: false, error: <message> }`
    - Test 7 : Zod : amountHtToCredit négatif → erreur
    - Test 8 : Facture origine status=DRAFT → `{ ok: false, error: 'Avoir impossible sur facture brouillon/annulée/avoir' }`
    - Test 9 : Avoir total (amountHtToCredit === original.amountHt) → facture origine update status='CANCELLED'
    - Test 10 : Avoir partiel (amountHtToCredit < original.amountHt) → facture origine inchangée
    - Test 11 : amountHtToCredit > original.amountHt → `{ ok: false, error: <message> }`
    - Test 12 : N avoirs partiels : refuse si `sum(existing AVO amounts) + new > original.amountHt`
    - Test 13 : Stocke `amountHT` et `amountTTC` négatifs côté BDD (vérifier via spy invoice.create)
    - Test 14 : AuditLog `invoices.credit_note_created` créé avec diff `{originalInvoiceId, amountHtCredited, motif, originalStatusBefore, originalStatusAfter}`
    - Test 15 : revalidatePath('/app/factures') + revalidatePath(`/app/factures/${originalId}`) appelés
  </behavior>
  <action>
1. Étendre `apps/web/src/server/actions/invoices.ts` avec l'action `createCreditNote` (à AJOUTER à la fin du fichier, NE PAS modifier les 3 actions existantes sauf si Plan 11-02 le requiert pour backfill — voir Task 3 du Plan 11-08) :

```typescript
import { CreateCreditNoteSchema } from '@qualiof/shared';
import { getNextCreditNoteNumber } from '@/lib/numbering';
import { logInvoiceEvent } from '@/lib/invoice-audit';
import { Prisma } from '@qualiof/db';

export async function createCreditNote(input: {
  originalInvoiceId: string;
  amountHtToCredit: number;
  motif: string;
}): Promise<
  | { ok: true; creditNoteId: string; number: string }
  | { ok: false; error: string }
> {
  // RBAC D-19
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMPTABLE']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  // Validation Zod
  const parsed = CreateCreditNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Validation échouée' };
  }
  const { originalInvoiceId, amountHtToCredit, motif } = parsed.data;

  // Lookup facture origine (scope tenant)
  const original = await prisma.invoice.findFirst({
    where: { id: originalInvoiceId, tenantId: user.tenantId },
    select: {
      id: true,
      number: true,
      status: true,
      amountHT: true,
      amountTTC: true,
      vatRate: true,
      participantId: true,
      payerOrgId: true,
      sessionId: true,
      issueDate: true,
    },
  });
  if (!original) return { ok: false, error: 'Facture introuvable' };

  // D-03 : statuts éligibles
  if (!['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'].includes(original.status)) {
    return { ok: false, error: 'Avoir impossible sur facture brouillon/annulée/avoir' };
  }

  const originalHt = Number(original.amountHT);
  if (amountHtToCredit > originalHt) {
    return {
      ok: false,
      error: `Le montant à créditer (${amountHtToCredit} €) dépasse le montant de la facture (${originalHt} €).`,
    };
  }

  // Open Question 1 : autoriser N avoirs partiels tant que sum ≤ original.amountHt
  const existingCreditNotes = await prisma.invoice.findMany({
    where: { originalInvoiceId, tenantId: user.tenantId, status: 'CREDIT_NOTE' },
    select: { amountHT: true },
  });
  // Avoirs stockés en négatif → Math.abs pour somme
  const alreadyCredited = existingCreditNotes.reduce(
    (sum, cn) => sum + Math.abs(Number(cn.amountHT)),
    0,
  );
  if (alreadyCredited + amountHtToCredit > originalHt) {
    return {
      ok: false,
      error: `Cette facture est déjà avoirée à hauteur de ${alreadyCredited} €. Reste créditable : ${originalHt - alreadyCredited} €.`,
    };
  }

  const isTotalCreditNote = alreadyCredited + amountHtToCredit === originalHt;
  const vatRateNum = Number(original.vatRate ?? 0);

  // Transaction atomique : (1) numérotation AVO, (2) create avoir, (3) update facture origine si total
  const result = await prisma.$transaction(async (tx) => {
    const number = await getNextCreditNoteNumber(user.tenantId, tx);

    const creditNote = await tx.invoice.create({
      data: {
        tenantId: user.tenantId,
        number,
        status: 'CREDIT_NOTE',
        originalInvoiceId: original.id,
        participantId: original.participantId,
        payerOrgId: original.payerOrgId,
        sessionId: original.sessionId,
        amountHT: new Prisma.Decimal(-Math.abs(amountHtToCredit)),
        vatRate: original.vatRate,
        amountTTC: new Prisma.Decimal(-Math.abs(amountHtToCredit * (1 + vatRateNum / 100))),
        issueDate: new Date(),
        notes: motif,
      },
    });

    let originalStatusAfter = original.status;
    if (isTotalCreditNote) {
      await tx.invoice.update({
        where: { id: original.id },
        data: { status: 'CANCELLED' },
      });
      originalStatusAfter = 'CANCELLED';
    }

    return { creditNote, originalStatusAfter };
  });

  // AuditLog (D-18)
  await logInvoiceEvent({
    tenantId: user.tenantId,
    actorUserId: user.id,
    targetInvoiceId: result.creditNote.id,
    action: 'invoices.credit_note_created',
    diff: {
      originalInvoiceId: original.id,
      originalNumber: original.number,
      amountHtCredited: amountHtToCredit,
      motif,
      originalStatusBefore: original.status,
      originalStatusAfter: result.originalStatusAfter,
    },
  });

  // Revalidate (D-07 cross-nav)
  revalidatePath('/app/factures');
  revalidatePath(`/app/factures/${originalInvoiceId}`);
  revalidatePath(`/app/factures/${result.creditNote.id}`);

  return { ok: true, creditNoteId: result.creditNote.id, number: result.creditNote.number };
}
```

2. Remplacer `apps/web/src/server/actions/__tests__/credit-note.test.ts` (stub Wave 0) par la suite réelle 15 tests — clone-strict pattern Phase 9 `leads.test.ts` (mock requireRole, mock prisma.invoice.findFirst/findMany/create/update, mock prisma.$transaction, mock logInvoiceEvent, mock revalidatePath, mock getNextCreditNoteNumber).

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/credit-note.test.ts` → 15 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/credit-note.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/server/actions/invoices.ts` contient `export async function createCreditNote` (grep)
    - Appelle `requireRole(['ADMIN', 'MANAGER', 'COMPTABLE'])` (grep)
    - Appelle `CreateCreditNoteSchema.safeParse` (grep)
    - Appelle `getNextCreditNoteNumber(user.tenantId, tx)` dans une transaction (grep)
    - Appelle `logInvoiceEvent` avec action `'invoices.credit_note_created'` (grep)
    - Stocke `amountHT` et `amountTTC` NÉGATIFS (`-Math.abs(`) (grep)
    - Vérifie le statut origine ∈ {ISSUED, PAID, PARTIAL, OVERDUE} (grep)
    - Refuse N avoirs cumulés > original.amountHT (grep `alreadyCredited + amountHtToCredit > originalHt`)
    - 15/15 tests verts
    - Tests des 3 actions existantes inchangés (anti-régression Phase 7-02)
  </acceptance_criteria>
  <done>Server action complète, transactional, audit-loggée, RBAC. Avoir partiel et total fonctionnent. N avoirs cumulés autorisés tant que somme ≤ original.</done>
</task>

<task type="auto">
  <name>Task 3 : CreateCreditNoteDialog + intégration fiche facture</name>
  <files>apps/web/src/components/invoices/create-credit-note-dialog.tsx, apps/web/src/components/invoices/__tests__/create-credit-note-dialog.test.ts, apps/web/src/app/app/factures/[id]/page.tsx</files>
  <read_first>
    - apps/web/src/components/leads/reassign-lead-button.tsx (pattern Phase 9 D-Phase9-J : Radix Dialog via `@radix-ui/react-dialog` avec Dialog.Title + Dialog.Description + Dialog.Close — à cloner)
    - apps/web/src/app/app/factures/[id]/page.tsx (état actuel — 216 lignes — à enrichir avec CTA "Créer un avoir" + section avoirs liés + redirect status CREDIT_NOTE)
    - packages/shared/src/schemas/invoice.ts (CreateCreditNoteSchema Plan 11-04)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Page Liste UI Components + §Fiche détail extension
  </read_first>
  <action>
1. Créer `apps/web/src/components/invoices/create-credit-note-dialog.tsx` (Client Component, pattern Phase 9 `reassign-lead-button.tsx` à cloner) :

```typescript
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CreateCreditNoteSchema, type CreateCreditNoteInput } from '@qualiof/shared';
import { createCreditNote } from '@/server/actions/invoices';

interface Props {
  originalInvoiceId: string;
  originalAmountHt: number;
  originalNumber: string;
}

export function CreateCreditNoteDialog({ originalInvoiceId, originalAmountHt, originalNumber }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors }, reset } = useForm<CreateCreditNoteInput>({
    resolver: zodResolver(CreateCreditNoteSchema),
    defaultValues: { originalInvoiceId, amountHtToCredit: originalAmountHt, motif: '' },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const res = await createCreditNote(data);
      if (res.ok) {
        toast.success(`Avoir ${res.number} créé`);
        setOpen(false);
        reset();
      } else {
        toast.error(res.error);
      }
    });
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
        >
          Créer un avoir
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] rounded-lg bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Créer un avoir sur {originalNumber}</Dialog.Title>
          <Dialog.Description className="text-sm text-slate-600 mt-1">
            Montant maximum créditable : <strong>{originalAmountHt.toFixed(2)} €</strong> HT
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4 mt-4">
            <input type="hidden" {...register('originalInvoiceId')} />
            <div>
              <label className="block text-sm font-medium mb-1">Montant HT à créditer (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={originalAmountHt}
                {...register('amountHtToCredit', { valueAsNumber: true })}
                className="w-full rounded border border-slate-300 px-3 py-2"
                aria-invalid={!!errors.amountHtToCredit}
              />
              {errors.amountHtToCredit && (
                <p className="text-xs text-red-600 mt-1">{errors.amountHtToCredit.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Motif (obligatoire)</label>
              <textarea
                rows={3}
                {...register('motif')}
                className="w-full rounded border border-slate-300 px-3 py-2"
                placeholder="Ex : Erreur de facturation, geste commercial, annulation partielle…"
              />
              {errors.motif && <p className="text-xs text-red-600 mt-1">{errors.motif.message}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button type="button" className="rounded border border-slate-300 px-4 py-2 text-sm">Annuler</button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isPending}
                className="rounded bg-amber-600 text-white px-4 py-2 text-sm disabled:opacity-50"
              >
                {isPending ? 'Création…' : "Créer l'avoir"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

2. Éditer `apps/web/src/app/app/factures/[id]/page.tsx` :
   - Ajouter le bouton CTA `<CreateCreditNoteDialog>` (visible si `invoice.status ∈ {ISSUED, PAID, PARTIAL, OVERDUE}`)
   - Ajouter une section "Avoirs liés" si la facture en a (`invoice.creditNotes` via `include`) : liste avec lien vers chaque avoir, montant, motif
   - Si la facture EST elle-même un avoir (`status === 'CREDIT_NOTE'`) : afficher bandeau jaune avec lien `<Link href={\`/app/factures/${invoice.originalInvoice.id}\`}>← Voir la facture originale {invoice.originalInvoice.number}</Link>`

Code à insérer dans `/app/factures/[id]/page.tsx` (après le block existant, avant `<RecordPaymentForm>`) :

```typescript
{/* CTA "Créer un avoir" — D-03 */}
{['ISSUED', 'PAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
  <CreateCreditNoteDialog
    originalInvoiceId={invoice.id}
    originalAmountHt={Number(invoice.amountHT)}
    originalNumber={invoice.number}
  />
)}

{/* Section "Avoirs liés" — D-07 */}
{invoice.creditNotes && invoice.creditNotes.length > 0 && (
  <section className="mt-6">
    <h2 className="text-lg font-semibold">Avoirs liés</h2>
    <ul className="mt-2 space-y-1">
      {invoice.creditNotes.map((cn) => (
        <li key={cn.id}>
          <Link href={`/app/factures/${cn.id}`} className="text-primary-700 hover:underline">
            {cn.number}
          </Link>{' '}
          — {Math.abs(Number(cn.amountHT)).toFixed(2)} € HT
          {cn.notes && <span className="text-slate-500"> ({cn.notes})</span>}
        </li>
      ))}
    </ul>
  </section>
)}

{/* Header AVOIR avec lien retour facture originale — D-04 */}
{invoice.status === 'CREDIT_NOTE' && invoice.originalInvoice && (
  <div className="bg-amber-50 border border-amber-200 p-3 rounded mt-4">
    <Link
      href={`/app/factures/${invoice.originalInvoice.id}`}
      className="text-amber-900 hover:underline"
    >
      ← Voir la facture originale {invoice.originalInvoice.number}
    </Link>
  </div>
)}
```

Étendre la query Prisma existante pour inclure `creditNotes` (relation Phase 11) et `originalInvoice` :
```typescript
const invoice = await prisma.invoice.findFirst({
  where: { id, tenantId: user.tenantId },
  include: {
    // ... include existants ...
    creditNotes: { select: { id: true, number: true, amountHT: true, notes: true, issueDate: true } },
    originalInvoice: { select: { id: true, number: true } },
  },
});
```

3. Créer `apps/web/src/components/invoices/__tests__/create-credit-note-dialog.test.ts` (source-regex 6 tests) :
   - `'use client'` directive présente
   - Import `@radix-ui/react-dialog` (Pattern D-Phase9-J)
   - Import `CreateCreditNoteSchema` et `createCreditNote`
   - Contient `<Dialog.Title>`, `<Dialog.Description>`, `<Dialog.Close>`
   - Bouton trigger label = "Créer un avoir"
   - Bouton submit disabled si `isPending`

4. Lancer : `pnpm --filter @qualiof/web test -- --run src/components/invoices/__tests__/create-credit-note-dialog.test.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/components/invoices/__tests__/create-credit-note-dialog.test.ts && pnpm --filter @qualiof/web typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/components/invoices/create-credit-note-dialog.tsx` existe avec `'use client'` (grep)
    - Importe `@radix-ui/react-dialog` (grep `from '@radix-ui/react-dialog'`)
    - Importe `CreateCreditNoteSchema` depuis `@qualiof/shared` (grep)
    - Importe `createCreditNote` depuis `@/server/actions/invoices` (grep)
    - Contient `<Dialog.Title>` + `<Dialog.Description>` + `<Dialog.Close>` (grep)
    - Bouton trigger contient verbatim "Créer un avoir" (grep)
    - `apps/web/src/app/app/factures/[id]/page.tsx` contient `<CreateCreditNoteDialog` (grep)
    - Contient le rendu conditionnel par `invoice.status` ∈ ISSUED/PAID/PARTIAL/OVERDUE (grep)
    - Contient le bandeau `bg-amber-50` pour le lien retour vers facture originale (grep)
    - 6/6 tests verts
    - `pnpm --filter @qualiof/web typecheck` → exit 0
    - `pnpm --filter @qualiof/web build` route `/app/factures/[id]` compile sans régression
  </acceptance_criteria>
  <done>Dialog client opérationnel, intégré sur fiche facture, type-safe + RBAC verified. Cycle complet créer-avoir UX-clic-to-PDF fonctionnel.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/credit-note.test.ts` → 15/15
- `pnpm --filter @qualiof/web test -- --run src/components/invoices/__tests__/create-credit-note-dialog.test.ts` → 6/6
- `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-template.credit-note.test.ts` → 5/5
- `pnpm --filter @qualiof/web typecheck` → exit 0
- `pnpm --filter @qualiof/web build` toutes routes compilent
- Anti-régression Phase 7-02 : tests `createInvoiceFromParticipant`/`recordInvoicePayment` toujours verts
- **Manuel** : verifier visuellement le rendu PDF avec mode AVOIR via stack docker up (cf 11-VALIDATION.md Manual-Only Verifications)
</verification>

<success_criteria>
- `createCreditNote` server action ADMIN+MANAGER+COMPTABLE, transactional, audit-loggée
- Avoir total → facture origine CANCELLED
- Avoir partiel → original inchangé, N avoirs cumulés autorisés tant que sum ≤ original.amountHt
- Template PDF étendu mode AVOIR
- Dialog client Radix opérationnel
- Intégration fiche facture : CTA + section avoirs liés + bandeau retour
- 26 tests Vitest verts (15 + 6 + 5)
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-05-SUMMARY.md`
</output>

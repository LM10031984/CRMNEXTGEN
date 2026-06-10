---
phase: 11-factures-cycle-complet
plan: 09
type: execute
wave: 4
depends_on:
  - "11-08"
files_modified:
  - apps/web/src/components/learners/learner-invoices-block.tsx
  - apps/web/src/components/learners/__tests__/learner-invoices-block.test.ts
  - apps/web/src/components/sessions/session-invoices-block.tsx
  - apps/web/src/components/sessions/__tests__/session-invoices-block.test.ts
  - apps/web/src/app/app/apprenants/[id]/page.tsx
  - apps/web/src/app/app/sessions/[id]/page.tsx
autonomous: true
requirements:
  - FACT-01
must_haves:
  truths:
    - "Fiche apprenant /app/apprenants/[id] (refondue Phase 9.1) affiche un bloc 'Factures' liste compacte des Invoice WHERE participant.personId = current."
    - "Fiche session /app/sessions/[id] (refondue Phase 9.1) affiche un bloc 'Factures' liste compacte des Invoice WHERE sessionId = current OR participantId ∈ session.participants."
    - "Avoirs rendus en rows distinctes avec badge AVO + lien vers facture originale (D-07)."
    - "Click ligne facture → /app/factures/[id] (cross-nav)."
  artifacts:
    - path: "apps/web/src/components/learners/learner-invoices-block.tsx"
      provides: "<LearnerInvoicesBlock> Server Component (clone-style Phase 9.1 SessionOnlyDocsBlock)"
      exports: ["LearnerInvoicesBlock"]
    - path: "apps/web/src/components/sessions/session-invoices-block.tsx"
      provides: "<SessionInvoicesBlock> Server Component"
      exports: ["SessionInvoicesBlock"]
  key_links:
    - from: "/app/apprenants/[id]"
      to: "/app/factures/[invoiceId]"
      via: "<LearnerInvoicesBlock> > Link Phase 11"
      pattern: "/app/factures/\\$"
    - from: "/app/sessions/[id]"
      to: "/app/factures/[invoiceId]"
      via: "<SessionInvoicesBlock> > Link Phase 11"
      pattern: "/app/factures/\\$"
---

<objective>
Câbler la cross-navigation D-07 (Phase 9.1 D-05 pattern reproduite) : ajouter un bloc "Factures" sur la fiche apprenant et un bloc "Factures" sur la fiche session, listant les Invoice du périmètre concerné. Click ligne → drill vers fiche facture. Avoirs distincts avec badge + lien.

Purpose: Sans cette cross-nav, FACT-01 incomplet — Laurent doit chercher facture dans la liste globale. Le critère Airtable-style ("Auditeur trouve une facture en 1-2 clics depuis fiche apprenant/session") est validé.
Output: 2 composants Server + intégration dans les 2 pages détail (sans casser les blocs Phase 9.1) + 2 suites Vitest vertes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@apps/web/src/app/app/apprenants/[id]/page.tsx
@apps/web/src/app/app/sessions/[id]/page.tsx
@apps/web/src/components/sessions/session-only-docs-block.tsx

<interfaces>
<!-- Composants Server cibles -->

```typescript
// apps/web/src/components/learners/learner-invoices-block.tsx
interface LearnerInvoicesBlockProps {
  personId: string;
  tenantId: string;
}
export async function LearnerInvoicesBlock({ personId, tenantId }: LearnerInvoicesBlockProps): Promise<JSX.Element>;

// apps/web/src/components/sessions/session-invoices-block.tsx
interface SessionInvoicesBlockProps {
  sessionId: string;
  tenantId: string;
}
export async function SessionInvoicesBlock({ sessionId, tenantId }: SessionInvoicesBlockProps): Promise<JSX.Element>;
```

<!-- Status palette D-20 (réutiliser celle de invoices-list-table.tsx — duplication acceptée car composant compact) -->
```typescript
const STATUS_PALETTE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-500',
  CREDIT_NOTE: 'bg-violet-100 text-violet-800',
};
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : LearnerInvoicesBlock + intégration fiche apprenant</name>
  <files>apps/web/src/components/learners/learner-invoices-block.tsx, apps/web/src/components/learners/__tests__/learner-invoices-block.test.ts, apps/web/src/app/app/apprenants/[id]/page.tsx</files>
  <read_first>
    - apps/web/src/app/app/apprenants/[id]/page.tsx (page refondue Phase 9.1 : LearnerAlertsBanner + LearnerPrioCards + LearnerTimeline + LearnerTabs — ajout SANS casser ces blocs)
    - apps/web/src/components/sessions/session-only-docs-block.tsx (Phase 9.1 pattern Server Component compact)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §UI Components L681-682
  </read_first>
  <behavior>
    - Test 1 : Le composant est un Server Component async (pas de 'use client' directive)
    - Test 2 : Filtre `prisma.invoice.findMany` WHERE `tenantId` + `participant.personId === personId`
    - Test 3 : Si 0 factures → empty state "Aucune facture liée à cet apprenant"
    - Test 4 : Si N factures → tableau compact 5 colonnes (Numéro / Date / Montant TTC / Statut / Reste)
    - Test 5 : Avoirs (status=CREDIT_NOTE) rendus avec badge AVO violet
    - Test 6 : Cross-nav Link `/app/factures/${invoice.id}` sur le numéro
  </behavior>
  <action>
1. Créer `apps/web/src/components/learners/learner-invoices-block.tsx` :

```typescript
import Link from 'next/link';
import { prisma } from '@qualiof/db';
import { FileText } from 'lucide-react';

const STATUS_PALETTE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-500',
  CREDIT_NOTE: 'bg-violet-100 text-violet-800',
};

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface Props {
  personId: string;
  tenantId: string;
}

export async function LearnerInvoicesBlock({ personId, tenantId }: Props) {
  // Filtre defense-in-depth : tenantId + participant scope
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      participant: { personId },
    },
    select: {
      id: true,
      number: true,
      status: true,
      issueDate: true,
      amountTTC: true,
      amountPaid: true,
      originalInvoiceId: true,
      originalInvoice: { select: { id: true, number: true } },
    },
    orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
  });

  return (
    <section id="learner-invoices" className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-slate-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight">Factures</h2>
        <span className="text-xs text-slate-500">({invoices.length})</span>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          Aucune facture liée à cet apprenant
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-600">Numéro</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-600">Date</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-600">TTC</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-600">Reste</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-600">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {invoices.map((inv) => {
                const isAvoir = inv.status === 'CREDIT_NOTE';
                const ttc = Number(inv.amountTTC);
                const paid = Number(inv.amountPaid);
                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-sm">
                      <Link href={`/app/factures/${inv.id}`} className="text-primary-700 hover:underline font-mono">
                        {inv.number}
                      </Link>
                      {isAvoir && (
                        <span className="ml-2 inline-flex items-center rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                          AVO
                        </span>
                      )}
                      {isAvoir && inv.originalInvoice && (
                        <Link
                          href={`/app/factures/${inv.originalInvoice.id}`}
                          className="ml-2 text-xs text-slate-500 hover:underline"
                        >
                          ← {inv.originalInvoice.number}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {inv.issueDate ? fmtDate.format(inv.issueDate) : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">{fmtEUR.format(ttc)}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">{fmtEUR.format(ttc - paid)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_PALETTE[inv.status] ?? 'bg-slate-100 text-slate-700'}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

2. Éditer `apps/web/src/app/app/apprenants/[id]/page.tsx` pour ajouter `<LearnerInvoicesBlock>` :
   - Placer le bloc APRÈS `<LearnerTimeline>` et AVANT `<LearnerTabs>` (cohérent layout Phase 9.1)
   - Import `import { LearnerInvoicesBlock } from '@/components/learners/learner-invoices-block';`
   - JSX :
     ```tsx
     <LearnerInvoicesBlock personId={person.id} tenantId={user.tenantId} />
     ```
   - **NE PAS** retirer ou modifier les blocs Phase 9.1 existants (anti-régression CENTRAL-03)

3. Créer `apps/web/src/components/learners/__tests__/learner-invoices-block.test.ts` (source-regex 6 tests) :
   - Pas de `'use client'` directive (Server Component)
   - Import `prisma` depuis `@qualiof/db`
   - Where clause contient `participant: { personId }`
   - Where clause contient `tenantId` (defense-in-depth)
   - Empty state "Aucune facture liée à cet apprenant"
   - Cross-nav Link `/app/factures/${inv.id}`
   - Badge AVO conditional sur `status === 'CREDIT_NOTE'`

4. Lancer : `pnpm --filter @qualiof/web test -- --run src/components/learners/__tests__/learner-invoices-block.test.ts` → vert.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/components/learners/__tests__/learner-invoices-block.test.ts && pnpm --filter @qualiof/web typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/components/learners/learner-invoices-block.tsx` existe (ls)
    - **Pas** de `'use client'` directive (Server Component — grep négatif)
    - Contient `participant: { personId }` dans where Prisma (grep)
    - Contient `tenantId` dans where (defense-in-depth — grep)
    - Empty state verbatim `'Aucune facture liée à cet apprenant'` (grep)
    - `<Link href={\`/app/factures/${inv.id}\`}` (grep)
    - Badge `AVO` conditional sur status CREDIT_NOTE (grep)
    - `apps/web/src/app/app/apprenants/[id]/page.tsx` contient `<LearnerInvoicesBlock` (grep)
    - **Anti-régression Phase 9.1** : blocs `LearnerTimeline`, `LearnerPrioCards`, `LearnerAlertsBanner` toujours dans la page
    - 6/6 tests verts
    - `pnpm --filter @qualiof/web build` la route compile
  </acceptance_criteria>
  <done>Cross-nav apprenant → facture câblée, anti-régression Phase 9.1 respectée.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 : SessionInvoicesBlock + intégration fiche session</name>
  <files>apps/web/src/components/sessions/session-invoices-block.tsx, apps/web/src/components/sessions/__tests__/session-invoices-block.test.ts, apps/web/src/app/app/sessions/[id]/page.tsx</files>
  <read_first>
    - apps/web/src/app/app/sessions/[id]/page.tsx (page refondue Phase 9.1 : ParticipantDocMatrix + SessionOnlyDocsBlock + MatrixFilters + BatchRegenBar — ajout SANS casser ces blocs)
    - apps/web/src/components/sessions/session-only-docs-block.tsx (Phase 9.1 pattern Server Component compact à cloner)
    - Plan 11-09 Task 1 (`learner-invoices-block.tsx` créé ci-dessus — pattern à dupliquer mais avec WHERE adapté à la session)
  </read_first>
  <behavior>
    - Test 1 : Server Component async (pas de 'use client')
    - Test 2 : Filtre WHERE `tenantId` + `OR: [{ sessionId }, { participant: { sessionId } }]`
    - Test 3 : Empty state "Aucune facture liée à cette session"
    - Test 4 : Tableau compact 5 colonnes (Numéro / Apprenant / Date / TTC / Statut)
    - Test 5 : Avoirs avec badge AVO + lien vers facture originale
    - Test 6 : Cross-nav `<Link href="/app/factures/${inv.id}">`
  </behavior>
  <action>
1. Créer `apps/web/src/components/sessions/session-invoices-block.tsx` (clone-strict `learner-invoices-block.tsx` Task 1 avec query adaptée) :

```typescript
import Link from 'next/link';
import { prisma } from '@qualiof/db';
import { FileText } from 'lucide-react';

const STATUS_PALETTE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-500',
  CREDIT_NOTE: 'bg-violet-100 text-violet-800',
};

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface Props {
  sessionId: string;
  tenantId: string;
}

export async function SessionInvoicesBlock({ sessionId, tenantId }: Props) {
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      OR: [{ sessionId }, { participant: { sessionId } }],
    },
    select: {
      id: true,
      number: true,
      status: true,
      issueDate: true,
      amountTTC: true,
      amountPaid: true,
      originalInvoiceId: true,
      originalInvoice: { select: { id: true, number: true } },
      participant: {
        select: { person: { select: { firstName: true, lastName: true } } },
      },
      payerOrg: { select: { legalName: true } },
    },
    orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
  });

  return (
    <section id="session-invoices" className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-slate-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight">Factures</h2>
        <span className="text-xs text-slate-500">({invoices.length})</span>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          Aucune facture liée à cette session
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-600">Numéro</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-600">Bénéficiaire / Payeur</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-600">Date</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-600">TTC</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-600">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {invoices.map((inv) => {
                const isAvoir = inv.status === 'CREDIT_NOTE';
                const label = inv.participant?.person
                  ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
                  : (inv.payerOrg?.legalName ?? 'Facture groupée');
                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-sm">
                      <Link href={`/app/factures/${inv.id}`} className="text-primary-700 hover:underline font-mono">
                        {inv.number}
                      </Link>
                      {isAvoir && (
                        <span className="ml-2 inline-flex items-center rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                          AVO
                        </span>
                      )}
                      {isAvoir && inv.originalInvoice && (
                        <Link
                          href={`/app/factures/${inv.originalInvoice.id}`}
                          className="ml-2 text-xs text-slate-500 hover:underline"
                        >
                          ← {inv.originalInvoice.number}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">{label}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {inv.issueDate ? fmtDate.format(inv.issueDate) : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">{fmtEUR.format(Number(inv.amountTTC))}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_PALETTE[inv.status] ?? 'bg-slate-100 text-slate-700'}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

2. Éditer `apps/web/src/app/app/sessions/[id]/page.tsx` pour ajouter `<SessionInvoicesBlock>` :
   - Placer le bloc APRÈS `<SessionOnlyDocsBlock>` (Phase 9.1)
   - Import + JSX :
     ```tsx
     import { SessionInvoicesBlock } from '@/components/sessions/session-invoices-block';
     // ... dans le JSX ...
     <SessionInvoicesBlock sessionId={session.id} tenantId={user.tenantId} />
     ```
   - **NE PAS** retirer ou modifier les blocs Phase 9.1 existants (anti-régression CENTRAL-01 + 02)

3. Créer `apps/web/src/components/sessions/__tests__/session-invoices-block.test.ts` (source-regex 6 tests).

4. Lancer : `pnpm --filter @qualiof/web test -- --run src/components/sessions/__tests__/session-invoices-block.test.ts` → vert.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/components/sessions/__tests__/session-invoices-block.test.ts && pnpm --filter @qualiof/web typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/components/sessions/session-invoices-block.tsx` existe (ls)
    - Pas de `'use client'` directive (grep négatif)
    - Where clause contient `OR: [{ sessionId }, { participant: { sessionId } }]` (grep)
    - Empty state `'Aucune facture liée à cette session'` (grep)
    - Cross-nav `<Link href={\`/app/factures/${inv.id}\`}` (grep)
    - `apps/web/src/app/app/sessions/[id]/page.tsx` contient `<SessionInvoicesBlock` (grep)
    - **Anti-régression Phase 9.1** : `ParticipantDocMatrix`, `SessionOnlyDocsBlock`, `MatrixFilters`, `BatchRegenBar` toujours dans la page
    - 6/6 tests verts
    - `pnpm --filter @qualiof/web build` la route compile
  </acceptance_criteria>
  <done>Cross-nav session → facture câblée. Critère Airtable D-07 atteint.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test -- --run src/components/learners/__tests__/learner-invoices-block.test.ts` → 6/6
- `pnpm --filter @qualiof/web test -- --run src/components/sessions/__tests__/session-invoices-block.test.ts` → 6/6
- `pnpm --filter @qualiof/web typecheck` → exit 0
- `pnpm --filter @qualiof/web build` les 2 routes compilent
- Anti-régression Phase 9.1 : tests existants apprenants/[id] et sessions/[id] toujours verts
- **Manuel (cf 11-VALIDATION.md)** : `pnpm dev:full` → ouvrir une fiche apprenant + une fiche session, vérifier bloc Factures visible, click ligne → fiche facture
</verification>

<success_criteria>
- `<LearnerInvoicesBlock>` ajouté sur fiche apprenant
- `<SessionInvoicesBlock>` ajouté sur fiche session
- Cross-nav fonctionnelle (1-2 clics vers fiche facture)
- Avoirs avec badge AVO + lien vers facture origine
- Anti-régression Phase 9.1 (CENTRAL-01..05) respectée
- 12 tests Vitest verts (6 + 6)
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-09-SUMMARY.md`
</output>

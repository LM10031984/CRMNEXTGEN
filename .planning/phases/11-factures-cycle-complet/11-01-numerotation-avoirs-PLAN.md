---
phase: 11-factures-cycle-complet
plan: 01
type: execute
wave: 1
depends_on:
  - "11-00"
files_modified:
  - apps/web/src/lib/numbering.ts
  - apps/web/src/lib/__tests__/numbering.credit-note.test.ts
autonomous: true
requirements:
  - FACT-02
must_haves:
  truths:
    - "getNextCreditNoteNumber génère AVO-NNNNNN séquentiel atomique, distinct de FAC-NNNNNN."
    - "Race condition mitigée par appel via prisma.$transaction(tx => getNextCreditNoteNumber(tenantId, tx))."
  artifacts:
    - path: "apps/web/src/lib/numbering.ts"
      provides: "Helper getNextCreditNoteNumber clone-strict de getNextInvoiceNumber, avec préfixe configurable Tenant.creditNotePrefix."
      exports: ["getNextCreditNoteNumber", "getNextInvoiceNumber"]
    - path: "apps/web/src/lib/__tests__/numbering.credit-note.test.ts"
      provides: "Suite Vitest validant 6 behaviors (séquence AVO-, custom prefix, fallback, tx, isolation FAC/AVO, race)"
      min_lines: 100
  key_links:
    - from: "Plan 11-05 createCreditNote"
      to: "getNextCreditNoteNumber(tenantId, tx)"
      via: "import depuis @/lib/numbering"
      pattern: "getNextCreditNoteNumber\\(.*tx"
---

<objective>
Étendre `apps/web/src/lib/numbering.ts` avec `getNextCreditNoteNumber(tenantId, tx?)` clone-strict du pattern Phase 7 `getNextInvoiceNumber`. Convention CGI art. 289 : numérotation séquentielle DÉDIÉE pour les avoirs (`AVO-NNNNNN`), distincte de la séquence factures (`FAC-NNNNNN`).

Purpose: Sans cette fonction, `createCreditNote` (Plan 11-05) ne peut pas s'exécuter. Atomicité transactionnelle obligatoire (race condition possible si 2 admins créent un avoir simultanément).
Output: Helper exporté + test suite Vitest verte.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@apps/web/src/lib/numbering.ts
@apps/web/src/lib/__tests__/numbering.test.ts

<interfaces>
<!-- État actuel apps/web/src/lib/numbering.ts (à étendre, NE PAS modifier l'existant) -->

```typescript
import { prisma, type Prisma } from '@qualiof/db';

export async function getNextInvoiceNumber(
  tenantId: string,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const db = tx ?? prisma;
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { invoicePrefix: true },
  });
  const prefix = (tenant?.invoicePrefix ?? 'FAC').trim() || 'FAC';

  const last = await db.invoice.findFirst({
    where: { tenantId, number: { startsWith: `${prefix}-` } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const lastNum = last ? parseInt(last.number.replace(`${prefix}-`, ''), 10) || 0 : 0;
  return `${prefix}-${String(lastNum + 1).padStart(6, '0')}`;
}
```

<!-- Signature cible à ajouter -->
```typescript
export async function getNextCreditNoteNumber(
  tenantId: string,
  tx?: Prisma.TransactionClient,
): Promise<string>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Implémenter getNextCreditNoteNumber clone-strict</name>
  <files>apps/web/src/lib/numbering.ts, apps/web/src/lib/__tests__/numbering.credit-note.test.ts</files>
  <read_first>
    - apps/web/src/lib/numbering.ts (état actuel — fonction getNextInvoiceNumber à cloner)
    - apps/web/src/lib/__tests__/numbering.test.ts (pattern test source-regex + mock Prisma D-Phase9-N)
    - apps/web/src/lib/__tests__/numbering.credit-note.test.ts (stub Wave 0 à remplir)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Numérotation Avoirs
  </read_first>
  <behavior>
    - Test 1 : Pas d'avoir existant → `AVO-000001`
    - Test 2 : Dernier avoir `AVO-000041` → retourne `AVO-000042`
    - Test 3 : `tenant.creditNotePrefix = 'NC'` → retourne `NC-000001` (custom prefix respecté)
    - Test 4 : `tenant.creditNotePrefix = null` → fallback `AVO-000001`
    - Test 5 : Appel avec `tx` → utilise `tx` au lieu de `prisma` (atomicité, vérifier via spy)
    - Test 6 : Filtre `startsWith: 'AVO-'` n'inclut PAS les factures `FAC-000099` (isolation)
  </behavior>
  <action>
1. **Ajouter** à `apps/web/src/lib/numbering.ts` (après `getNextInvoiceNumber`) :

```typescript
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

2. **Remplacer** `numbering.credit-note.test.ts` (stub Wave 0) par la vraie suite — pattern clone-strict de `numbering.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNextCreditNoteNumber } from '../numbering';

// Mock Prisma — pattern Phase 7/8/9
const findUniqueMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock('@qualiof/db', () => ({
  prisma: {
    tenant: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    invoice: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
  },
  Prisma: {} as never,
}));

beforeEach(() => {
  findUniqueMock.mockReset();
  findFirstMock.mockReset();
});

describe('getNextCreditNoteNumber', () => {
  it('returns AVO-000001 quand aucun avoir existe', async () => {
    findUniqueMock.mockResolvedValue({ creditNotePrefix: 'AVO' });
    findFirstMock.mockResolvedValue(null);
    expect(await getNextCreditNoteNumber('tenant-1')).toBe('AVO-000001');
  });

  it('returns AVO-000042 quand dernier avoir est AVO-000041', async () => {
    findUniqueMock.mockResolvedValue({ creditNotePrefix: 'AVO' });
    findFirstMock.mockResolvedValue({ number: 'AVO-000041' });
    expect(await getNextCreditNoteNumber('tenant-1')).toBe('AVO-000042');
  });

  it('respecte le préfixe custom tenant.creditNotePrefix', async () => {
    findUniqueMock.mockResolvedValue({ creditNotePrefix: 'NC' });
    findFirstMock.mockResolvedValue(null);
    expect(await getNextCreditNoteNumber('tenant-1')).toBe('NC-000001');
  });

  it('fallback AVO si tenant.creditNotePrefix null', async () => {
    findUniqueMock.mockResolvedValue({ creditNotePrefix: null });
    findFirstMock.mockResolvedValue(null);
    expect(await getNextCreditNoteNumber('tenant-1')).toBe('AVO-000001');
  });

  it('utilise le tx Prisma quand fourni (atomicité transactional)', async () => {
    const txFindUnique = vi.fn().mockResolvedValue({ creditNotePrefix: 'AVO' });
    const txFindFirst = vi.fn().mockResolvedValue(null);
    const tx = {
      tenant: { findUnique: txFindUnique },
      invoice: { findFirst: txFindFirst },
    } as never;
    await getNextCreditNoteNumber('tenant-1', tx);
    expect(txFindUnique).toHaveBeenCalled();
    expect(txFindFirst).toHaveBeenCalled();
    // Le mock global ne doit PAS être appelé
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('filtre uniquement les Invoice avec number startsWith AVO- (n\'inclut pas les FAC-)', async () => {
    findUniqueMock.mockResolvedValue({ creditNotePrefix: 'AVO' });
    findFirstMock.mockResolvedValue({ number: 'AVO-000005' });
    await getNextCreditNoteNumber('tenant-1');
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', number: { startsWith: 'AVO-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
  });
});
```

3. Lancer la suite : `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/numbering.credit-note.test.ts` → doit être verte (6/6).
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/lib/__tests__/numbering.credit-note.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/lib/numbering.ts` contient `export async function getNextCreditNoteNumber(tenantId: string, tx?: Prisma.TransactionClient): Promise<string>` (grep)
    - `apps/web/src/lib/numbering.ts` contient `creditNotePrefix` (lecture Tenant via findUnique select)
    - `apps/web/src/lib/numbering.ts` contient `tenant?.creditNotePrefix ?? 'AVO'` (fallback)
    - `apps/web/src/lib/numbering.ts` contient `startsWith: \`${prefix}-\`` dans la requête findFirst
    - Pas de modification de la signature `getNextInvoiceNumber` existante (anti-régression Phase 7) — `git diff apps/web/src/lib/numbering.ts` ne montre que des additions
    - `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/numbering.credit-note.test.ts` → 6 tests verts
    - `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/numbering.test.ts` → tests existants Phase 7 toujours verts (anti-régression)
  </acceptance_criteria>
  <done>Helper exporté et testé. Séquence AVO-NNNNNN distincte de FAC-NNNNNN. Atomicité via `tx`. Le Plan 11-05 peut maintenant l'importer.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/numbering.credit-note.test.ts` → 6/6 verts
- `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/numbering.test.ts` → tests Phase 7 toujours verts
- `pnpm --filter @qualiof/web typecheck` → exit 0
</verification>

<success_criteria>
- `getNextCreditNoteNumber` exportée depuis `numbering.ts`
- Suite Vitest 6/6 verte
- Anti-régression : suite `numbering.test.ts` Phase 7 reste verte
- Atomicité transactionnelle : test 5 vérifie l'usage de `tx`
- Isolation des séquences : test 6 vérifie le filtre `startsWith: 'AVO-'`
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-01-SUMMARY.md`
</output>

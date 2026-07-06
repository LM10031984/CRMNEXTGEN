---
phase: 11-factures-cycle-complet
plan: 02
type: execute
wave: 1
depends_on:
  - "11-00"
files_modified:
  - apps/web/src/lib/invoice-audit.ts
  - apps/web/src/lib/__tests__/invoice-audit.test.ts
autonomous: true
requirements:
  - FACT-01
  - FACT-02
  - FACT-03
  - FACT-04
must_haves:
  truths:
    - "logInvoiceEvent crée des AuditLog entity='Invoice' avec 6 actions namespacées invoices.*."
    - "Helper isolé dans son propre module (D-Phase9.1-02 — NE PAS éditer audit-log.ts global)."
  artifacts:
    - path: "apps/web/src/lib/invoice-audit.ts"
      provides: "Helper logInvoiceEvent clone-strict de logLeadEvent Phase 9 (D-Phase9-H)"
      exports: ["logInvoiceEvent"]
      min_lines: 25
    - path: "apps/web/src/lib/__tests__/invoice-audit.test.ts"
      provides: "Suite Vitest validant les 6 actions namespacées + actor null + pas de no-op diff vide"
      min_lines: 80
  key_links:
    - from: "Plans 11-05 / 11-06 / 11-07 / 11-08"
      to: "logInvoiceEvent"
      via: "import depuis @/lib/invoice-audit"
      pattern: "logInvoiceEvent\\("
---

<objective>
Créer le module isolé `apps/web/src/lib/invoice-audit.ts` exportant `logInvoiceEvent` — clone-strict du pattern Phase 9 `logLeadEvent` (`lib/audit-log.ts` extension). 4ème helper entity-namespaced après `parameters.*` (Phase 7), `users.*` (Phase 8), `leads.*` (Phase 9), `documents.*` (Phase 9.1). Pattern « one helper per entity » (D-Phase9.1-02) — NE PAS éditer `audit-log.ts` global.

Purpose: Tous les server actions et la route export Plans 11-05/06/07/08 dépendent de ce helper pour respecter D-18 (AuditLog convention `entity='Invoice'`). Sans ce module, on aurait soit dette technique (action sans log), soit drift de signature.
Output: Module exporté + suite Vitest verte (6 behaviors).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@apps/web/src/lib/audit-log.ts
@apps/web/src/lib/document-audit.ts

<interfaces>
<!-- Pattern Phase 9 (audit-log.ts logLeadEvent) à cloner -->

```typescript
// Pattern Phase 9.1 (D-Phase9.1-02) : module isolé per-entity
// Signature cible :
export async function logInvoiceEvent(opts: {
  tenantId: string;
  actorUserId: string | null;       // null = system (worker daily cron — D-13c)
  targetInvoiceId: string;           // ou 'BULK' pour invoices.exported (D-18)
  action: string;                    // 6 namespacées (cf liste below)
  diff?: Record<string, unknown>;
}): Promise<void>;
```

<!-- 6 actions namespacées D-18 -->
- `invoices.created`           (createInvoiceFromParticipant / createInvoiceForSponsorGroup)
- `invoices.issued`            (idem — création passe direct ISSUED)
- `invoices.payment_recorded`  (recordInvoicePayment)
- `invoices.credit_note_created` (createCreditNote)
- `invoices.reminder_sent`     (sendInvoiceReminder — cron OR manual)
- `invoices.exported`          (route /api/factures/export)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Créer le module invoice-audit.ts + suite tests</name>
  <files>apps/web/src/lib/invoice-audit.ts, apps/web/src/lib/__tests__/invoice-audit.test.ts</files>
  <read_first>
    - apps/web/src/lib/audit-log.ts (pattern logLeadEvent Phase 9 — Phase 9 audit-log.ts existant)
    - apps/web/src/lib/document-audit.ts (pattern Phase 9.1 D-Phase9.1-02 — module isolé per-entity, à reproduire à l'identique)
    - apps/web/src/lib/__tests__/invoice-audit.test.ts (stub Wave 0 à remplir)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §AuditLog Events + §logInvoiceEvent
  </read_first>
  <behavior>
    - Test 1 : Crée une row AuditLog avec entity='Invoice' (vérifier via mock prisma.auditLog.create)
    - Test 2 : `actorUserId: null` → row avec `userId: null` (system / cron worker)
    - Test 3 : Accepte les 6 actions namespacées listées D-18
    - Test 4 : Sérialise le `diff` en JSON (Record<string, unknown> → field `diff` Json côté Prisma)
    - Test 5 : Ne no-op PAS sur diff vide (cohérent D-Phase9-H — certains events comme `invoices.exported` n'ont que payload)
    - Test 6 : `targetInvoiceId='BULK'` est accepté (convention pour invoices.exported)
  </behavior>
  <action>
1. **Créer** `apps/web/src/lib/invoice-audit.ts` avec EXACTEMENT ce contenu (clone-strict `document-audit.ts` Phase 9.1) :

```typescript
import { prisma } from '@qualiof/db';

/**
 * Phase 11 — Helper logInvoiceEvent (D-18 convention `entity='Invoice'`).
 *
 * 4ème instance "one helper per entity" :
 *   - Phase 7 : logTenantSettingsChange (entity='Tenant', actions parameters.*)
 *   - Phase 8 : logUserAction (entity='User', actions users.*)
 *   - Phase 9 : logLeadEvent (entity='Lead', actions leads.*)
 *   - Phase 9.1 : logDocumentEvent (entity='Document', actions documents.*)
 *   - Phase 11 : logInvoiceEvent (entity='Invoice', actions invoices.*)
 *
 * NE PAS éditer audit-log.ts global (D-Phase9.1-02).
 *
 * Actions namespacées Phase 11 (D-18) :
 *   - invoices.created
 *   - invoices.issued
 *   - invoices.payment_recorded
 *   - invoices.credit_note_created
 *   - invoices.reminder_sent
 *   - invoices.exported
 *
 * actorUserId null = action système (worker daily cron — D-13c).
 * targetInvoiceId='BULK' = convention pour invoices.exported (route /api/factures/export).
 * Pas de no-op sur diff vide (cohérent D-Phase9-H).
 */
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

2. **Remplacer** `apps/web/src/lib/__tests__/invoice-audit.test.ts` (stub Wave 0) par la suite réelle :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logInvoiceEvent } from '../invoice-audit';

const createMock = vi.fn();
vi.mock('@qualiof/db', () => ({
  prisma: {
    auditLog: { create: (...args: unknown[]) => createMock(...args) },
  },
}));

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ id: 'log-1' });
});

describe('logInvoiceEvent', () => {
  it('crée une row AuditLog avec entity=Invoice', async () => {
    await logInvoiceEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetInvoiceId: 'inv-1',
      action: 'invoices.created',
      diff: { amountTtc: 1200 },
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        entity: 'Invoice',
        entityId: 'inv-1',
        action: 'invoices.created',
        diff: { amountTtc: 1200 },
      },
    });
  });

  it('accepte actorUserId null (system / cron worker)', async () => {
    await logInvoiceEvent({
      tenantId: 'tenant-1',
      actorUserId: null,
      targetInvoiceId: 'inv-2',
      action: 'invoices.reminder_sent',
      diff: { level: 1, triggered_by: 'cron' },
    });
    expect(createMock.mock.calls[0]![0].data.userId).toBeNull();
  });

  it('accepte les 6 actions namespacées D-18', async () => {
    const actions = [
      'invoices.created',
      'invoices.issued',
      'invoices.payment_recorded',
      'invoices.credit_note_created',
      'invoices.reminder_sent',
      'invoices.exported',
    ];
    for (const action of actions) {
      await logInvoiceEvent({
        tenantId: 't1',
        actorUserId: 'u1',
        targetInvoiceId: 'inv-X',
        action,
      });
    }
    expect(createMock).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 6; i++) {
      expect(createMock.mock.calls[i]![0].data.action).toBe(actions[i]);
    }
  });

  it('sérialise le diff en JSON (Record<string, unknown>)', async () => {
    const diff = { level: 2, channel: 'email', nested: { foo: 'bar' } };
    await logInvoiceEvent({
      tenantId: 't1',
      actorUserId: 'u1',
      targetInvoiceId: 'inv-3',
      action: 'invoices.reminder_sent',
      diff,
    });
    expect(createMock.mock.calls[0]![0].data.diff).toEqual(diff);
  });

  it('ne no-op PAS sur diff vide (cohérent D-Phase9-H)', async () => {
    await logInvoiceEvent({
      tenantId: 't1',
      actorUserId: 'u1',
      targetInvoiceId: 'inv-4',
      action: 'invoices.issued',
      // diff omitted
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0].data.diff).toEqual({});
  });

  it('accepte targetInvoiceId=BULK (convention invoices.exported)', async () => {
    await logInvoiceEvent({
      tenantId: 't1',
      actorUserId: 'u1',
      targetInvoiceId: 'BULK',
      action: 'invoices.exported',
      diff: { from: '2026-01-01', to: '2026-01-31', count: 42 },
    });
    expect(createMock.mock.calls[0]![0].data.entityId).toBe('BULK');
  });
});
```

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-audit.test.ts` → 6 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-audit.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/lib/invoice-audit.ts` existe (ls)
    - Exporte `logInvoiceEvent` (grep `export async function logInvoiceEvent`)
    - Signature exacte : `tenantId: string; actorUserId: string | null; targetInvoiceId: string; action: string; diff?: Record<string, unknown>` (grep)
    - Crée AuditLog avec `entity: 'Invoice'` hardcodé (grep `entity: 'Invoice'`)
    - **NE modifie PAS** `apps/web/src/lib/audit-log.ts` (D-Phase9.1-02 — `git diff apps/web/src/lib/audit-log.ts` doit être vide)
    - Test suite verte : 6/6 (`pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-audit.test.ts`)
    - Suite complète apps/web verte (anti-régression) : `pnpm --filter @qualiof/web test -- --run`
  </acceptance_criteria>
  <done>Module exporté, suite verte, audit-log.ts intact. Les Plans 11-05/06/07/08 peuvent importer `logInvoiceEvent` depuis `@/lib/invoice-audit`.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-audit.test.ts` → 6/6 verts
- `git diff apps/web/src/lib/audit-log.ts` → vide (audit-log.ts NON édité)
- `pnpm --filter @qualiof/web typecheck` → exit 0
</verification>

<success_criteria>
- Module `apps/web/src/lib/invoice-audit.ts` exporté
- Signature conforme à D-18 (6 actions, actorUserId nullable, targetInvoiceId string)
- Anti-régression : `audit-log.ts` global intact (D-Phase9.1-02)
- Suite Vitest 6/6 verte
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-02-SUMMARY.md`
</output>

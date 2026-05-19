import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 11 Plan 11-02 Task 1 — `logInvoiceEvent`.
 *
 * Clone-strict du pattern `document-audit.test.ts` (Phase 9.1) — D-Phase9.1-02
 * « one helper per entity ». Coverage (cf. <behavior> plan 11-02) :
 *
 *  - Test 1 : crée une row AuditLog avec entity='Invoice'
 *  - Test 2 : actorUserId=null accepté (system / cron worker — D-13c)
 *  - Test 3 : 6 actions namespacées D-18
 *      invoices.created / invoices.issued / invoices.payment_recorded /
 *      invoices.credit_note_created / invoices.reminder_sent / invoices.exported
 *  - Test 4 : sérialise le `diff` en JSON (Record<string, unknown>)
 *  - Test 5 : ne no-op PAS sur diff vide (cohérent D-Phase9-H)
 *  - Test 6 : targetInvoiceId='BULK' accepté (convention invoices.exported)
 *
 * Stratégie de mock identique à `document-audit.test.ts` (Phase 9.1) :
 * `@qualiof/db` remplacé par prisma factice exposant `auditLog.create` en `vi.fn()`.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@qualiof/db';
import { logInvoiceEvent } from '../invoice-audit';

const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  auditLogCreate.mockReset();
  auditLogCreate.mockResolvedValue({ id: 'log-1' });
});

describe('logInvoiceEvent', () => {
  it('Test 1 — crée une row AuditLog avec entity="Invoice"', async () => {
    await logInvoiceEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetInvoiceId: 'inv-1',
      action: 'invoices.created',
      diff: { amountTtc: 1200 },
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.tenantId).toBe('tenant-1');
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.entity).toBe('Invoice');
    expect(arg.data.entityId).toBe('inv-1');
    expect(arg.data.action).toBe('invoices.created');
    expect(arg.data.diff).toEqual({ amountTtc: 1200 });
  });

  it('Test 2 — actorUserId=null accepté (system / cron worker — D-13c)', async () => {
    await logInvoiceEvent({
      tenantId: 'tenant-1',
      actorUserId: null,
      targetInvoiceId: 'inv-2',
      action: 'invoices.reminder_sent',
      diff: { level: 1, channel: 'email', triggered_by: 'cron' },
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.userId).toBeNull();
    expect(arg.data.entity).toBe('Invoice');
  });

  it('Test 3 — accepte les 6 actions namespacées D-18', async () => {
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
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        targetInvoiceId: 'inv-X',
        action,
      });
    }
    expect(auditLogCreate).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 6; i++) {
      expect(auditLogCreate.mock.calls[i]![0].data.action).toBe(actions[i]);
      expect(auditLogCreate.mock.calls[i]![0].data.entity).toBe('Invoice');
    }
  });

  it('Test 4 — sérialise le diff en JSON (Record<string, unknown>)', async () => {
    const diff = { level: 2, channel: 'email', nested: { foo: 'bar', n: 42 } };
    await logInvoiceEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetInvoiceId: 'inv-3',
      action: 'invoices.reminder_sent',
      diff,
    });
    expect(auditLogCreate.mock.calls[0]![0].data.diff).toEqual(diff);
  });

  it('Test 5 — ne no-op PAS sur diff vide (cohérent D-Phase9-H)', async () => {
    await logInvoiceEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetInvoiceId: 'inv-4',
      action: 'invoices.issued',
      // diff intentionnellement omis
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0]![0].data.diff).toEqual({});
  });

  it('Test 6 — targetInvoiceId="BULK" accepté (convention invoices.exported)', async () => {
    await logInvoiceEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetInvoiceId: 'BULK',
      action: 'invoices.exported',
      diff: { from: '2026-01-01', to: '2026-01-31', count: 42 },
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0]![0].data.entityId).toBe('BULK');
    expect(auditLogCreate.mock.calls[0]![0].data.action).toBe('invoices.exported');
  });
});

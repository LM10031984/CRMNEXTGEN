import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests Phase 9.1 Plan 09.1-01 Task 3 — `logDocumentEvent`.
 *
 * Coverage (cf. <behavior> Tasks tests 1-4) :
 *  - Test 1 : action='documents.status_change' avec diff → row écrit avec entity='Document'
 *  - Test 2 : sans `diff` → `{}` passé à prisma (pas null)
 *  - Test 3 : actorUserId=null accepté (cas system, worker BullMQ async)
 *  - Test 4 : pas de no-op sur diff vide (cohérent logLeadEvent)
 *
 * Stratégie de mock identique à `audit-log.test.ts` (Phase 9) : `@qualiof/db`
 * remplacé par prisma factice exposant `auditLog.create` en `vi.fn()`.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@qualiof/db';
import { logDocumentEvent } from '../document-audit';

const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  auditLogCreate.mockReset();
  auditLogCreate.mockResolvedValue({});
});

describe('logDocumentEvent', () => {
  it('Test 1 — action="documents.status_change" + diff → row écrit entity="Document"', async () => {
    await logDocumentEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetEntityId: 'participant-1',
      action: 'documents.status_change',
      diff: {
        PROGRAMME: {
          before: null,
          after: { state: 'MANUAL_OK', updatedAt: '2026-05-18T10:00:00.000Z' },
        },
      },
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.tenantId).toBe('tenant-1');
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.entity).toBe('Document');
    expect(arg.data.entityId).toBe('participant-1');
    expect(arg.data.action).toBe('documents.status_change');
    expect(arg.data.diff).toMatchObject({
      PROGRAMME: { before: null, after: { state: 'MANUAL_OK' } },
    });
  });

  it('Test 2 — sans `diff` → `{}` passé à prisma (pas null, pas undefined)', async () => {
    await logDocumentEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetEntityId: 'participant-1',
      action: 'documents.regenerate',
      // diff intentionnellement omis
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.diff).toEqual({});
  });

  it('Test 3 — actorUserId=null accepté (cas system / worker BullMQ async)', async () => {
    await logDocumentEvent({
      tenantId: 'tenant-1',
      actorUserId: null,
      targetEntityId: 'participant-42',
      action: 'documents.regenerate',
      diff: { kind: 'CERTIFICAT', triggered_by: 'worker' },
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.userId).toBeNull();
    expect(arg.data.entity).toBe('Document');
  });

  it('Test 4 — pas de no-op sur diff vide (cohérent logLeadEvent)', async () => {
    await logDocumentEvent({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      targetEntityId: 'participant-1',
      action: 'documents.upload_signed',
      diff: {},
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.action).toBe('documents.upload_signed');
    expect(arg.data.diff).toEqual({});
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9 Plan 09-02 Task 1 — Tests `logLeadEvent`.
 *
 * Coverage :
 *  - Test 1 : actorUserId=null → row écrit avec userId=null + action='leads.auto_assigned'
 *  - Test 2 : actorUserId='abc' → row écrit avec userId='abc' + action='leads.reassigned'
 *  - Test 3 : diff vide → row écrit quand même (pas de no-op, distinct de logTenantSettingsChange)
 *
 * Stratégie de mock : `@qualiof/db` remplacé par un prisma factice exposant
 * `auditLog.create` en `vi.fn()`. Permet d'inspecter l'argument exact passé
 * à Prisma sans toucher la BDD.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@qualiof/db';
import { logLeadEvent } from '../audit-log';

const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  auditLogCreate.mockReset();
  auditLogCreate.mockResolvedValue({});
});

describe('logLeadEvent', () => {
  it('Test 1 — actorUserId=null écrit row avec userId=null + action="leads.auto_assigned"', async () => {
    await logLeadEvent({
      tenantId: 'tenant-1',
      actorUserId: null,
      targetLeadId: 'lead-1',
      action: 'leads.auto_assigned',
      diff: { assignedTo: 'user-X', assignedBy: 'system' },
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.tenantId).toBe('tenant-1');
    expect(arg.data.userId).toBeNull();
    expect(arg.data.entity).toBe('Lead');
    expect(arg.data.entityId).toBe('lead-1');
    expect(arg.data.action).toBe('leads.auto_assigned');
    expect(arg.data.diff).toEqual({ assignedTo: 'user-X', assignedBy: 'system' });
  });

  it('Test 2 — actorUserId="admin-1" écrit row avec userId="admin-1" + action="leads.reassigned"', async () => {
    await logLeadEvent({
      tenantId: 'tenant-1',
      actorUserId: 'admin-1',
      targetLeadId: 'lead-2',
      action: 'leads.reassigned',
      diff: { assignedTo: 'user-Y', assignedBy: 'admin-1' },
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.userId).toBe('admin-1');
    expect(arg.data.entity).toBe('Lead');
    expect(arg.data.entityId).toBe('lead-2');
    expect(arg.data.action).toBe('leads.reassigned');
  });

  it('Test 3 — diff omis écrit la row quand même (pas de no-op sur diff vide)', async () => {
    await logLeadEvent({
      tenantId: 'tenant-1',
      actorUserId: 'admin-1',
      targetLeadId: 'lead-3',
      action: 'leads.distribution_config',
      // diff intentionnellement omis
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.action).toBe('leads.distribution_config');
    // diff par défaut = {} (pas undefined, pas null)
    expect(arg.data.diff).toEqual({});
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9 Plan 09-02 Task 2 — Tests server actions Leads.
 *
 * Stratégie de mock (cohérente Phase 7/8) :
 *  - `@qualiof/db`              → prisma mocké (tenant/lead findUnique/findFirst/create/update)
 *  - `@/lib/rbac`               → requireRole mocké
 *  - `./auto-assign-leads`      → autoAssignLead mocké
 *  - `@/lib/lead-notifications` → notifyLeadAssigned mocké
 *  - `@/lib/audit-log`          → logLeadEvent mocké
 *  - `next/cache`               → revalidatePath no-op
 *
 * Coverage (8 cas) :
 *  1. createLead validation : sans personId ni firstName → fieldErrors
 *  2. createLead avec autoAssignLeads=true → autoAssignLead + notifyLeadAssigned(assignedBy=null)
 *  3. createLead avec autoAssignLeads=false → ni autoAssignLead ni notifyLeadAssigned
 *  4. reassignLead lead inexistant (autoAssignLead retourne ok:false) → return ok:false
 *  5. reassignLead OK → autoAssignLead(force:true) + notifyLeadAssigned(assignedBy=user.id)
 *  6. updateLeadStatus NEW → WON : set wonAt=new Date()
 *  7. updateLeadStatus WON → LOST : set wonAt=null
 *  8. updateLeadStatus CONTACTED → QUALIFIED : laisse wonAt inchangé
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    lead: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  UserRole: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL',
    COMPTABLE: 'COMPTABLE',
    LECTEUR: 'LECTEUR',
  },
  LegalForm: {
    SAS: 'SAS',
    SARL: 'SARL',
    SASU: 'SASU',
    EURL: 'EURL',
    SA: 'SA',
    EI: 'EI',
    EIRL: 'EIRL',
    AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR',
    AUTRE: 'AUTRE',
  },
}));

// Mock @/lib/auth AVANT @/lib/rbac pour empêcher la cascade vers `cache()` (React Server Components).
vi.mock('@/lib/auth', () => ({
  lucia: {},
  validateRequest: vi.fn(),
}));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return {
    ...actual,
    requireRole: vi.fn(),
  };
});

vi.mock('../auto-assign-leads', () => ({
  autoAssignLead: vi.fn(),
}));

vi.mock('@/lib/lead-notifications', () => ({
  notifyLeadAssigned: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit-log', () => ({
  logLeadEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { requireRole } from '@/lib/rbac';
import { autoAssignLead } from '../auto-assign-leads';
import { notifyLeadAssigned } from '@/lib/lead-notifications';
import { logLeadEvent } from '@/lib/audit-log';
import { createLead, reassignLead, updateLeadStatus } from '../leads';

const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const leadFindFirst = prisma.lead.findFirst as unknown as ReturnType<typeof vi.fn>;
const leadCreate = prisma.lead.create as unknown as ReturnType<typeof vi.fn>;
const leadUpdate = prisma.lead.update as unknown as ReturnType<typeof vi.fn>;
const requireRoleMock = requireRole as unknown as ReturnType<typeof vi.fn>;
const autoAssignLeadMock = autoAssignLead as unknown as ReturnType<typeof vi.fn>;
const notifyLeadAssignedMock = notifyLeadAssigned as unknown as ReturnType<typeof vi.fn>;
const logLeadEventMock = logLeadEvent as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'admin@test.fr',
  role: 'ADMIN',
  firstName: 'Admin',
  lastName: 'Test',
};

beforeEach(() => {
  tenantFindUnique.mockReset();
  leadFindFirst.mockReset();
  leadCreate.mockReset();
  leadUpdate.mockReset();
  requireRoleMock.mockReset();
  autoAssignLeadMock.mockReset();
  notifyLeadAssignedMock.mockReset();
  notifyLeadAssignedMock.mockResolvedValue(undefined);
  logLeadEventMock.mockReset();
  logLeadEventMock.mockResolvedValue(undefined);

  requireRoleMock.mockResolvedValue(TEST_USER);
});

// ─── createLead ─────────────────────────────────────────────────────────

describe('createLead', () => {
  it('Test 1 — validation : sans personId ni firstName+lastName → fieldErrors', async () => {
    const result = await createLead({
      // ni personId ni firstName+lastName → refine échoue
      source: 'Linkedin',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Validation');
      expect(result.fieldErrors).toBeDefined();
    }
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('Test 2 — autoAssignLeads=true → autoAssignLead + notifyLeadAssigned(assignedBy=null)', async () => {
    tenantFindUnique.mockResolvedValueOnce({ autoAssignLeads: true });
    leadCreate.mockResolvedValueOnce({ id: 'lead-1', ownerUserId: null });
    autoAssignLeadMock.mockResolvedValueOnce({
      ok: true,
      leadId: 'lead-1',
      ownerUserId: 'commercial-1',
      ownerName: 'Alice',
    });

    const result = await createLead({
      firstName: 'Jean',
      lastName: 'Dupont',
      source: 'Linkedin',
    });

    expect(result.ok).toBe(true);
    expect(autoAssignLeadMock).toHaveBeenCalledWith('lead-1');
    expect(notifyLeadAssignedMock).toHaveBeenCalledTimes(1);
    const notifyArg = notifyLeadAssignedMock.mock.calls[0]![0];
    expect(notifyArg.tenantId).toBe('tenant-1');
    expect(notifyArg.leadId).toBe('lead-1');
    expect(notifyArg.ownerUserId).toBe('commercial-1');
    expect(notifyArg.assignedBy).toBeNull();
  });

  it('Test 3 — autoAssignLeads=false → ni autoAssignLead ni notifyLeadAssigned', async () => {
    tenantFindUnique.mockResolvedValueOnce({ autoAssignLeads: false });
    leadCreate.mockResolvedValueOnce({ id: 'lead-1', ownerUserId: null });

    const result = await createLead({
      firstName: 'Jean',
      lastName: 'Dupont',
    });

    expect(result.ok).toBe(true);
    expect(autoAssignLeadMock).not.toHaveBeenCalled();
    expect(notifyLeadAssignedMock).not.toHaveBeenCalled();
  });
});

// ─── reassignLead ───────────────────────────────────────────────────────

describe('reassignLead', () => {
  it('Test 4 — autoAssignLead retourne ok:false → return ok:false', async () => {
    autoAssignLeadMock.mockResolvedValueOnce({
      ok: false,
      leadId: 'lead-x',
      error: 'Lead introuvable',
    });

    const result = await reassignLead('lead-x');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Lead introuvable');
    }
    expect(notifyLeadAssignedMock).not.toHaveBeenCalled();
  });

  it('Test 5 — succès → autoAssignLead(force:true) + notifyLeadAssigned(assignedBy=user.id)', async () => {
    autoAssignLeadMock.mockResolvedValueOnce({
      ok: true,
      leadId: 'lead-1',
      ownerUserId: 'commercial-2',
      ownerName: 'Bob',
    });

    const result = await reassignLead('lead-1');

    expect(result.ok).toBe(true);
    expect(autoAssignLeadMock).toHaveBeenCalledWith('lead-1', { force: true });
    expect(notifyLeadAssignedMock).toHaveBeenCalledTimes(1);
    const notifyArg = notifyLeadAssignedMock.mock.calls[0]![0];
    expect(notifyArg.assignedBy).toBe('user-1'); // user.id
    expect(notifyArg.ownerUserId).toBe('commercial-2');
  });
});

// ─── updateLeadStatus ───────────────────────────────────────────────────

describe('updateLeadStatus', () => {
  it('Test 6 — NEW → WON : set wonAt = new Date()', async () => {
    leadFindFirst.mockResolvedValueOnce({
      id: 'lead-1',
      status: 'NEW',
      wonAt: null,
    });
    leadUpdate.mockResolvedValueOnce({});

    const result = await updateLeadStatus('lead-1', 'WON');

    expect(result.ok).toBe(true);
    expect(leadUpdate).toHaveBeenCalledTimes(1);
    const updateArg = leadUpdate.mock.calls[0]![0];
    expect(updateArg.data.status).toBe('WON');
    expect(updateArg.data.wonAt).toBeInstanceOf(Date);
    expect(logLeadEventMock).toHaveBeenCalledTimes(1);
    expect(logLeadEventMock.mock.calls[0]![0].action).toBe('leads.status.change');
  });

  it('Test 7 — WON → LOST : set wonAt = null', async () => {
    const prevWonAt = new Date('2026-05-01T10:00:00Z');
    leadFindFirst.mockResolvedValueOnce({
      id: 'lead-1',
      status: 'WON',
      wonAt: prevWonAt,
    });
    leadUpdate.mockResolvedValueOnce({});

    const result = await updateLeadStatus('lead-1', 'LOST');

    expect(result.ok).toBe(true);
    const updateArg = leadUpdate.mock.calls[0]![0];
    expect(updateArg.data.status).toBe('LOST');
    expect(updateArg.data.wonAt).toBeNull();
  });

  it('Test 8 — CONTACTED → QUALIFIED : laisse wonAt inchangé', async () => {
    leadFindFirst.mockResolvedValueOnce({
      id: 'lead-1',
      status: 'CONTACTED',
      wonAt: null,
    });
    leadUpdate.mockResolvedValueOnce({});

    const result = await updateLeadStatus('lead-1', 'QUALIFIED');

    expect(result.ok).toBe(true);
    const updateArg = leadUpdate.mock.calls[0]![0];
    expect(updateArg.data.status).toBe('QUALIFIED');
    // wonAt inchangé = passe la valeur d'origine (null ici)
    expect(updateArg.data.wonAt).toBeNull();
  });

  it('Test 9 — lead introuvable → ok:false', async () => {
    leadFindFirst.mockResolvedValueOnce(null);

    const result = await updateLeadStatus('lead-missing', 'WON');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Lead introuvable');
    }
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});

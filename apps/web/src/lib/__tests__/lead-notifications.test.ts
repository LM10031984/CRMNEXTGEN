import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9 Plan 09-02 Task 1 — Tests `notifyLeadAssigned`.
 *
 * Coverage (7 cas) :
 *  1. lead introuvable → return silencieux (pas d'erreur, pas de side-effect)
 *  2. owner introuvable → return silencieux
 *  3. tenant introuvable → return silencieux
 *  4. toggle bell=true → crée 1 Notification ; toggle bell=false → ne crée pas
 *  5. toggle email=true + owner.email → sendMail appelé ; toggle email=false → pas d'appel
 *  6. owner sans email → pas d'appel sendMail même si toggle ON
 *  7. assignedBy=null → AuditLog action='leads.auto_assigned' + userId=null
 *  8. assignedBy='admin-1' → AuditLog action='leads.reassigned' + userId='admin-1'
 *
 * Mocks : prisma (lead/user/tenant.findUnique + notification/auditLog.create),
 * sendMail, loadOfConfig.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    lead: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    tenant: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

// Sprint 3 — notifyLeadAssigned est passé à enqueueMail. Le test mock
// désormais le helper enqueue ; sendMail n'est plus appelé directement.
vi.mock('../mailer-queue/enqueue', () => ({
  enqueueMail: vi.fn().mockResolvedValue({ ok: true, mode: 'dry-run' }),
}));

vi.mock('../of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    siret: '95131909400011',
    rnq: '93 06 10481 06',
    addressFull: '618 bd Jean Maurel, 06140 Vence',
    emailFrom: 'formation@start-academy.fr',
  }),
}));

import { prisma } from '@qualiof/db';
import { enqueueMail } from '../mailer-queue/enqueue';
import { notifyLeadAssigned } from '../lead-notifications';

const leadFindUnique = prisma.lead.findUnique as unknown as ReturnType<typeof vi.fn>;
const userFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const tenantFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const notificationCreate = prisma.notification.create as unknown as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const sendMailMock = enqueueMail as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  leadFindUnique.mockReset();
  userFindUnique.mockReset();
  tenantFindUnique.mockReset();
  notificationCreate.mockReset();
  auditLogCreate.mockReset();
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({ ok: true, mode: 'dry-run' });
});

function mockLead(overrides: Record<string, unknown> = {}) {
  leadFindUnique.mockResolvedValueOnce({
    id: 'lead-1',
    firstName: 'Jean',
    lastName: 'Dupont',
    email: 'jean@example.com',
    source: 'Linkedin',
    person: null,
    interestedProduct: { title: 'IA & Immo' },
    ...overrides,
  });
}

function mockOwner(overrides: Record<string, unknown> = {}) {
  userFindUnique.mockResolvedValueOnce({
    id: 'commercial-1',
    email: 'commercial@example.com',
    firstName: 'Alice',
    lastName: 'Martin',
    ...overrides,
  });
}

function mockTenant(overrides: Record<string, unknown> = {}) {
  tenantFindUnique.mockResolvedValueOnce({
    notifyOnLeadAssignBell: true,
    notifyOnLeadAssignEmail: true,
    ...overrides,
  });
}

describe('notifyLeadAssigned', () => {
  it('Test 1 — lead introuvable → return silencieux (aucun side-effect)', async () => {
    leadFindUnique.mockResolvedValueOnce(null);
    mockOwner();
    mockTenant();

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-missing',
      ownerUserId: 'commercial-1',
      assignedBy: null,
    });

    expect(notificationCreate).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('Test 2 — owner introuvable → return silencieux', async () => {
    mockLead();
    userFindUnique.mockResolvedValueOnce(null);
    mockTenant();

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      ownerUserId: 'missing',
      assignedBy: null,
    });

    expect(notificationCreate).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('Test 3 — toggle bell=true crée Notification, toggle bell=false ne crée pas', async () => {
    mockLead();
    mockOwner();
    mockTenant({ notifyOnLeadAssignBell: false, notifyOnLeadAssignEmail: false });

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      ownerUserId: 'commercial-1',
      assignedBy: null,
    });

    expect(notificationCreate).not.toHaveBeenCalled();
    // Audit toujours écrit
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
  });

  it('Test 4 — toggle bell=true crée Notification avec payload typé', async () => {
    mockLead();
    mockOwner();
    mockTenant({ notifyOnLeadAssignBell: true, notifyOnLeadAssignEmail: false });

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      ownerUserId: 'commercial-1',
      assignedBy: null,
    });

    expect(notificationCreate).toHaveBeenCalledTimes(1);
    const arg = notificationCreate.mock.calls[0]![0];
    expect(arg.data.tenantId).toBe('tenant-1');
    expect(arg.data.userId).toBe('commercial-1');
    expect(arg.data.type).toBe('lead.assigned');
    expect(arg.data.payload.leadId).toBe('lead-1');
    expect(arg.data.payload.prospectName).toBe('Jean Dupont');
    expect(arg.data.payload.source).toBe('Linkedin');
  });

  it('Test 5 — toggle email=true + owner.email appelle sendMail', async () => {
    mockLead();
    mockOwner({ email: 'commercial@example.com' });
    mockTenant({ notifyOnLeadAssignBell: false, notifyOnLeadAssignEmail: true });

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      ownerUserId: 'commercial-1',
      assignedBy: null,
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const arg = sendMailMock.mock.calls[0]![0];
    expect(arg.to).toBe('commercial@example.com');
    expect(arg.subject).toContain('Jean Dupont');
  });

  it('Test 6 — owner sans email → pas d\'appel sendMail même si toggle email ON', async () => {
    mockLead();
    mockOwner({ email: null });
    mockTenant({ notifyOnLeadAssignBell: false, notifyOnLeadAssignEmail: true });

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      ownerUserId: 'commercial-1',
      assignedBy: null,
    });

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('Test 7 — assignedBy=null écrit AuditLog action="leads.auto_assigned" userId=null', async () => {
    mockLead();
    mockOwner();
    mockTenant({ notifyOnLeadAssignBell: false, notifyOnLeadAssignEmail: false });

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      ownerUserId: 'commercial-1',
      assignedBy: null,
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.action).toBe('leads.auto_assigned');
    expect(arg.data.userId).toBeNull();
    expect(arg.data.entity).toBe('Lead');
    expect(arg.data.entityId).toBe('lead-1');
  });

  it('Test 8 — assignedBy="admin-1" écrit AuditLog action="leads.reassigned" userId="admin-1"', async () => {
    mockLead();
    mockOwner();
    mockTenant({ notifyOnLeadAssignBell: false, notifyOnLeadAssignEmail: false });

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      ownerUserId: 'commercial-1',
      assignedBy: 'admin-1',
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const arg = auditLogCreate.mock.calls[0]![0];
    expect(arg.data.action).toBe('leads.reassigned');
    expect(arg.data.userId).toBe('admin-1');
  });

  it('Test 9 — prospectName = person.firstName + person.lastName si person présent', async () => {
    mockLead({
      person: { firstName: 'Marie', lastName: 'Curie' },
      firstName: null,
      lastName: null,
    });
    mockOwner();
    mockTenant({ notifyOnLeadAssignBell: true, notifyOnLeadAssignEmail: false });

    await notifyLeadAssigned({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      ownerUserId: 'commercial-1',
      assignedBy: null,
    });

    const arg = notificationCreate.mock.calls[0]![0];
    expect(arg.data.payload.prospectName).toBe('Marie Curie');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 9 Plan 09-04 Task 1 — Tests `getNotifications` (extension persistées 'lead.assigned')
 * + `markNotificationRead` (single-use atomique scope userId).
 *
 * Coverage (≥6 cas) :
 *  1. Tenant sans notifs persistées → items contient uniquement les 4 kinds dérivés (non-régression Phase 4)
 *  2. User avec 2 notifs `lead.assigned` non-lues → items contient 2 entrées kind='lead.assigned' + id défini
 *  3. Notif payload corrompu (manque leadId) → skip silencieux (Pitfall 6)
 *  4. Notif déjà lue OU notif d'un autre user → filter Prisma where (couvert par le mock returning [])
 *  5. markNotificationRead — succès → updateMany count=1, ok:true
 *  6. markNotificationRead — pas la sienne / déjà lue → updateMany count=0, ok:true (silencieux)
 *  7. markNotificationRead — non authentifié → { ok: false, error }
 *
 * Mocks : @qualiof/db (notification.findMany/updateMany + 3 count) + @/lib/auth (validateRequest).
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    preEnrollment: {
      count: vi.fn(),
    },
    trainingSession: {
      count: vi.fn(),
    },
    person: {
      count: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
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

vi.mock('@/lib/auth', () => ({
  lucia: {},
  validateRequest: vi.fn(),
}));

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { getNotifications } from '../notifications';
import { markNotificationRead } from '../notification-mark-read';

const preEnrollmentCount = prisma.preEnrollment.count as unknown as ReturnType<typeof vi.fn>;
const sessionCount = prisma.trainingSession.count as unknown as ReturnType<typeof vi.fn>;
const personCount = prisma.person.count as unknown as ReturnType<typeof vi.fn>;
const notificationFindMany = prisma.notification.findMany as unknown as ReturnType<typeof vi.fn>;
const notificationUpdateMany = prisma.notification.updateMany as unknown as ReturnType<typeof vi.fn>;
const validateRequestMock = validateRequest as unknown as ReturnType<typeof vi.fn>;

const USER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'user1@test.fr',
};

beforeEach(() => {
  preEnrollmentCount.mockReset();
  sessionCount.mockReset();
  personCount.mockReset();
  notificationFindMany.mockReset();
  notificationUpdateMany.mockReset();
  validateRequestMock.mockReset();

  // Defaults — counts à 0, no notifs persistées
  preEnrollmentCount.mockResolvedValue(0);
  sessionCount.mockResolvedValue(0);
  personCount.mockResolvedValue(0);
  notificationFindMany.mockResolvedValue([]);
});

describe('getNotifications — extension persistées lead.assigned (Plan 09-04)', () => {
  it('Test 1 — tenant sans notifs persistées → uniquement les 4 kinds dérivés', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    preEnrollmentCount.mockResolvedValueOnce(3);
    sessionCount.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    personCount.mockResolvedValueOnce(0);
    notificationFindMany.mockResolvedValueOnce([]);

    const res = await getNotifications();
    expect(res.total).toBe(6); // 3+1+2+0
    // 4 sources possibles, dont 3 valeurs non-nulles → items.length === 3
    expect(res.items.length).toBe(3);
    // Aucun item kind='lead.assigned' car aucune notif persistée
    expect(res.items.some((i) => i.kind === 'lead.assigned')).toBe(false);
  });

  it('Test 2 — 2 notifs lead.assigned non-lues → 2 items kind=lead.assigned avec id défini', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    notificationFindMany.mockResolvedValueOnce([
      {
        id: 'notif-1',
        payload: {
          leadId: '00000000-0000-0000-0000-000000000001',
          prospectName: 'Jean Dupont',
          source: 'salon',
        },
        createdAt: new Date(),
      },
      {
        id: 'notif-2',
        payload: {
          leadId: '00000000-0000-0000-0000-000000000002',
          prospectName: 'Alice Martin',
          source: null,
        },
        createdAt: new Date(),
      },
    ]);

    const res = await getNotifications();
    const leadItems = res.items.filter((i) => i.kind === 'lead.assigned');
    expect(leadItems).toHaveLength(2);
    expect(leadItems[0]!.id).toBe('notif-1');
    expect(leadItems[0]!.label).toContain('Jean Dupont');
    expect(leadItems[0]!.href).toBe('/app/leads/00000000-0000-0000-0000-000000000001');
    expect(leadItems[0]!.count).toBe(1);
    expect(leadItems[0]!.severity).toBe('info');
    expect(leadItems[1]!.id).toBe('notif-2');
    expect(leadItems[1]!.label).toContain('Alice Martin');

    expect(res.total).toBeGreaterThanOrEqual(2);
  });

  it('Test 3 — payload corrompu (manque leadId) → skip silencieux Pitfall 6', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    notificationFindMany.mockResolvedValueOnce([
      {
        id: 'notif-bad',
        payload: { prospectName: 'Anonyme' }, // leadId manquant
        createdAt: new Date(),
      },
      {
        id: 'notif-ok',
        payload: {
          leadId: '00000000-0000-0000-0000-000000000010',
          prospectName: 'OK Person',
        },
        createdAt: new Date(),
      },
    ]);

    const res = await getNotifications();
    const leadItems = res.items.filter((i) => i.kind === 'lead.assigned');
    expect(leadItems).toHaveLength(1);
    expect(leadItems[0]!.id).toBe('notif-ok');
  });

  it('Test 4 — scope where filter Notification.findMany doit inclure userId + readAt:null + type', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    await getNotifications();

    const call = notificationFindMany.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.where.tenantId).toBe('tenant-1');
    expect(call.where.userId).toBe('user-1');
    expect(call.where.readAt).toBeNull();
    expect(call.where.type).toBe('lead.assigned');
    expect(call.orderBy.createdAt).toBe('desc');
    expect(call.take).toBe(10);
  });

  it('Test 5 — non authentifié → { total: 0, items: [] }', async () => {
    validateRequestMock.mockResolvedValue({ user: null, session: null });
    const res = await getNotifications();
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
    expect(notificationFindMany).not.toHaveBeenCalled();
  });
});

describe('markNotificationRead (Plan 09-04 Task 1)', () => {
  it('Test 6 — user marque sa notif → updateMany scope userId + readAt:null, ok:true', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    notificationUpdateMany.mockResolvedValueOnce({ count: 1 });

    const res = await markNotificationRead('notif-1');
    expect(res.ok).toBe(true);
    expect(notificationUpdateMany).toHaveBeenCalledTimes(1);
    const arg = notificationUpdateMany.mock.calls[0]![0];
    expect(arg.where.id).toBe('notif-1');
    expect(arg.where.userId).toBe('user-1');
    expect(arg.where.readAt).toBeNull();
    expect(arg.data.readAt).toBeInstanceOf(Date);
  });

  it('Test 7 — user essaie de marquer notif d\'un autre user → count=0, ok:true silencieux', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    notificationUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await markNotificationRead('notif-not-mine');
    expect(res.ok).toBe(true);
    expect(notificationUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('Test 8 — non authentifié → { ok: false, error }', async () => {
    validateRequestMock.mockResolvedValue({ user: null, session: null });

    const res = await markNotificationRead('notif-1');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('Non authentifié');
    }
    expect(notificationUpdateMany).not.toHaveBeenCalled();
  });
});

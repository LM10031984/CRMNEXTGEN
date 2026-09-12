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
        type: 'lead.assigned',
        payload: {
          leadId: '00000000-0000-0000-0000-000000000001',
          prospectName: 'Jean Dupont',
          source: 'salon',
        },
        createdAt: new Date(),
      },
      {
        id: 'notif-2',
        type: 'lead.assigned',
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
        type: 'lead.assigned',
        payload: { prospectName: 'Anonyme' }, // leadId manquant
        createdAt: new Date(),
      },
      {
        id: 'notif-ok',
        type: 'lead.assigned',
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
    // ⚠ LES DEUX TYPES PERSISTÉS (lot C.3, défaut D-C3-2). Le filtre valait
    // `'lead.assigned'` en dur, alors que le webhook écrivait des lignes
    // `signature.completed` depuis C.3 : la cloche restait muette après le
    // retour d'une convention signée par les deux parties.
    expect(call.where.type).toEqual({ in: ['lead.assigned', 'signature.completed'] });
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

/* ── D-C3-2 — la cloche sonne pour une pièce signée par tous ─────────────── */

/**
 * LE DÉFAUT (recette C.3 du 11/09/2026, étape 10). `prevenirAdmins` écrit une
 * ligne `Notification` de type `signature.completed` par ADMIN dès que le
 * webhook `submission.completed` a ramené le PDF signé ET son certificat —
 * vérifié en base sur l'aperçu. `getNotifications()` ne lisait que
 * `lead.assigned` : la cloche restait muette. Une notification écrite que
 * personne ne lit est pire qu'une notification absente — elle donne l'illusion
 * que le circuit est complet.
 *
 * ⚠ LES DEUX SENS SONT GARDÉS ICI. Que le nouveau type soit lu, et que l'ancien
 * n'ait pas CESSÉ de l'être : un filtre qui remplacerait `lead.assigned` au lieu
 * de l'élargir ferait disparaître les leads assignés sans qu'un écran ne le
 * dise. Les tests 2, 3 et 4 ci-dessus tiennent l'autre moitié.
 */
describe('getNotifications — une pièce signée par tous (lot C.3, D-C3-2)', () => {
  const PIECE_SIGNEE = {
    id: 'notif-sig-1',
    type: 'signature.completed',
    payload: {
      signatureRequestId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      sessionCode: 'SES-0048',
      documentId: '33333333-3333-4333-8333-333333333333',
      docType: 'CONVENTION',
    },
    createdAt: new Date(),
  };

  it('la ligne du webhook devient un item — libellé et destination en toutes lettres', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    notificationFindMany.mockResolvedValueOnce([PIECE_SIGNEE]);

    const res = await getNotifications();
    const items = res.items.filter((i) => i.kind === 'signature.completed');
    expect(items).toHaveLength(1);
    // ⚠ LITTÉRAL des deux côtés : comparer au retour de
    // `libelleSignatureCompletee` collapserait avec lui, et l'assertion ne
    // garderait plus rien (règle n°2 du projet).
    expect(items[0]!.label).toBe('Convention signée par tous les signataires — SES-0048');
    expect(items[0]!.href).toBe('/app/sessions/22222222-2222-4222-8222-222222222222?tab=avant');
    expect(items[0]!.id).toBe('notif-sig-1');
    expect(items[0]!.severity).toBe('info');
    expect(items[0]!.count).toBe(1);
  });

  it('l’attestation d’assiduité mène à l’onglet APRÈS — l’autre la rendrait invisible', async () => {
    // Les panneaux d'onglet inactifs sont rendus `hidden` : ouvrir « Avant »
    // pour une pièce qui vit dans « Après » ne montre aucune pièce du tout.
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    notificationFindMany.mockResolvedValueOnce([
      { ...PIECE_SIGNEE, payload: { ...PIECE_SIGNEE.payload, docType: 'ASSIDUITE' } },
    ]);

    const res = await getNotifications();
    const item = res.items.find((i) => i.kind === 'signature.completed');
    expect(item!.href).toBe('/app/sessions/22222222-2222-4222-8222-222222222222?tab=apres');
    expect(item!.label).toBe(
      "Attestation d'assiduité signée par tous les signataires — SES-0048",
    );
  });

  it('payload sans session : écarté en silence — une cloche sans destination ne sert à rien', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    notificationFindMany.mockResolvedValueOnce([
      { ...PIECE_SIGNEE, payload: { docType: 'CONVENTION' } },
      PIECE_SIGNEE,
    ]);

    const res = await getNotifications();
    const items = res.items.filter((i) => i.kind === 'signature.completed');
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('notif-sig-1');
  });

  it('PUISSANCE — les deux types coexistent : aucun ne chasse l’autre', async () => {
    validateRequestMock.mockResolvedValue({ user: USER, session: null });
    notificationFindMany.mockResolvedValueOnce([
      PIECE_SIGNEE,
      {
        id: 'notif-lead',
        type: 'lead.assigned',
        payload: {
          leadId: '00000000-0000-0000-0000-000000000001',
          prospectName: 'Jean Dupont',
        },
        createdAt: new Date(),
      },
    ]);

    const res = await getNotifications();
    expect(res.items.filter((i) => i.kind === 'signature.completed')).toHaveLength(1);
    expect(res.items.filter((i) => i.kind === 'lead.assigned')).toHaveLength(1);
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

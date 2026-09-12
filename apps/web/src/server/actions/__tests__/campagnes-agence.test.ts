import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * D-22 — une campagne de pré-inscription porte TOUJOURS une agence.
 *
 * Ce que ces tests verrouillent, et qui n'était pas vrai avant la relecture du
 * 10/09/2026 : le formulaire ne portait qu'un libellé libre, si bien qu'une
 * campagne pouvait naître sans client. L'admin recevait alors des dossiers sans
 * savoir de quelle agence ils venaient.
 *
 * Le rattachement canonique est l'agence, et elle seule. Le diagnostic et le
 * lead sont du contexte : jamais des alternatives.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    organization: { findFirst: vi.fn() },
    diagnostic: { findFirst: vi.fn() },
    lead: { findFirst: vi.fn() },
    trainingProduct: { findFirst: vi.fn() },
    enrollmentBatch: { create: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/rbac', () => ({
  requireRole: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import('@qualiof/db');
const { requireRole } = await import('@/lib/rbac');
const { createCampagne } = await import('../campagnes');

const USER = { id: 'u1', tenantId: 't1', role: 'COMMERCIAL' };

const DATES = [
  {
    startsAt: new Date('2026-10-05T09:00:00'),
    endsAt: new Date('2026-10-05T13:00:00'),
    label: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(USER as never);
  // Le mock joue la transaction en passant un `tx` minimal — seuls les deux
  // modèles écrits par `createCampagne` y figurent.
  (prisma.$transaction as unknown as { mockImplementation: (f: unknown) => void })
    .mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        enrollmentBatch: { create: vi.fn().mockResolvedValue({ id: 'b1' }) },
        auditLog: { create: vi.fn() },
      }),
    );
});

describe('createCampagne — l’agence est obligatoire (D-22)', () => {
  it('refuse une campagne sans agence', async () => {
    const r = await createCampagne({
      label: 'RDV sans client',
      dateOptions: DATES,
    } as never);

    expect(r.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse une agence d’un autre tenant, même avec un identifiant valide', async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue(null as never);

    const r = await createCampagne({
      label: 'RDV agence voisine',
      organizationId: '11111111-1111-4111-8111-111111111111',
      dateOptions: DATES,
    });

    expect(r).toEqual({ ok: false, error: 'Agence introuvable' });
    // Le scope tenant est bien dans la requête, pas seulement dans le résultat.
    expect(vi.mocked(prisma.organization.findFirst).mock.calls[0]?.[0]).toMatchObject({
      where: { id: '11111111-1111-4111-8111-111111111111', tenantId: 't1' },
    });
  });

  it('accepte une agence du tenant, sans diagnostic ni lead — le client récurrent', async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: 'org1' } as never);

    const r = await createCampagne({
      label: 'RDV OPTIMMO — octobre',
      organizationId: '11111111-1111-4111-8111-111111111111',
      dateOptions: DATES,
    });

    expect(r.ok).toBe(true);
    expect(r.ok && r.data?.url).toContain('/rdv/');
    expect(prisma.diagnostic.findFirst).not.toHaveBeenCalled();
  });

  it('vérifie aussi le lead quand il est fourni en contexte', async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: 'org1' } as never);
    vi.mocked(prisma.lead.findFirst).mockResolvedValue(null as never);

    const r = await createCampagne({
      label: 'RDV avec lead d’un autre tenant',
      organizationId: '11111111-1111-4111-8111-111111111111',
      leadId: '22222222-2222-4222-8222-222222222222',
      dateOptions: DATES,
    });

    expect(r).toEqual({ ok: false, error: 'Lead introuvable' });
  });
});

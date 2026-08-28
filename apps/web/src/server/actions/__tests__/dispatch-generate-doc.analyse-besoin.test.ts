import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Quick 260821-md8 — chemin MANUEL de la matrice Qualiopi.
 *
 * `dispatchGenerateDoc` est le « générer ce document pour ce stagiaire » de la
 * fiche session. Arrêter la production automatique d'analyses nominatives sans
 * fermer ce chemin laisserait un clic recréer exactement le doublon qu'on vient
 * de supprimer (règle du 12/08, indicateur 4).
 *
 * Le refus est retourné en `{ ok: false, error }` — JAMAIS levé : le dispatch
 * est appelé depuis des boucles UI (`dispatchGenerateMissing`).
 */

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  sessionFindFirst: vi.fn(),
  participantFindFirst: vi.fn(),
  closureBatchCreate: vi.fn(),
  closureJobCreate: vi.fn(),
  enqueueClosureJob: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findFirst: m.sessionFindFirst },
    sessionParticipant: { findFirst: m.participantFindFirst },
    closureBatch: { create: m.closureBatchCreate },
    closureJob: { create: m.closureJobCreate },
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/rbac', () => ({
  requireRole: m.requireRole,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock('../programme-generator', () => ({ generateProgrammeForProduct: vi.fn() }));
vi.mock('../deroule-product-generator', () => ({ generateDerouleForProduct: vi.fn() }));
vi.mock('../generate-checklist-formation', () => ({ generateChecklistForSession: vi.fn() }));
vi.mock('../convention-generator', () => ({ generateConventionForParticipant: vi.fn() }));
vi.mock('../convocation-generator', () => ({ generateConvocationForParticipant: vi.fn() }));
vi.mock('../agefice-generator', () => ({ generateAgeficeForParticipant: vi.fn() }));
vi.mock('../agefice-attendance-generator', () => ({
  generateAgeficeAttendanceForParticipant: vi.fn(),
}));
vi.mock('@/lib/closure/queue-postgres', () => ({ enqueueClosureJob: m.enqueueClosureJob }));

beforeEach(() => {
  vi.clearAllMocks();
  m.requireRole.mockResolvedValue({ id: 'usr-1', tenantId: 'tnt-1' });
  m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', productId: 'prod-1' });
  m.closureBatchCreate.mockResolvedValue({ id: 'batch-1' });
  m.closureJobCreate.mockResolvedValue({ id: 'job-1' });
  m.enqueueClosureJob.mockResolvedValue(undefined);
});

async function dispatch(participantId: string) {
  const { dispatchGenerateDoc } = await import('../dispatch-generate-doc');
  return dispatchGenerateDoc({ sessionId: 'ses-1', docType: 'ANALYSE_BESOIN', participantId });
}

describe('dispatchGenerateDoc — ANALYSE_BESOIN et règle payeur', () => {
  it('refuse une analyse nominative quand le payeur est une personne morale', async () => {
    m.participantFindFirst.mockResolvedValue({
      id: 'sp-1',
      sponsorOrgId: 'org-experta',
      sponsorOrg: { id: 'org-experta', legalName: 'EXPERTA', legalForm: 'SARL' },
    });

    const res = await dispatch('sp-1');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/EXPERTA/);
    expect(res.error).toMatch(/entreprise/i);
    expect(res.error).toMatch(/12\/08/);
    // Aucun job enfilé : pas de doublon du document d'entreprise.
    expect(m.closureBatchCreate).not.toHaveBeenCalled();
    expect(m.closureJobCreate).not.toHaveBeenCalled();
    expect(m.enqueueClosureJob).not.toHaveBeenCalled();
  });

  it('laisse passer un auto-payeur (comportement historique)', async () => {
    m.participantFindFirst.mockResolvedValue({
      id: 'sp-2',
      sponsorOrgId: 'org-ei',
      sponsorOrg: { id: 'org-ei', legalName: 'Alice EI', legalForm: 'AUTO_ENTREPRENEUR' },
    });

    const res = await dispatch('sp-2');

    expect(res.ok).toBe(true);
    expect(res.enqueued).toBe(true);
    expect(m.enqueueClosureJob).toHaveBeenCalledTimes(1);
  });

  it('scope la lecture du participant au tenant ET à la session', async () => {
    m.participantFindFirst.mockResolvedValue({
      id: 'sp-2',
      sponsorOrgId: 'org-ei',
      sponsorOrg: { id: 'org-ei', legalName: 'Alice EI', legalForm: 'EI' },
    });

    await dispatch('sp-2');

    const where = m.participantFindFirst.mock.calls[0]![0].where as Record<string, any>;
    expect(where.id).toBe('sp-2');
    expect(where.sessionId).toBe('ses-1');
    expect(where.session).toEqual({ tenantId: 'tnt-1' });
  });

  it('refuse proprement un participant introuvable, sans lever d’exception', async () => {
    m.participantFindFirst.mockResolvedValue(null);

    const res = await dispatch('sp-inconnu');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/introuvable/i);
    expect(m.enqueueClosureJob).not.toHaveBeenCalled();
  });
});

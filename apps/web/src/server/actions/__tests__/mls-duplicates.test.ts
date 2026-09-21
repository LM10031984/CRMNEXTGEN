import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), merge: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/rbac', () => ({
  requireRole: mocks.requireRole,
  UnauthorizedError: class extends Error {},
  ForbiddenError: class extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }));
vi.mock('@/lib/leads/mls-duplicates-service', () => ({
  mergeMlsDuplicate: mocks.merge,
  MlsDuplicateError: class extends Error {},
}));
import { confirmMlsMerge } from '../mls-duplicates';
const input = {
  keepId: '00000000-0000-4000-8000-000000000001',
  removeId: '00000000-0000-4000-8000-000000000002',
  digest: 'a'.repeat(64),
  confirmed: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ id: 'admin', tenantId: 'tenant' });
  mocks.merge.mockResolvedValue({ keepId: input.keepId, removeId: input.removeId });
});
it('exige le rôle ADMIN et la confirmation explicite avant de lancer la transaction', async () => {
  expect((await confirmMlsMerge({ ...input, confirmed: false })).ok).toBe(false);
  expect(mocks.merge).not.toHaveBeenCalled();
  expect((await confirmMlsMerge(input)).ok).toBe(true);
  expect(mocks.requireRole).toHaveBeenCalledWith(['ADMIN']);
  expect(mocks.merge).toHaveBeenCalledWith(
    expect.objectContaining({
      actor: { id: 'admin', tenantId: 'tenant' },
      keepId: input.keepId,
      removeId: input.removeId,
    }),
  );
});
it('n’exécute aucune fusion sans autorisation et ne révèle pas les erreurs internes', async () => {
  mocks.requireRole.mockRejectedValue(new Error('internal credentials'));
  const r = await confirmMlsMerge(input);
  expect(r.ok).toBe(false);
  expect(JSON.stringify(r)).not.toContain('credentials');
  expect(mocks.merge).not.toHaveBeenCalled();
});

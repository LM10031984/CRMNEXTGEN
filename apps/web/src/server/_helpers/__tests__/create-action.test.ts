import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createAction, ActionError } from '../create-action';

/**
 * Sprint 3 — Tests du helper createAction.
 *
 * On mock `validateRequest` pour simuler les états d'auth/role et vérifier
 * que le wrapper renvoie le bon code d'erreur. Les revalidatePath sont
 * mockés pour ne pas crasher hors contexte Next.
 */

// Mock validateRequest pour piloter l'auth.
const mockValidateRequest = vi.fn();
vi.mock('@/lib/auth', () => ({
  validateRequest: () => mockValidateRequest(),
}));

// revalidatePath crashe hors d'un contexte Next.js Route Handler / Action —
// on mock pour qu'il soit no-op.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

function makeUser(overrides: Partial<{ id: string; role: string; tenantId: string }> = {}) {
  return {
    id: 'user-1',
    role: 'ADMIN',
    tenantId: 'tenant-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    disabledAt: null,
    ...overrides,
  };
}

describe('createAction', () => {
  beforeEach(() => {
    mockValidateRequest.mockReset();
  });

  it('rejette si pas authentifié', async () => {
    mockValidateRequest.mockResolvedValue({ user: null, session: null });
    const action = createAction({
      name: 'test',
      handler: async () => 'never',
    });
    const r = await action();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNAUTHENTICATED');
  });

  it('rejette si rôle non autorisé', async () => {
    mockValidateRequest.mockResolvedValue({
      user: makeUser({ role: 'COMMERCIAL' }),
      session: {},
    });
    const action = createAction({
      name: 'admin-only',
      roles: ['ADMIN'],
      handler: async () => 'never',
    });
    const r = await action();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
  });

  it('rejette si validation Zod échoue', async () => {
    mockValidateRequest.mockResolvedValue({ user: makeUser(), session: {} });
    const action = createAction({
      name: 'with-schema',
      schema: z.object({ email: z.string().email() }),
      handler: async () => 'never',
    });
    const r = await action({ email: 'pas-un-email' } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('VALIDATION');
      expect(r.error).toMatch(/email/);
    }
  });

  it('exécute le handler et retourne data si tout OK', async () => {
    mockValidateRequest.mockResolvedValue({ user: makeUser(), session: {} });
    const action = createAction({
      name: 'ok',
      schema: z.object({ x: z.number() }),
      handler: async ({ input }) => ({ doubled: input.x * 2 }),
    });
    const r = await action({ x: 21 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ doubled: 42 });
  });

  it('transforme un ActionError thrown en réponse propre', async () => {
    mockValidateRequest.mockResolvedValue({ user: makeUser(), session: {} });
    const action = createAction({
      name: 'business-error',
      handler: async () => {
        throw new ActionError('Email déjà utilisé', 'CONFLICT');
      },
    });
    const r = await action();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('CONFLICT');
      expect(r.error).toBe('Email déjà utilisé');
    }
  });

  it('masque les erreurs techniques (ne leak pas le message interne)', async () => {
    mockValidateRequest.mockResolvedValue({ user: makeUser(), session: {} });
    const action = createAction({
      name: 'tech-error',
      handler: async () => {
        throw new Error('Connection to internal-db-master refused at 10.0.0.1');
      },
    });
    const r = await action();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('INTERNAL');
      // Le message client ne doit PAS contenir le détail technique.
      expect(r.error).not.toMatch(/internal-db-master/);
      expect(r.error).not.toMatch(/10\.0\.0\.1/);
    }
  });

  it('passe input typé Zod au handler', async () => {
    mockValidateRequest.mockResolvedValue({ user: makeUser(), session: {} });
    const action = createAction({
      name: 'with-coercion',
      schema: z.object({ count: z.coerce.number() }),
      handler: async ({ input }) => {
        // Vérifie que la coercion Zod s'applique (string "42" → 42 number)
        return typeof input.count === 'number' ? input.count : -1;
      },
    });
    const r = await action({ count: '42' as unknown as number });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(42);
  });
});

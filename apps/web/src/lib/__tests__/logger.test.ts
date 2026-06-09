import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWithContext, getContext, childLogger } from '../logger';

/**
 * Sprint 2 — Tests du logger + AsyncLocalStorage.
 *
 * On vérifie surtout que `runWithContext` propage bien le contexte aux
 * fonctions imbriquées async et qu'on a un fallback propre hors contexte.
 *
 * Note : on ne teste pas le sérialiseur JSON de pino lui-même (déjà couvert
 * par les tests upstream de pino) — on teste l'intégration applicative.
 */

describe('runWithContext / getContext', () => {
  it('expose le contexte courant dans la callback synchrone', () => {
    const result = runWithContext(
      { requestId: 'abc-123', userId: 'u1' },
      () => getContext(),
    );
    expect(result).toEqual({ requestId: 'abc-123', userId: 'u1' });
  });

  it('propage le contexte à travers une chaîne async (await imbriqués)', async () => {
    async function level3() {
      return getContext();
    }
    async function level2() {
      await Promise.resolve();
      return level3();
    }
    async function level1() {
      await Promise.resolve();
      return level2();
    }

    const result = await runWithContext(
      { requestId: 'req-xyz', tenantId: 'tenant-1' },
      () => level1(),
    );
    expect(result?.requestId).toBe('req-xyz');
    expect(result?.tenantId).toBe('tenant-1');
  });

  it('renvoie null hors contexte', () => {
    expect(getContext()).toBeNull();
  });

  it('isole le contexte entre 2 runs concurrents', async () => {
    async function readCtx(): Promise<string | undefined> {
      // Simule un peu d'asynchronie pour que les 2 runs s'entrelacent
      await new Promise((r) => setTimeout(r, 5));
      return getContext()?.requestId;
    }

    const [a, b] = await Promise.all([
      runWithContext({ requestId: 'A' }, () => readCtx()),
      runWithContext({ requestId: 'B' }, () => readCtx()),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});

describe('childLogger', () => {
  it('renvoie un logger avec le scope dans les champs', () => {
    const log = childLogger('test-scope');
    // pino enfant : on peut inspecter `bindings()` pour vérifier
    expect(log.bindings()).toMatchObject({ scope: 'test-scope' });
  });
});

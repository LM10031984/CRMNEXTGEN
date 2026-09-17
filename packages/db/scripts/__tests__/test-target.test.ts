import { describe, expect, it, vi } from 'vitest';
import { assertTestTarget, assertTestDatabaseContent } from '../assert-test-target';

const local = 'postgresql://test:test@127.0.0.1:5432/qualiof_test';
describe('cibles des tests — refus avant toute écriture', () => {
  it.each([undefined, 'postgresql://x:x@db.gntlqyscahbgjrmsbzil.supabase.co/postgres', 'postgresql://x:x@remote.example/qualiof_test', 'postgresql://x:x@localhost/qualiof'])('refuse la cible %s', (databaseUrl) => {
    expect(() => assertTestTarget({ databaseUrl })).toThrow(/REFUS/);
  });
  it('accepte une base dédiée locale et refuse un navigateur distant, même avec cette base', () => {
    expect(() => assertTestTarget({ databaseUrl: local })).not.toThrow();
    expect(() => assertTestTarget({ databaseUrl: local, baseUrl: 'https://qualiof.vercel.app' })).toThrow(/REFUS/);
  });
  it('refuse le contenu Start Academy même derrière une URL locale de test', async () => {
    const db = { tenant: { findMany: vi.fn().mockResolvedValue([{ id: 'db191440-a144-48d1-93c1-767e6f647f2c', name: 'Start Academy' }]) } };
    await expect(assertTestDatabaseContent(db, local)).rejects.toThrow(/Start Academy/);
  });
  it('refuse une base dont les tenants ne sont pas des fixtures identifiées', async () => {
    const db = { tenant: { findMany: vi.fn().mockResolvedValue([{ id: 'real', name: 'Mon organisme' }]) } };
    await expect(assertTestDatabaseContent(db, local)).rejects.toThrow(/fixture/);
  });
  it('accepte une base vide ou exclusivement composée de fixtures', async () => {
    for (const tenants of [[], [{ id: 'test', name: 'E2E-Organisme' }]]) {
      const db = { tenant: { findMany: vi.fn().mockResolvedValue(tenants) } };
      await expect(assertTestDatabaseContent(db, local)).resolves.toBeUndefined();
    }
  });
});

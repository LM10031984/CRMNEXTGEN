import { describe, expect, it, vi } from 'vitest';
import { synchronizeCompanyPriceTx } from '../company-session-price';
import type { Prisma } from '@qualiof/db';
it('repartage 240 € après un troisième inscrit et journalise le nombre réellement modifié', async () => {
  const rows = [{ id: 'a', priceHT: 120, amountCollected: 0 }, { id: 'b', priceHT: 120, amountCollected: 0 }, { id: 'c', priceHT: 0, amountCollected: 0 }];
  const audit = vi.fn();
  const tx = { sessionParticipant: { findMany: vi.fn(async () => rows), updateMany: vi.fn(async ({ where, data }) => { const row = rows.find((p) => p.id === where.id)!; row.priceHT = Number(data.priceHT); return { count: 1 }; }) }, auditLog: { create: audit } };
  const session = { id: 'session', tenantId: 'tenant', regime: 'ENTREPRISE' as const, priceTotalHT: 240 };
  const changed = await synchronizeCompanyPriceTx(tx as unknown as Prisma.TransactionClient, session, 'user');
  expect(changed).toBe(3);
  expect(rows.map((p) => p.priceHT)).toEqual([80, 80, 80]);
  expect(audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ diff: expect.objectContaining({ updated: 3, totalHT: 240 }) }) }));
  expect(await synchronizeCompanyPriceTx(tx as unknown as Prisma.TransactionClient, session, 'user')).toBe(0);
  expect(audit).toHaveBeenCalledTimes(1);
});

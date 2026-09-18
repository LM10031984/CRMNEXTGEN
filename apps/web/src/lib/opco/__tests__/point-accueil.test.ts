import { beforeEach, describe, expect, it, vi } from 'vitest';
const findMany = vi.hoisted(() => vi.fn());
vi.mock('@qualiof/db', () => ({ prisma: { ageficePointAccueil: { findMany } } }));
import { resolveDossierPointAccueil } from '../point-accueil';
const pa = (id: string, numberPta: string) => ({
  id,
  name: `CCI ${id}`,
  numberPta,
  email: `${id}@example.org`,
  department: '06',
  departmentsServed: ['06'],
});
beforeEach(() => findMany.mockReset());
describe('routage CFP', () => {
  it('reconnaît les deux casses historiques du code postal', async () => {
    findMany.mockResolvedValue([pa('a', '1')]);
    for (const key of ['Code Postal (Entreprise)', 'Code postal (Entreprise)']) {
      const r = await resolveDossierPointAccueil({ id: 'p', paFields: { [key]: '06000' } });
      expect(r.department).toBe('06');
      expect(r.selected?.id).toBe('a');
    }
  });
  it('ne choisit jamais arbitrairement entre plusieurs points du département', async () => {
    findMany.mockResolvedValue([pa('a', '1'), pa('b', '2')]);
    const r = await resolveDossierPointAccueil({
      id: 'p',
      paFields: { 'Code Postal (Entreprise)': '06000' },
    });
    expect(r.selected).toBeNull();
    expect(r.options).toHaveLength(2);
  });
  it('reprend une référence PTA exacte importée et uniquement unique', async () => {
    findMany.mockResolvedValue([pa('a', '1'), pa('b', '2')]);
    expect(
      (
        await resolveDossierPointAccueil({
          id: 'p',
          paFields: { 'Code Postal (Entreprise)': '06000', 'N° de PTA': '2' },
        })
      ).selected?.id,
    ).toBe('b');
  });
  it('respecte le choix mémorisé et ne déduit rien sans département', async () => {
    const selected = pa('b', '2');
    expect(
      (
        await resolveDossierPointAccueil({
          id: 'p',
          paFields: {},
          pointAccueil: selected,
          pointAccueilLockedManually: true,
        })
      ).selected,
    ).toEqual(selected);
    expect((await resolveDossierPointAccueil({ id: 'p', paFields: {} })).selected).toBeNull();
  });
});

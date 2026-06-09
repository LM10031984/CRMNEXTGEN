import { describe, it, expect } from 'vitest';
import nextConfig from '../../../../next.config.mjs';

/**
 * Phase 12 Plan 12-01 — D-02 reverse alias
 *
 * Wave 0 (TDD RED → GREEN) :
 *  - RED avant Task 2 : les 2 nouveaux redirects D-02 n'existent pas encore.
 *  - GREEN après Task 2 : `/app/preinscriptions(/:path*)` → `/app/inscriptions(/:path*)` (308).
 *
 * Préservation : les redirects historiques BUG-03 doivent rester en place
 * (chaîne `pre-inscriptions → preinscriptions → inscriptions` OK pour browser).
 */
describe('next.config.mjs redirects — Phase 12 D-02 reverse alias', () => {
  it('redirige /app/preinscriptions → /app/inscriptions (308)', async () => {
    const list = await nextConfig.redirects();
    expect(list).toContainEqual(
      expect.objectContaining({
        source: '/app/preinscriptions',
        destination: '/app/inscriptions',
        permanent: true,
      }),
    );
  });

  it('redirige /app/preinscriptions/:path* → /app/inscriptions/:path*', async () => {
    const list = await nextConfig.redirects();
    expect(list).toContainEqual(
      expect.objectContaining({
        source: '/app/preinscriptions/:path*',
        destination: '/app/inscriptions/:path*',
        permanent: true,
      }),
    );
  });

  it('préserve les redirects historiques BUG-03 (chaîne pre-inscriptions → preinscriptions → inscriptions OK pour browser)', async () => {
    const list = await nextConfig.redirects();
    expect(list).toContainEqual(
      expect.objectContaining({
        source: '/app/pre-inscriptions',
        destination: '/app/preinscriptions',
      }),
    );
    expect(list).toContainEqual(
      expect.objectContaining({
        source: '/app/modeles',
        destination: '/app/templates',
      }),
    );
  });
});

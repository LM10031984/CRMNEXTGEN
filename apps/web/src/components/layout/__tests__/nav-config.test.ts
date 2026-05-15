import { describe, it, expect } from 'vitest';
import { NAV, filterNavForRole, type NavSection } from '../nav-config';

/**
 * Tests `filterNavForRole` — Phase 8 Plan 08-04 Task 1 (D-07 sidebar filter visuel).
 *
 * La fonction est PURE (pas d'I/O, pas d'état) — testable en isolation.
 * Les permissions canoniques sont définies dans `packages/shared/src/constants/permissions.ts`
 * (D-02 matrice). `nav-config.ts` reflète cette matrice via `allowedRoles` par item.
 *
 * Sécurité : le filtre est UNIQUEMENT visuel — la vraie sécurité est `requireRole`
 * côté server actions (D-08).
 */
describe('filterNavForRole (Plan 08-04 — D-07 sidebar filter)', () => {
  it('returns all sections + items for ADMIN (most permissive role)', () => {
    const filtered = filterNavForRole(NAV, 'ADMIN');
    expect(filtered.length).toBeGreaterThan(0);
    const allItems = filtered.flatMap((s) => s.items.map((i) => i.href));
    // ADMIN-only items doivent apparaître
    expect(allItems).toContain('/app/parametres/utilisateurs');
    expect(allItems).toContain('/app/parametres/historique');
    expect(allItems).toContain('/app/parametres');
    // Items "neutres" (sans allowedRoles) doivent aussi apparaître
    expect(allItems).toContain('/app');
    expect(allItems).toContain('/app/sessions');
    expect(allItems).toContain('/app/apprenants');
  });

  it('hides Utilisateurs + Historique + Paramètres for LECTEUR (D-02 row "—")', () => {
    const filtered = filterNavForRole(NAV, 'LECTEUR');
    const allItems = filtered.flatMap((s) => s.items.map((i) => i.href));
    expect(allItems).not.toContain('/app/parametres/utilisateurs');
    expect(allItems).not.toContain('/app/parametres/historique');
    expect(allItems).not.toContain('/app/parametres');
  });

  it('hides Factures for FORMATEUR (D-02 invoices=— for FORMATEUR)', () => {
    const filtered = filterNavForRole(NAV, 'FORMATEUR');
    const allItems = filtered.flatMap((s) => s.items.map((i) => i.href));
    expect(allItems).not.toContain('/app/factures');
  });

  it('hides Leads for non-(ADMIN/MANAGER/COMMERCIAL) roles', () => {
    for (const role of ['FORMATEUR', 'COMPTABLE', 'LECTEUR'] as const) {
      const filtered = filterNavForRole(NAV, role);
      const allItems = filtered.flatMap((s) => s.items.map((i) => i.href));
      expect(allItems, `Leads should be hidden for ${role}`).not.toContain('/app/leads');
    }
  });

  it('hides Pré-inscriptions for non-(ADMIN/MANAGER/COMMERCIAL) roles', () => {
    for (const role of ['FORMATEUR', 'COMPTABLE', 'LECTEUR'] as const) {
      const filtered = filterNavForRole(NAV, role);
      const allItems = filtered.flatMap((s) => s.items.map((i) => i.href));
      expect(allItems, `Préinscriptions should be hidden for ${role}`).not.toContain(
        '/app/preinscriptions',
      );
    }
  });

  it('drops sections that become empty after filtering (no zombie titles)', () => {
    const filtered = filterNavForRole(NAV, 'LECTEUR');
    for (const section of filtered) {
      expect(
        section.items.length,
        `section "${section.title ?? '<no title>"' }" must not be empty after filter`,
      ).toBeGreaterThan(0);
    }
  });

  it('does NOT mutate the source NAV array (immutability)', () => {
    const originalLength = NAV.length;
    const originalSection0Items = NAV[0]!.items.length;
    filterNavForRole(NAV, 'LECTEUR');
    expect(NAV.length).toBe(originalLength);
    expect(NAV[0]!.items.length).toBe(originalSection0Items);
  });

  it('preserves item ordering within each section', () => {
    const filtered = filterNavForRole(NAV, 'ADMIN');
    // L'ADMIN voit tout, donc l'ordre doit être strictement identique à NAV
    expect(filtered.map((s) => s.items.map((i) => i.href))).toEqual(
      NAV.map((s) => s.items.map((i) => i.href)),
    );
  });

  it('keeps items without allowedRoles for ALL 6 roles (default = visible)', () => {
    // Dashboard, Apprenants, Sessions, Produits, Organisations, Templates, Inscriptions
    // n'ont pas allowedRoles → visibles pour tous.
    const universalItems = ['/app', '/app/apprenants', '/app/sessions'];
    for (const role of [
      'ADMIN',
      'MANAGER',
      'COMMERCIAL',
      'FORMATEUR',
      'COMPTABLE',
      'LECTEUR',
    ] as const) {
      const filtered = filterNavForRole(NAV, role);
      const allItems = filtered.flatMap((s) => s.items.map((i) => i.href));
      for (const href of universalItems) {
        expect(allItems, `${href} should be visible for ${role}`).toContain(href);
      }
    }
  });

  it('accepts an empty nav array gracefully', () => {
    const empty: NavSection[] = [];
    expect(filterNavForRole(empty, 'ADMIN')).toEqual([]);
  });
});

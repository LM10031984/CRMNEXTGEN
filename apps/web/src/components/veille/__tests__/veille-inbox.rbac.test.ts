import { describe, it, expect } from 'vitest';
import { shouldShowInbox } from '../../../app/app/veille/page-helpers';

/**
 * D-03 (Phase 13 Plan 13-03) — LECTEUR strictement masqué pour l'onglet inbox.
 *
 * Test du helper pur `shouldShowInbox(user)` qui pilote :
 *  1. Le rendu côté serveur (page.tsx ignore tab=inbox si LECTEUR)
 *  2. Le rendu côté client (VeilleTabsClient prop canSeeInbox)
 *
 * Defense-in-depth : si LECTEUR demande explicitement ?tab=inbox dans l'URL,
 * la page redirect vers ?tab=indic_23 — testé via page.smoke.test.ts Test 3.
 *
 * Pattern helper isolé cohérent avec `filterNavForRole` (Phase 8 nav-config.ts).
 */

describe('shouldShowInbox (D-03 — LECTEUR strictement masqué)', () => {
  it('Test 1 — returns false for LECTEUR (inbox masqué)', () => {
    expect(shouldShowInbox({ role: 'LECTEUR' } as any)).toBe(false);
  });

  it('Test 2 — returns true for ADMIN (inbox visible)', () => {
    expect(shouldShowInbox({ role: 'ADMIN' } as any)).toBe(true);
  });

  it('Test 3 — returns true for MANAGER (inbox visible)', () => {
    expect(shouldShowInbox({ role: 'MANAGER' } as any)).toBe(true);
  });

  it('Test 4 — returns false for null user (pas de session)', () => {
    expect(shouldShowInbox(null)).toBe(false);
  });

  it('Test 5 — returns false for COMMERCIAL/COMPTABLE/FORMATEUR (D-03 strict)', () => {
    expect(shouldShowInbox({ role: 'COMMERCIAL' } as any)).toBe(false);
    expect(shouldShowInbox({ role: 'COMPTABLE' } as any)).toBe(false);
    expect(shouldShowInbox({ role: 'FORMATEUR' } as any)).toBe(false);
  });
});

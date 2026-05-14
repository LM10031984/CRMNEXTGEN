import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveOfConfig, getOfConfig } from '../of-config';

/**
 * Tests Phase 7 (Plan 07-01 Task 2) — vérifie la stratégie hybride
 * BDD-fallback-ENV de `resolveOfConfig` (helper pur).
 *
 * Ne teste PAS `loadOfConfig(tenantId)` directement (requiert Prisma mock /
 * BDD live), mais le helper sous-jacent qui implémente la logique métier.
 */

// Shape minimal compatible avec TenantInput de of-config.ts
type T = Parameters<typeof resolveOfConfig>[0];

const baseEnv = {
  OF_NAME: 'Start Academy ENV',
  OF_SIRET: '12345678901234',
  OF_RNQ: '93 06 ENV',
  OF_ADDRESS_STREET: '1 rue ENV',
  OF_ADDRESS_CP: '06000',
  OF_ADDRESS_VILLE: 'Nice',
  OF_PHONE: '0400000000',
  OF_EMAIL: 'env@example.com',
  OF_IBAN: 'FR76ENV',
  OF_BIC: 'BICENV',
};

beforeEach(() => {
  for (const [k, v] of Object.entries(baseEnv)) {
    vi.stubEnv(k, v);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveOfConfig — BDD fallback ENV (D-01 hybrid)', () => {
  it('Test 1 — resolveOfConfig(null) retourne tous champs depuis ENV (legacy mode)', () => {
    const cfg = resolveOfConfig(null);
    expect(cfg.name).toBe('Start Academy ENV');
    expect(cfg.siret).toBe('12345678901234');
    expect(cfg.rnq).toBe('93 06 ENV');
    expect(cfg.addressStreet).toBe('1 rue ENV');
    expect(cfg.iban).toBe('FR76ENV');
    expect(cfg.bic).toBe('BICENV');
    expect(cfg.invoicePrefix).toBe('FAC'); // fallback default
  });

  it('Test 2 — siret BDD non-null prime sur ENV', () => {
    const tenant = { siret: '99999999999999' } as T;
    expect(resolveOfConfig(tenant).siret).toBe('99999999999999');
  });

  it('Test 2bis — siret BDD null → fallback ENV', () => {
    const tenant = { siret: null } as T;
    expect(resolveOfConfig(tenant).siret).toBe('12345678901234');
  });

  it('Test 3 — iban BDD non-null prime sur ENV', () => {
    const tenant = { iban: 'FR76BDD' } as T;
    expect(resolveOfConfig(tenant).iban).toBe('FR76BDD');
  });

  it('Test 3bis — iban BDD null → fallback ENV', () => {
    expect(resolveOfConfig({} as T).iban).toBe('FR76ENV');
  });

  it('Test 4 — emailFrom BDD non-null prime sur ENV (OF_EMAIL)', () => {
    const tenant = { emailFrom: 'custom@start-academy.fr' } as T;
    expect(resolveOfConfig(tenant).emailFrom).toBe('custom@start-academy.fr');
  });

  it('Test 4bis — emailFrom BDD null → fallback OF_EMAIL', () => {
    expect(resolveOfConfig({} as T).emailFrom).toBe('env@example.com');
  });

  it('Test 5 — address Json parsé : street/cp/ville depuis BDD prime sur ENV', () => {
    const tenant = {
      address: { street: '42 BDD street', postalCode: '06200', city: 'Cagnes' },
    } as unknown as T;
    const cfg = resolveOfConfig(tenant);
    expect(cfg.addressStreet).toBe('42 BDD street');
    expect(cfg.addressCp).toBe('06200');
    expect(cfg.addressVille).toBe('Cagnes');
    expect(cfg.addressFull).toBe('42 BDD street, 06200 Cagnes');
  });

  it('Test 5bis — address Json absent → fallback ENV', () => {
    const cfg = resolveOfConfig({} as T);
    expect(cfg.addressStreet).toBe('1 rue ENV');
    expect(cfg.addressCp).toBe('06000');
    expect(cfg.addressVille).toBe('Nice');
  });

  it('Test 5ter — address Json forme alternative (cp / ville) acceptée', () => {
    // Compat ascendante : ancienne forme {street, cp, ville} sans postalCode/city
    const tenant = {
      address: { street: '7 BDD', cp: '06100', ville: 'Cannes' },
    } as unknown as T;
    const cfg = resolveOfConfig(tenant);
    expect(cfg.addressCp).toBe('06100');
    expect(cfg.addressVille).toBe('Cannes');
  });

  it("Test 6 — getOfConfig() (legacy sync) délègue à resolveOfConfig(null)", () => {
    const a = getOfConfig();
    const b = resolveOfConfig(null);
    expect(a).toEqual(b);
  });

  it('Test 7 — champs trim() : espaces vides traités comme null', () => {
    const tenant = { siret: '   ', iban: '  ' } as T;
    const cfg = resolveOfConfig(tenant);
    expect(cfg.siret).toBe('12345678901234'); // fallback ENV car BDD = whitespace
    expect(cfg.iban).toBe('FR76ENV');
  });

  it('Test 8 — invoicePrefix : BDD prime, sinon fallback "FAC"', () => {
    expect(resolveOfConfig({ invoicePrefix: 'INV' } as T).invoicePrefix).toBe('INV');
    expect(resolveOfConfig({ invoicePrefix: null } as T).invoicePrefix).toBe('FAC');
    expect(resolveOfConfig(null).invoicePrefix).toBe('FAC');
  });

  it('Test 9 — legalForm / legalMentions / rcs / logoPath fallback ENV manquant → string vide', () => {
    // Pas d'ENV correspondant configuré dans baseEnv → fallback = ''
    const cfg = resolveOfConfig(null);
    expect(cfg.legalForm).toBe('');
    expect(cfg.legalMentions).toBe('');
    expect(cfg.rcs).toBe('');
    expect(cfg.logoPath).toBe('');
  });

  it('Test 10 — logoPath / signaturePedagoPath / signatureDirigeantPath BDD prime', () => {
    const tenant = {
      logoPath: '/of-assets/abc/logo.png',
      signaturePedagoPath: '/of-assets/abc/signature-pedago.png',
      signatureDirigeantPath: '/of-assets/abc/signature-dirigeant.png',
    } as T;
    const cfg = resolveOfConfig(tenant);
    expect(cfg.logoPath).toBe('/of-assets/abc/logo.png');
    expect(cfg.signaturePedagoPath).toBe('/of-assets/abc/signature-pedago.png');
    expect(cfg.signatureDirigeantPath).toBe('/of-assets/abc/signature-dirigeant.png');
  });
});

import { describe, it, expect } from 'vitest';
import {
  tenantIdentitySchema,
  tenantAddressSchema,
  tenantBillingSchema,
  tenantEmailSchema,
} from '../tenant';

/**
 * Tests Phase 7 Plan 07-02 Task 1 — schémas Zod Paramètres OF.
 *
 * Coverage :
 * - tenantIdentitySchema : SIRET Luhn, champs nullables (numDA, rcs, legalForm)
 * - tenantAddressSchema : address optional/nullable, legalMentions max 2000 chars
 * - tenantBillingSchema : invoicePrefix MAJ 2-5 lettres, IBAN FR (espaces tolérés), BIC 8/11 chars
 * - tenantEmailSchema : emailFrom email ou chaîne vide
 */

describe('tenantIdentitySchema', () => {
  it('Test 1 — accepte un Tenant avec SIRET réel valide (Luhn)', () => {
    // SIRET '81423718600030' (Aurélie Bergé, déjà utilisé dans siret.test.ts) — passe Luhn.
    // Note plan-vs-réalité : le plan référence '83209458800018' qui ne passe PAS Luhn (sum=53).
    // Voir SUMMARY > Deviations.
    const parsed = tenantIdentitySchema.parse({
      name: 'Start Academy',
      siret: '81423718600030',
    });
    expect(parsed.name).toBe('Start Academy');
    expect(parsed.siret).toBe('81423718600030');
  });

  it('Test 2 — rejette un SIRET invalide via Luhn', () => {
    const result = tenantIdentitySchema.safeParse({
      name: 'X',
      siret: '12345',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.siret).toBeDefined();
      expect(fieldErrors.siret?.length).toBeGreaterThan(0);
    }
  });

  it('Test 3 — accepte tous les champs nullables à null', () => {
    const parsed = tenantIdentitySchema.parse({
      name: 'X',
      siret: null,
      numDA: null,
      rcs: null,
      legalForm: null,
    });
    expect(parsed.name).toBe('X');
    expect(parsed.siret).toBeNull();
  });
});

describe('tenantAddressSchema', () => {
  it('Test 4 — accepte une adresse complète + mentions légales', () => {
    const parsed = tenantAddressSchema.parse({
      address: { street: '12 rue X', postalCode: '75001', city: 'Paris' },
      legalMentions: 'Mentions légales standards de Start Academy.',
    });
    expect(parsed.legalMentions).toMatch(/Start Academy/);
    expect(parsed.address?.street).toBe('12 rue X');
  });

  it('Test 5 — rejette legalMentions > 2000 caractères', () => {
    const result = tenantAddressSchema.safeParse({
      legalMentions: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.legalMentions).toBeDefined();
    }
  });
});

describe('tenantBillingSchema', () => {
  it('Test 6 — IBAN FR avec espaces normalisé + BIC 8 chars', () => {
    const parsed = tenantBillingSchema.parse({
      invoicePrefix: 'FAC',
      iban: 'FR76 1234 5678 9012 3456 7890 123',
      bic: 'BNPAFRPP',
    });
    expect(parsed.iban).toBe('FR7612345678901234567890123');
    expect(parsed.bic).toBe('BNPAFRPP');
    expect(parsed.invoicePrefix).toBe('FAC');
  });

  it('Test 7 — rejette invoicePrefix minuscules', () => {
    const result = tenantBillingSchema.safeParse({
      invoicePrefix: 'fac',
      iban: '',
      bic: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.invoicePrefix).toBeDefined();
    }
  });

  it('Test 8 — rejette invoicePrefix trop long + IBAN/BIC invalides', () => {
    const result = tenantBillingSchema.safeParse({
      invoicePrefix: 'TOOLONG',
      iban: 'FRX',
      bic: 'X',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fe = result.error.flatten().fieldErrors;
      // Au moins l'un des trois champs doit échouer
      expect(fe.invoicePrefix || fe.iban || fe.bic).toBeDefined();
    }
  });

  it('Test 9 — IBAN et BIC nullables (acceptés à null)', () => {
    const parsed = tenantBillingSchema.parse({
      invoicePrefix: 'INV',
      iban: null,
      bic: null,
    });
    expect(parsed.iban).toBeNull();
    expect(parsed.bic).toBeNull();
    expect(parsed.invoicePrefix).toBe('INV');
  });
});

describe('tenantEmailSchema', () => {
  it("Test 10 — accepte un email valide formation@start-academy.fr", () => {
    const parsed = tenantEmailSchema.parse({
      emailFrom: 'formation@start-academy.fr',
    });
    expect(parsed.emailFrom).toBe('formation@start-academy.fr');
  });

  it("Test 11 — accepte une chaîne vide pour emailFrom", () => {
    const parsed = tenantEmailSchema.parse({ emailFrom: '' });
    expect(parsed.emailFrom).toBe('');
  });

  it("Test 12 — rejette un email malformé", () => {
    const result = tenantEmailSchema.safeParse({ emailFrom: 'not-an-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.emailFrom).toBeDefined();
    }
  });
});

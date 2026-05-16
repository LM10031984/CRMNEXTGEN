/**
 * Phase 9 Plan 09-01 Task 2 — tests Zod lead schemas.
 *
 * Coverage :
 *  - CreateLeadSchema : refine personId XOR firstName+lastName, email '' → null, status default
 *  - DistributionConfigSchema : 3 booleans strict (pas de coercion)
 *  - LeadAssignedPayloadSchema : UUID strict + prospectName non-vide
 */

import { describe, it, expect } from 'vitest';
import {
  CreateLeadSchema,
  DistributionConfigSchema,
  LeadAssignedPayloadSchema,
} from '@qualiof/shared';

describe('CreateLeadSchema', () => {
  it('Test 1 — accepte un input avec personId seul', () => {
    const r = CreateLeadSchema.safeParse({
      personId: '11111111-1111-1111-1111-111111111111',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('NEW');
      expect(r.data.priority).toBe('MEDIUM');
    }
  });

  it('Test 2 — accepte un input avec firstName + lastName', () => {
    const r = CreateLeadSchema.safeParse({ firstName: 'Jean', lastName: 'Dupont' });
    expect(r.success).toBe(true);
  });

  it('Test 3 — refuse un input sans personId ni nom+prénom', () => {
    const r = CreateLeadSchema.safeParse({ source: 'Salon' });
    expect(r.success).toBe(false);
  });

  it('Test 4 — refuse firstName seul (sans lastName)', () => {
    const r = CreateLeadSchema.safeParse({ firstName: 'Jean' });
    expect(r.success).toBe(false);
  });

  it('Test 5 — transforme email vide en null', () => {
    const r = CreateLeadSchema.safeParse({ firstName: 'A', lastName: 'B', email: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe(null);
  });

  it('Test 6 — refuse email invalide', () => {
    const r = CreateLeadSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      email: 'pas-un-email',
    });
    expect(r.success).toBe(false);
  });
});

describe('DistributionConfigSchema', () => {
  it('Test 7 — exige 3 booleans stricts', () => {
    expect(
      DistributionConfigSchema.safeParse({
        autoAssignLeads: true,
        notifyOnLeadAssignEmail: true,
        notifyOnLeadAssignBell: false,
      }).success,
    ).toBe(true);

    // Champs manquants → refus
    expect(
      DistributionConfigSchema.safeParse({ autoAssignLeads: true }).success,
    ).toBe(false);

    // Coercion string→boolean rejetée
    expect(
      DistributionConfigSchema.safeParse({
        autoAssignLeads: 'true',
        notifyOnLeadAssignEmail: true,
        notifyOnLeadAssignBell: true,
      }).success,
    ).toBe(false);
  });
});

describe('LeadAssignedPayloadSchema', () => {
  it('Test 8a — accepte payload typé complet', () => {
    const r = LeadAssignedPayloadSchema.safeParse({
      leadId: '11111111-1111-1111-1111-111111111111',
      prospectName: 'Jean Dupont',
      source: 'Linkedin',
    });
    expect(r.success).toBe(true);
  });

  it('Test 8b — refuse leadId non-UUID', () => {
    const r = LeadAssignedPayloadSchema.safeParse({ leadId: 'abc', prospectName: 'X' });
    expect(r.success).toBe(false);
  });

  it('Test 8c — accepte source null/absent', () => {
    const r1 = LeadAssignedPayloadSchema.safeParse({
      leadId: '11111111-1111-1111-1111-111111111111',
      prospectName: 'X',
      source: null,
    });
    expect(r1.success).toBe(true);

    const r2 = LeadAssignedPayloadSchema.safeParse({
      leadId: '11111111-1111-1111-1111-111111111111',
      prospectName: 'X',
    });
    expect(r2.success).toBe(true);
  });
});

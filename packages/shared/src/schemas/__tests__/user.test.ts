import { describe, it, expect } from 'vitest';
import {
  inviteUserSchema,
  setPasswordSchema,
  changeUserRoleSchema,
} from '../user';

/**
 * Tests Phase 8 Plan 08-01 Task 2 — schémas Zod utilisateurs.
 *
 * Coverage :
 *  - inviteUserSchema : lowercase email, validation email/firstName/role,
 *    rejet rôle inconnu
 *  - setPasswordSchema : longueur 8 chars min, égalité password/confirm
 *  - changeUserRoleSchema : userId UUID strict, role enum strict
 */

describe('inviteUserSchema', () => {
  it('Test 1 — accepte un input valide et normalise email (lowercase + trim)', () => {
    const r = inviteUserSchema.parse({
      email: '  A@B.FR  ',
      firstName: 'Jean',
      lastName: 'Dupont',
      role: 'COMMERCIAL',
    });
    expect(r.email).toBe('a@b.fr');
    expect(r.firstName).toBe('Jean');
    expect(r.role).toBe('COMMERCIAL');
  });

  it('Test 2 — rejette email invalide', () => {
    expect(() =>
      inviteUserSchema.parse({
        email: 'bad-email',
        firstName: 'X',
        lastName: 'Y',
        role: 'ADMIN',
      }),
    ).toThrow();
  });

  it('Test 3 — rejette firstName vide', () => {
    expect(() =>
      inviteUserSchema.parse({
        email: 'a@b.fr',
        firstName: '',
        lastName: 'Y',
        role: 'ADMIN',
      }),
    ).toThrow();
  });

  it('Test 4 — rejette rôle inconnu', () => {
    // Cast `unknown` plutôt que `@ts-expect-error` car parse() accepte
    // `Record<string, unknown>` côté input — l'erreur est runtime, pas compile-time.
    expect(() =>
      inviteUserSchema.parse({
        email: 'a@b.fr',
        firstName: 'A',
        lastName: 'B',
        role: 'GOD' as unknown,
      }),
    ).toThrow();
  });
});

describe('setPasswordSchema', () => {
  it('Test 5 — rejette MDP < 8 caractères', () => {
    expect(() =>
      setPasswordSchema.parse({ password: 'short', confirm: 'short' }),
    ).toThrow();
  });

  it('Test 6 — rejette confirmation différente', () => {
    expect(() =>
      setPasswordSchema.parse({
        password: 'longenough',
        confirm: 'longenougB', // note: B vs h
      }),
    ).toThrow();
  });

  it('Test 7 — accepte MDP ≥ 8 chars + confirm égal', () => {
    const r = setPasswordSchema.parse({
      password: 'longenough',
      confirm: 'longenough',
    });
    expect(r.password).toBe('longenough');
  });
});

describe('changeUserRoleSchema', () => {
  it('Test 8 — rejette userId non-UUID', () => {
    expect(() =>
      changeUserRoleSchema.parse({ userId: 'not-a-uuid', role: 'ADMIN' }),
    ).toThrow();
  });

  it('Test 9 — accepte UUID valide + role valide', () => {
    const r = changeUserRoleSchema.parse({
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'MANAGER',
    });
    expect(r.userId).toBe('00000000-0000-4000-8000-000000000001');
    expect(r.role).toBe('MANAGER');
  });

  it('Test 10 — rejette role inconnu même avec UUID valide', () => {
    // Cast `unknown` plutôt que `@ts-expect-error` car parse() accepte
    // `Record<string, unknown>` côté input — l'erreur est runtime, pas compile-time.
    expect(() =>
      changeUserRoleSchema.parse({
        userId: '00000000-0000-4000-8000-000000000001',
        role: 'SUPERUSER' as unknown,
      }),
    ).toThrow();
  });
});

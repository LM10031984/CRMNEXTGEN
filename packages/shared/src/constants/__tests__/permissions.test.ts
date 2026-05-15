import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  canRead,
  canWrite,
  rolesWithAccess,
} from '../permissions';

/**
 * Tests Phase 8 Plan 08-01 Task 2 — matrice RBAC (D-02 CONTEXT.md).
 *
 * Coverage :
 *  - structure : 16 sections présentes, tous les rôles connus
 *  - canRead/canWrite : exemples ADMIN/LECTEUR/COMMERCIAL aligned with D-02 table
 *  - rolesWithAccess : section 'users' RW = ADMIN only ; section 'sessions' R = 6 rôles
 */

describe('PERMISSIONS matrix structure', () => {
  it('contient les 16 sections D-02', () => {
    const sections = Object.keys(PERMISSIONS);
    expect(sections).toHaveLength(16);
    // Sample d'au moins ADMIN + une section critique
    expect(PERMISSIONS.dashboard.ADMIN).toBe('RW');
    expect(PERMISSIONS.users.ADMIN).toBe('RW');
    expect(PERMISSIONS.auditHistory.ADMIN).toBe('R');
  });
});

describe('canRead', () => {
  it('ADMIN peut lire toutes les sections sensibles', () => {
    expect(canRead('ADMIN', 'users')).toBe(true);
    expect(canRead('ADMIN', 'tenantSettings')).toBe(true);
    expect(canRead('ADMIN', 'auditHistory')).toBe(true);
  });

  it('LECTEUR ne peut PAS lire users / tenantSettings / auditHistory', () => {
    expect(canRead('LECTEUR', 'users')).toBe(false);
    expect(canRead('LECTEUR', 'tenantSettings')).toBe(false);
    expect(canRead('LECTEUR', 'auditHistory')).toBe(false);
  });

  it('LECTEUR peut lire dashboard / sessions / learners (R)', () => {
    expect(canRead('LECTEUR', 'dashboard')).toBe(true);
    expect(canRead('LECTEUR', 'sessions')).toBe(true);
    expect(canRead('LECTEUR', 'learners')).toBe(true);
  });

  it('FORMATEUR ne peut PAS lire leads / preenrollments / invoices', () => {
    expect(canRead('FORMATEUR', 'leads')).toBe(false);
    expect(canRead('FORMATEUR', 'preenrollments')).toBe(false);
    expect(canRead('FORMATEUR', 'invoices')).toBe(false);
  });
});

describe('canWrite', () => {
  it('COMMERCIAL peut écrire learners + leads + preenrollments', () => {
    expect(canWrite('COMMERCIAL', 'learners')).toBe(true);
    expect(canWrite('COMMERCIAL', 'leads')).toBe(true);
    expect(canWrite('COMMERCIAL', 'preenrollments')).toBe(true);
  });

  it('LECTEUR ne peut écrire NULLE part (R seulement)', () => {
    expect(canWrite('LECTEUR', 'learners')).toBe(false);
    expect(canWrite('LECTEUR', 'sessions')).toBe(false);
    expect(canWrite('LECTEUR', 'invoices')).toBe(false);
  });

  it('COMPTABLE peut écrire factures + budget AGEFICE + OPCO mais pas sessions/products', () => {
    expect(canWrite('COMPTABLE', 'invoices')).toBe(true);
    expect(canWrite('COMPTABLE', 'budgetAgefice')).toBe(true);
    expect(canWrite('COMPTABLE', 'opcoFiles')).toBe(true);
    expect(canWrite('COMPTABLE', 'sessions')).toBe(false);
    expect(canWrite('COMPTABLE', 'products')).toBe(false);
  });
});

describe('rolesWithAccess', () => {
  it('users RW = ADMIN only', () => {
    expect(rolesWithAccess('users', 'RW')).toEqual(['ADMIN']);
  });

  it('tenantSettings RW = ADMIN only', () => {
    expect(rolesWithAccess('tenantSettings', 'RW')).toEqual(['ADMIN']);
  });

  it('sessions R = 6 rôles (tous ont au moins R d\'après D-02)', () => {
    const roles = rolesWithAccess('sessions', 'R');
    expect(roles).toHaveLength(6);
    expect(roles).toEqual(
      expect.arrayContaining([
        'ADMIN',
        'MANAGER',
        'COMMERCIAL',
        'FORMATEUR',
        'COMPTABLE',
        'LECTEUR',
      ]),
    );
  });

  it('leads R = 3 rôles (ADMIN/MANAGER/COMMERCIAL — FORMATEUR/COMPTABLE/LECTEUR exclus)', () => {
    const roles = rolesWithAccess('leads', 'R');
    expect(roles).toHaveLength(3);
    expect(roles).toEqual(
      expect.arrayContaining(['ADMIN', 'MANAGER', 'COMMERCIAL']),
    );
  });

  it('auditHistory RW = [] (lecture seule pour ADMIN)', () => {
    expect(rolesWithAccess('auditHistory', 'RW')).toEqual([]);
  });
});

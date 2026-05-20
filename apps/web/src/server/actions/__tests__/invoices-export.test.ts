import { describe, it, expect, vi } from 'vitest';

/**
 * Phase 11 Plan 11-07 Task 2 — Smoke pointer.
 *
 * Coverage complète vit dans la route :
 *   `apps/web/src/app/api/factures/export/__tests__/route.test.ts` (11 tests)
 *
 * Ce fichier reste listé dans `11-VALIDATION.md` Wave 0 — on le garde non-vide
 * pour ne pas régresser le gate Nyquist (pattern utilisé Phase 9.1 quand un
 * fichier de test stub a été "remplacé" par les tests réels d'à côté).
 *
 * Le smoke test ci-dessous vérifie juste que la route handler `GET` est bien
 * exportée et est une fonction — détection précoce d'un casse-pied import path
 * (ex. renommage de fichier route.ts).
 */

// Mock minimal pour permettre l'import sans casser sur side-effects de auth/Prisma.
vi.mock('@qualiof/db', () => ({
  prisma: {
    invoice: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  LegalForm: {
    SAS: 'SAS',
    SARL: 'SARL',
    SASU: 'SASU',
    EURL: 'EURL',
    SA: 'SA',
    EI: 'EI',
    EIRL: 'EIRL',
    AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR',
    AUTRE: 'AUTRE',
  },
  UserRole: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL',
    COMPTABLE: 'COMPTABLE',
    LECTEUR: 'LECTEUR',
  },
}));
vi.mock('@/lib/auth', () => ({
  lucia: {},
  validateRequest: vi.fn(),
}));
vi.mock('@/lib/invoice-audit', () => ({
  logInvoiceEvent: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/factures/export/route';

describe('exportInvoicesXlsx (route /api/factures/export)', () => {
  it('exporte un handler GET fonctionnel', () => {
    expect(typeof GET).toBe('function');
  });
});

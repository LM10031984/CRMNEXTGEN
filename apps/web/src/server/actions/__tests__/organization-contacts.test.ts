import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests des actions `*OrganizationContact` — le chemin qui manquait (16/09/2026).
 *
 * CE QU'ILS PROTÈGENT, ET POURQUOI CE N'EST PAS DU CRUD ORDINAIRE. Ces trois
 * actions alimentent le SEUL endroit où le moteur d'envoi va chercher l'adresse
 * du signataire d'une entreprise (`resoudreEmailRepresentant`, étape 2). Deux
 * invariants en dépendent directement :
 *
 *  1. `isPrimary` EXCLUSIF — `resoudreRepresentantEntreprise` prend le PREMIER
 *     contact principal quand `representative` est vide. Deux principaux, et le
 *     signataire dépendrait de `createdAt`, donc de l'ordre de saisie.
 *  2. L'EMAIL VALIDÉ PAR LE PRÉDICAT DU MOTEUR — si la fiche acceptait une
 *     adresse que l'envoi refuse, on rendrait le blocage invisible jusqu'à
 *     l'envoi, c'est-à-dire exactement le défaut qu'on vient de corriger.
 *
 * Stratégie de mock : pattern `invoice-settings.test.ts`.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    organization: { findFirst: vi.fn() },
    contact: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  Prisma: {},
  LegalForm: { SAS: 'SAS', EI: 'EI', PARTICULIER: 'PARTICULIER' },
  UserRole: { ADMIN: 'ADMIN' },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth', () => ({ validateRequest: vi.fn() }));

vi.mock('@/lib/rbac', () => ({
  requireRole: vi.fn(),
  hasRole: vi.fn(() => true),
  UnauthorizedError: class extends Error {},
  ForbiddenError: class extends Error {},
}));

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import {
  createOrganizationContact,
  updateOrganizationContact,
  deleteOrganizationContact,
} from '../crud-edits';

const ORG = 'org-1';
const UTILISATEUR = { id: 'u-1', tenantId: 't-1', role: 'ADMIN' };

/** Un `tx` qui expose les mêmes mocks : la transaction n'est pas ce qu'on teste. */
function transactionQuiExecute() {
  (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(prisma),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (validateRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: UTILISATEUR });
  (prisma.organization.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: ORG });
  (prisma.contact.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c-1' });
  (prisma.contact.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'c-1',
    organizationId: ORG,
  });
  transactionQuiExecute();
});

describe('createOrganizationContact', () => {
  it('crée le contact et rend son id', async () => {
    const r = await createOrganizationContact({
      organizationId: ORG,
      firstName: '  Jilbert ',
      lastName: 'Nicolas',
      email: 'nicolas.jilbert@ladresse.com',
    });

    expect(r).toEqual({ ok: true, contactId: 'c-1' });
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't-1',
          organizationId: ORG,
          // Les espaces parasites sont retirés : le rapprochement de noms se
          // fait sur ce qui est stocké.
          firstName: 'Jilbert',
          lastName: 'Nicolas',
          email: 'nicolas.jilbert@ladresse.com',
        }),
      }),
    );
  });

  it('démote les autres principaux quand isPrimary est demandé', async () => {
    await createOrganizationContact({
      organizationId: ORG,
      firstName: 'Jilbert',
      lastName: 'Nicolas',
      isPrimary: true,
    });

    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, isPrimary: true },
      data: { isPrimary: false },
    });
  });

  it('ne démote personne quand isPrimary est absent', async () => {
    await createOrganizationContact({ organizationId: ORG, firstName: 'A', lastName: 'B' });
    expect(prisma.contact.updateMany).not.toHaveBeenCalled();
  });

  it('refuse une adresse qui n’en est pas une, et n’écrit rien', async () => {
    const r = await createOrganizationContact({
      organizationId: ORG,
      firstName: 'Jilbert',
      lastName: 'Nicolas',
      email: 'Jilbert Nicolas',
    });

    expect(r.ok).toBe(false);
    expect(r.error).toContain('adresse email valide');
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('accepte un email absent — un contact sans adresse reste un contact', async () => {
    const r = await createOrganizationContact({
      organizationId: ORG,
      firstName: 'Jilbert',
      lastName: 'Nicolas',
      email: '   ',
    });

    expect(r.ok).toBe(true);
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: null }) }),
    );
  });

  it('exige le nom : c’est par lui que le moteur rapproche le contact', async () => {
    const r = await createOrganizationContact({ organizationId: ORG, firstName: 'Jilbert', lastName: '  ' });
    expect(r.ok).toBe(false);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('refuse une organisation d’un autre tenant', async () => {
    (prisma.organization.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await createOrganizationContact({ organizationId: 'org-ailleurs', firstName: 'A', lastName: 'B' });
    expect(r).toEqual({ ok: false, error: 'Organisation introuvable.' });
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('refuse un utilisateur non authentifié', async () => {
    (validateRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: null });
    const r = await createOrganizationContact({ organizationId: ORG, firstName: 'A', lastName: 'B' });
    expect(r.ok).toBe(false);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });
});

describe('updateOrganizationContact', () => {
  it('démote les AUTRES principaux, jamais lui-même', async () => {
    await updateOrganizationContact({
      contactId: 'c-1',
      firstName: 'Jilbert',
      lastName: 'Nicolas',
      isPrimary: true,
    });

    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, isPrimary: true, id: { not: 'c-1' } },
      data: { isPrimary: false },
    });
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-1' } }),
    );
  });

  it('refuse un contact d’un autre tenant', async () => {
    (prisma.contact.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await updateOrganizationContact({ contactId: 'c-x', firstName: 'A', lastName: 'B' });
    expect(r).toEqual({ ok: false, error: 'Contact introuvable.' });
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });
});

describe('deleteOrganizationContact', () => {
  it('supprime le contact du tenant courant', async () => {
    const r = await deleteOrganizationContact({ contactId: 'c-1' });
    expect(r).toEqual({ ok: true });
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
  });

  it('refuse un contact d’un autre tenant', async () => {
    (prisma.contact.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await deleteOrganizationContact({ contactId: 'c-x' });
    expect(r).toEqual({ ok: false, error: 'Contact introuvable.' });
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });
});

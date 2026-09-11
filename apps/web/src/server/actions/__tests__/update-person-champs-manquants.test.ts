import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * « Où est-ce que je mets le numéro de sécu ? » — Laurent, 11/09/2026.
 *
 * Réponse d'alors : nulle part. Le n° de sécurité sociale et l'adresse du
 * domicile se saisissaient UNIQUEMENT à la création d'un apprenant (ou via une
 * inscription en ligne / une préinscription). Une fois la fiche créée, plus
 * aucun écran ne permettait de les corriger — le n° s'affichait en lecture
 * seule dans le bloc « Données sensibles », et ce bloc disparaît quand il est
 * vide, donnant l'impression que le champ n'existe pas.
 *
 * Or les deux sont exigés sur le Cerfa AGEFICE, et arrivent souvent APRÈS
 * l'inscription (pièce d'identité transmise plus tard). Même défaut, même
 * remède que pour la fiche entreprise le 02/09 : un champ affiché doit être
 * éditable quelque part.
 *
 * Test de puissance : retirer la branche `socialSecurityNb` de `updatePerson`
 * fait virer ROUGE « enregistre un n° de sécurité sociale ».
 */

const { personFindFirst, personUpdate, sensitiveUpsert } = vi.hoisted(() => ({
  personFindFirst: vi.fn(),
  personUpdate: vi.fn(),
  sensitiveUpsert: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    person: { findFirst: personFindFirst, update: personUpdate },
    sensitiveData: { upsert: sensitiveUpsert },
  },
  Prisma: {},
}));

vi.mock('@/lib/auth', () => ({
  validateRequest: vi.fn().mockResolvedValue({ user: { tenantId: 'tnt-1', id: 'u-1' } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updatePerson } from '../crud-edits';

const PERSON_ID = 'per-1';

beforeEach(() => {
  personFindFirst.mockReset().mockResolvedValue({ id: PERSON_ID });
  personUpdate.mockReset().mockResolvedValue({ id: PERSON_ID });
  sensitiveUpsert.mockReset().mockResolvedValue({});
});

describe('updatePerson — champs qui n’étaient éditables nulle part', () => {
  it('enregistre un n° de sécurité sociale', async () => {
    const r = await updatePerson({ personId: PERSON_ID, socialSecurityNb: '1 83 12 06 004 123 45' });

    expect(r.ok).toBe(true);
    expect(sensitiveUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: PERSON_ID },
        create: expect.objectContaining({ personId: PERSON_ID, socialSecurityNb: '1 83 12 06 004 123 45' }),
        update: expect.objectContaining({ socialSecurityNb: '1 83 12 06 004 123 45' }),
      }),
    );
  });

  it('efface le n° quand le champ est vidé, sans effacer la pièce d’identité', async () => {
    await updatePerson({ personId: PERSON_ID, socialSecurityNb: '' });

    const appel = sensitiveUpsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(appel.update).toEqual({ socialSecurityNb: null });
  });

  it('enregistre l’adresse du domicile — celle que le Cerfa AGEFICE réclame', async () => {
    await updatePerson({
      personId: PERSON_ID,
      addressStreet: '28 route de la badine',
      addressPostalCode: '06600',
      addressCity: 'Antibes',
    });

    expect(personUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PERSON_ID },
        data: expect.objectContaining({
          personalAddress: { street: '28 route de la badine', postalCode: '06600', city: 'Antibes' },
        }),
      }),
    );
  });

  it('ne touche à rien quand aucun de ces champs n’est fourni', async () => {
    await updatePerson({ personId: PERSON_ID, phone: '0600000000' });

    expect(sensitiveUpsert).not.toHaveBeenCalled();
    const data = (personUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty('personalAddress');
  });

  it('refuse un apprenant d’un autre organisme', async () => {
    personFindFirst.mockResolvedValue(null);

    const r = await updatePerson({ personId: 'per-autre', socialSecurityNb: '1 83 12 06 004 123 45' });

    expect(r.ok).toBe(false);
    expect(sensitiveUpsert).not.toHaveBeenCalled();
  });
});

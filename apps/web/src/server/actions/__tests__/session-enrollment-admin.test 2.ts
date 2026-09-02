import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pilotage du lien public depuis la fiche session (spec 2026-08-28).
 *
 * Deux règles vérifiées ici :
 *  - réouvrir NE change PAS le jeton (les liens déjà diffusés restent valides) ;
 *  - révoquer en génère un nouveau (l'ancien lien meurt sur-le-champ).
 */

const m = vi.hoisted(() => ({
  validateRequest: vi.fn(),
  sessionFindFirst: vi.fn(),
  sessionUpdate: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: { trainingSession: { findFirst: m.sessionFindFirst, update: m.sessionUpdate } },
}));
vi.mock('@/lib/auth', () => ({ validateRequest: m.validateRequest }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  openSessionEnrollments,
  closeSessionEnrollments,
  revokeSessionEnrollmentLink,
} from '../session-enrollment-admin';

beforeEach(() => {
  vi.clearAllMocks();
  m.validateRequest.mockResolvedValue({ user: { id: 'u1', tenantId: 'tenant-1' } });
  m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', publicToken: null });
  m.sessionUpdate.mockImplementation(({ data }: any) => ({ id: 'ses-1', ...data }));
});

describe('openSessionEnrollments', () => {
  it('refuse un utilisateur non authentifié', async () => {
    m.validateRequest.mockResolvedValue({ user: null });
    expect(await openSessionEnrollments('ses-1')).toEqual({ ok: false, error: 'Non authentifié' });
  });

  it('scope la recherche par tenant', async () => {
    await openSessionEnrollments('ses-1');
    expect(m.sessionFindFirst.mock.calls[0]![0].where).toMatchObject({
      id: 'ses-1',
      tenantId: 'tenant-1',
    });
  });

  it('génère un jeton et renvoie l’URL publique', async () => {
    const r = await openSessionEnrollments('ses-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toMatch(/\/inscription\/[0-9a-f]{32}$/);
    expect(m.sessionUpdate.mock.calls[0]![0].data.publicFormClosedAt).toBeNull();
  });

  it('réouvre sans changer le jeton existant', async () => {
    m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', publicToken: 'b'.repeat(32) });
    const r = await openSessionEnrollments('ses-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toContain('b'.repeat(32));
    expect(m.sessionUpdate.mock.calls[0]![0].data.publicToken).toBeUndefined();
  });
});

describe('closeSessionEnrollments', () => {
  it('pose la date de fermeture sans effacer le jeton', async () => {
    m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', publicToken: 'c'.repeat(32) });
    const r = await closeSessionEnrollments('ses-1');
    expect(r.ok).toBe(true);
    const data = m.sessionUpdate.mock.calls[0]![0].data;
    expect(data.publicFormClosedAt).toBeInstanceOf(Date);
    expect(data.publicToken).toBeUndefined();
  });
});

describe('revokeSessionEnrollmentLink', () => {
  it('remplace le jeton par un nouveau', async () => {
    m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', publicToken: 'd'.repeat(32) });
    const r = await revokeSessionEnrollmentLink('ses-1');
    expect(r.ok).toBe(true);
    const data = m.sessionUpdate.mock.calls[0]![0].data;
    expect(data.publicToken).toMatch(/^[0-9a-f]{32}$/);
    expect(data.publicToken).not.toBe('d'.repeat(32));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Formulaire public d'inscription par session (spec 2026-08-28).
 *
 * Deux garanties non négociables, testées ici :
 *  1. AUCUNE ligne en base tant que le formulaire n'est pas soumis (le lien
 *     est diffusé largement — /preinscription, qui crée une PreEnrollment à
 *     chaque visite, remplit la table de dossiers vides).
 *  2. Le n° de sécurité sociale n'est JAMAIS écrit sur PreEnrollment.
 */

const m = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  participantCount: vi.fn(),
  preEnrollmentCount: vi.fn(),
  preEnrollmentFindFirst: vi.fn(),
  preEnrollmentCreate: vi.fn(),
  preEnrollmentUpdate: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingSession: { findUnique: m.sessionFindUnique },
    sessionParticipant: { count: m.participantCount },
    preEnrollment: {
      count: m.preEnrollmentCount,
      findFirst: m.preEnrollmentFindFirst,
      create: m.preEnrollmentCreate,
      update: m.preEnrollmentUpdate,
    },
  },
}));

vi.mock('@/lib/storage', () => ({
  PREENROLLMENT_BUCKET: 'preinscriptions',
  createSignedUploadUrl: m.createSignedUploadUrl,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: m.headers }));

import {
  createSessionEnrollmentUploadUrl,
  submitSessionEnrollmentRequest,
} from '../session-enrollment-public';
import { _resetRateLimit } from '@/lib/enrollment/rate-limit';

const SESSION_OUVERTE = {
  id: 'ses-1',
  tenantId: 'tenant-1',
  publicToken: 'tok',
  publicFormClosedAt: null,
  status: 'OPEN',
  capacityMax: 12,
  endDate: new Date('2026-10-30'),
};

const CHAMPS_VALIDES = {
  firstName: 'Jean',
  lastName: 'Martin',
  email: 'JEAN.MARTIN@Mail.com',
  companySiret: '12345678900012',
  professionalStatus: 'Agent commercial',
  rgpdAccepted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Le compteur anti-spam vit dans le module : sans reset, l'ordre des tests
  // finirait par en faire échouer un pour une raison invisible.
  _resetRateLimit();
  m.sessionFindUnique.mockResolvedValue(SESSION_OUVERTE);
  m.participantCount.mockResolvedValue(2);
  m.preEnrollmentCount.mockResolvedValue(1);
  m.preEnrollmentFindFirst.mockResolvedValue(null);
  m.preEnrollmentCreate.mockResolvedValue({ id: 'pe-1' });
  m.createSignedUploadUrl.mockResolvedValue({
    path: 'p',
    token: 't',
    signedUrl: 'https://storage/put',
  });
  m.headers.mockResolvedValue(new Map([['x-forwarded-for', '10.0.0.1']]));
});

describe('createSessionEnrollmentUploadUrl', () => {
  it('range le fichier sous sessions/{sessionId}/{draftId}/', async () => {
    const r = await createSessionEnrollmentUploadUrl('tok', 'draft-0001', 'CNI', 'pdf');
    expect(r.ok).toBe(true);
    const [bucket, path] = m.createSignedUploadUrl.mock.calls[0]!;
    expect(bucket).toBe('preinscriptions');
    expect(path).toMatch(/^sessions\/ses-1\/draft-0001\/cni-\d+\.pdf$/);
  });

  it('refuse un jeton inconnu', async () => {
    m.sessionFindUnique.mockResolvedValue(null);
    const r = await createSessionEnrollmentUploadUrl('nope', 'draft-0001', 'CNI', 'pdf');
    expect(r).toEqual({ ok: false, error: 'Lien invalide' });
  });

  it('refuse quand le lien est fermé', async () => {
    m.sessionFindUnique.mockResolvedValue({
      ...SESSION_OUVERTE,
      publicFormClosedAt: new Date(),
    });
    const r = await createSessionEnrollmentUploadUrl('tok', 'draft-0001', 'CNI', 'pdf');
    expect(r.ok).toBe(false);
  });

  it('refuse une extension non autorisée', async () => {
    const r = await createSessionEnrollmentUploadUrl('tok', 'draft-0001', 'CNI', 'exe');
    expect(r.ok).toBe(false);
    expect(m.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('refuse un draftId qui tente de remonter dans l’arborescence', async () => {
    const r = await createSessionEnrollmentUploadUrl('tok', '../../etc', 'CNI', 'pdf');
    expect(r.ok).toBe(false);
    expect(m.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe('submitSessionEnrollmentRequest', () => {
  it('crée la demande en SUBMITTED, rattachée à la session', async () => {
    const r = await submitSessionEnrollmentRequest('tok', 'draft-0001', { CNI: 'k1' }, CHAMPS_VALIDES);
    expect(r.ok).toBe(true);
    const data = m.preEnrollmentCreate.mock.calls[0]![0].data;
    expect(data.status).toBe('SUBMITTED');
    expect(data.intendedSessionId).toBe('ses-1');
    expect(data.tenantId).toBe('tenant-1');
    expect(data.cniKey).toBe('k1');
    expect(data.email).toBe('jean.martin@mail.com');
    expect(data.token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('n’écrit JAMAIS le numéro de sécurité sociale sur PreEnrollment', async () => {
    await submitSessionEnrollmentRequest(
      'tok',
      'draft-0001',
      { CNI: 'k1' },
      { ...CHAMPS_VALIDES, socialSecurityNb: '1 85 05 78 006 084 36' },
    );
    const data = m.preEnrollmentCreate.mock.calls[0]![0].data;
    expect(JSON.stringify(data)).not.toContain('006 084');
    expect(JSON.stringify(data)).not.toContain('18505780060843');
  });

  it('rejoue le même draftId sans créer de doublon', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ id: 'pe-existante' });
    const r = await submitSessionEnrollmentRequest('tok', 'draft-0001', { CNI: 'k1' }, CHAMPS_VALIDES);
    expect(r.ok).toBe(true);
    expect(m.preEnrollmentCreate).not.toHaveBeenCalled();
    expect(m.preEnrollmentUpdate).toHaveBeenCalled();
  });

  it('refuse sans consentement RGPD', async () => {
    const r = await submitSessionEnrollmentRequest(
      'tok',
      'draft-0001',
      { CNI: 'k1' },
      { ...CHAMPS_VALIDES, rgpdAccepted: false },
    );
    expect(r.ok).toBe(false);
    expect(m.preEnrollmentCreate).not.toHaveBeenCalled();
  });

  it('refuse sans aucune pièce', async () => {
    const r = await submitSessionEnrollmentRequest('tok', 'draft-0001', {}, CHAMPS_VALIDES);
    expect(r.ok).toBe(false);
  });

  it('refuse quand la session est complète', async () => {
    m.participantCount.mockResolvedValue(11);
    m.preEnrollmentCount.mockResolvedValue(1);
    const r = await submitSessionEnrollmentRequest('tok', 'draft-0001', { CNI: 'k1' }, CHAMPS_VALIDES);
    expect(r.ok).toBe(false);
    expect(m.preEnrollmentCreate).not.toHaveBeenCalled();
  });
});

describe('limitation anti-spam', () => {
  it('bloque la 6ᵉ soumission de la même IP en une heure', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await submitSessionEnrollmentRequest(
        'tok',
        `draft-000${i}`,
        { CNI: 'k1' },
        CHAMPS_VALIDES,
      );
      expect(ok.ok).toBe(true);
    }
    const r = await submitSessionEnrollmentRequest('tok', 'draft-9999', { CNI: 'k1' }, CHAMPS_VALIDES);
    expect(r).toEqual({ ok: false, error: 'Trop de demandes envoyées. Réessaie dans une heure.' });
  });
});
